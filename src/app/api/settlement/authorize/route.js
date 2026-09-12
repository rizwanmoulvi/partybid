import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import { signSettlement } from '@/lib/aqua-signer';
import { buildStrategy } from '@/lib/aqua-strategy';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';
const AQUA_ADDRESS = '0xBf4140CD28b03479aD2F129c382b673101CF442B';
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';

const aquaAbi = [
  'function getBalance(address maker, address app, bytes32 strategyHash, address token) view returns (uint256)'
];

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }
    
    const privy = getPrivyClient();
    if (!privy) {
      return NextResponse.json({ error: 'Server misconfiguration: Missing Privy credentials' }, { status: 500 });
    }

    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
    } catch (error) {
      console.error('Token verification failed:', error);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const userId = verifiedClaims.user_id;

    const body = await req.json();
    const { settlementId } = body;

    if (!settlementId) {
      return NextResponse.json({ error: 'Bad Request: Missing settlementId' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // 1. Load Settlement
    const settlement = await db.collection('settlements').findOne({ id: settlementId });
    if (!settlement) {
      return NextResponse.json({ error: 'Not Found: Settlement missing' }, { status: 404 });
    }

    if (settlement.status !== 'PENDING') {
      return NextResponse.json({ error: 'Conflict: Settlement must be PENDING' }, { status: 409 });
    }

    // Validate outcome (BIDDER_RELEASE is handled separately via dock)
    if (!['PLAYER_PAYOUT', 'PLATFORM_PAYOUT', 'BIDDER_RELEASE'].includes(settlement.outcome)) {
      return NextResponse.json({ error: 'Conflict: Unsupported outcome' }, { status: 409 });
    }

    // 2. Load Associated Records
    const party = await db.collection('parties').findOne({ id: settlement.partyId });
    const songReq = await db.collection('song_requests').findOne({ id: settlement.songRequestId });
    const bid = await db.collection('bids').findOne({ id: settlement.bidId });

    if (!party || !songReq || !bid) {
      return NextResponse.json({ error: 'Not Found: Associated records missing' }, { status: 404 });
    }

    // Validate relationships
    if (songReq.partyId !== party.id || bid.partyId !== party.id || bid.songRequestId !== songReq.id) {
      return NextResponse.json({ error: 'Conflict: Mismatched cross-party records' }, { status: 409 });
    }

    // 3. Resolve maker wallet (server-authoritative, never trust client)
    let makerWallet = bid.maker; // Phase 14A bids store maker directly
    if (!makerWallet) {
      const makerUser = await db.collection('users').findOne({ id: bid.userId });
      if (makerUser?.walletAddress) makerWallet = makerUser.walletAddress;
      if (!makerWallet) {
        const membership = await db.collection('party_members').findOne({ partyId: party.id, privyUserId: bid.userId });
        makerWallet = membership?.walletAddress;
      }
    }
    if (!makerWallet || !ethers.isAddress(makerWallet)) {
      return NextResponse.json({ error: 'Conflict: Invalid maker wallet address' }, { status: 409 });
    }

    // 4. Build canonical strategy (uses bid.id as entropy — deterministic)
    const { strategyBytes, strategyHash } = buildStrategy(makerWallet, bid.id);

    // 5. Verify Aqua virtual balance exists and matches before authorizing
    //    This prevents the backend from authorizing a pull when funds are not actually committed.
    if (settlement.outcome !== 'BIDDER_RELEASE') {
      // Only verify for pull outcomes; dock verification done in the dock endpoint
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
        const aqua = new ethers.Contract(AQUA_ADDRESS, aquaAbi, provider);
        const aquaBalance = await aqua.getBalance(makerWallet, PARTYBID_AQUA_APP, strategyHash, WUSDC_ADDRESS);
        const expectedWei = ethers.parseUnits(bid.amount.toString(), 18);
        if (aquaBalance < expectedWei) {
          const actualFormatted = ethers.formatUnits(aquaBalance, 18);
          return NextResponse.json({
            error: `Conflict: Aqua virtual balance (${actualFormatted} WUSDC) is less than settlement amount (${bid.amount} WUSDC). The Aqua position may not exist.`
          }, { status: 409 });
        }
      } catch (aquaErr) {
        console.error('Aqua balance verification failed:', aquaErr);
        return NextResponse.json({ error: 'Internal Server Error: Could not verify Aqua position' }, { status: 500 });
      }
    }

    // 6. Resolve recipient (server-authoritative — never trust client)
    let recipientWallet = settlement.recipient;
    if (settlement.outcome === 'PLAYER_PAYOUT') {
      const recUser = await db.collection('users').findOne({ id: songReq.userId });
      if (recUser?.walletAddress) recipientWallet = recUser.walletAddress;
      if (!ethers.isAddress(recipientWallet)) {
        return NextResponse.json({ error: 'Conflict: Invalid recipient wallet address' }, { status: 409 });
      }
    } else if (settlement.outcome === 'PLATFORM_PAYOUT') {
      recipientWallet = process.env.PLATFORM_RECIPIENT;
      if (!recipientWallet || !ethers.isAddress(recipientWallet)) {
        return NextResponse.json({ error: 'Server configuration: Missing or invalid PLATFORM_RECIPIENT' }, { status: 500 });
      }
    }
    // BIDDER_RELEASE: recipient is the maker (no pull occurs, but we still sign for completeness if needed)

    // 7. Sign the settlement
    const privateKey = process.env.AQUA_SETTLEMENT_PRIVATE_KEY || process.env.AQUA_TEST_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ error: 'Server configuration: Missing settlement signer key' }, { status: 500 });
    }

    const settlementData = {
      id: settlement.id,
      partyId: party.id,
      songRequestId: songReq.id,
      bidId: bid.id,
      makerWallet,
      strategyHash,
      amount: settlement.amount,
      outcome: settlement.outcome,
      recipientWallet: recipientWallet || makerWallet, // fallback for BIDDER_RELEASE
    };

    const result = await signSettlement(privateKey, settlementData);

    // Convert BigInts to string for JSON serialization
    const safeMessage = {};
    for (const [k, v] of Object.entries(result.message)) {
      safeMessage[k] = typeof v === 'bigint' ? v.toString() : v;
    }

    return NextResponse.json({
      settlementId: settlement.id,
      strategyBytes,
      strategyHash,
      typedData: {
        domain: result.domain,
        types: result.types,
        primaryType: result.primaryType,
        message: safeMessage
      },
      signature: result.signature
    }, { status: 200 });

  } catch (error) {
    console.error('Error authorizing settlement:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}

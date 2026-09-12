import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import { buildStrategy } from '@/lib/aqua-strategy';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';
const AQUA_ADDRESS = '0xBf4140CD28b03479aD2F129c382b673101CF442B';
const CHAIN_ID = 5042002;

/**
 * POST /api/parties/[partyId]/requests/[requestId]/bid/confirm
 *
 * Step 2 of 2 in the Aqua bid flow.
 * Called AFTER the frontend has successfully executed Aqua.ship().
 *
 * This endpoint independently verifies:
 *  1. Privy auth
 *  2. Party membership
 *  3. Song request ownership
 *  4. The ship transaction receipt on-chain
 *  5. The Aqua virtual balance exists for the exact (maker, strategyHash, WUSDC, amount)
 *  6. The strategyHash matches the canonical deterministic hash for (maker, bidId)
 *
 * Only after all verifications pass does it write the bid to MongoDB.
 */
export async function POST(req, { params }) {
  try {
    const { partyId: rawPartyId, requestId } = await params;
    const partyId = rawPartyId.toUpperCase();

    // --- AUTH ---
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });

    const privy = getPrivyClient();
    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
    } catch {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }
    const privyUserId = verifiedClaims.user_id;

    // --- BODY ---
    let body;
    try { body = await req.json(); } catch {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON' }, { status: 400 });
    }

    const { bidId, amount, shipTransactionHash } = body;

    if (!bidId || typeof bidId !== 'string') {
      return NextResponse.json({ error: 'Bad Request: Missing bidId' }, { status: 400 });
    }
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Bad Request: Invalid amount' }, { status: 400 });
    }
    if (!shipTransactionHash || !/^0x[A-Fa-f0-9]{64}$/.test(shipTransactionHash)) {
      return NextResponse.json({ error: 'Bad Request: Invalid shipTransactionHash' }, { status: 400 });
    }

    // --- DB ---
    const client = await clientPromise;
    const db = client.db();

    // Verify membership
    const party = await db.collection('parties').findOne({ id: partyId });
    if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    const isDJ = party.djUserId === privyUserId;
    if (!isDJ) {
      const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
      if (!membership) return NextResponse.json({ error: 'Forbidden: Must be a party member' }, { status: 403 });
    }

    // Verify song request
    const songReq = await db.collection('song_requests').findOne({ id: requestId, partyId });
    if (!songReq) return NextResponse.json({ error: 'SongRequest not found' }, { status: 404 });
    if (songReq.userId !== privyUserId) {
      return NextResponse.json({ error: 'Forbidden: You can only bid on your own requests' }, { status: 403 });
    }

    // No existing bid allowed (bid increases disabled)
    const existingBid = await db.collection('bids').findOne({ partyId, songRequestId: requestId, userId: privyUserId, status: 'ACTIVE' });
    if (existingBid) {
      return NextResponse.json({ error: 'Conflict: Bid already exists for this request' }, { status: 409 });
    }

    // Get server-authoritative maker address
    const user = await db.collection('users').findOne({ id: privyUserId });
    let makerAddress = user?.walletAddress;
    if (!makerAddress) {
      const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
      makerAddress = membership?.walletAddress;
    }
    if (!makerAddress || !ethers.isAddress(makerAddress)) {
      return NextResponse.json({ error: 'Conflict: No wallet address on record' }, { status: 409 });
    }

    // --- VERIFY STRATEGY HASH ---
    const { strategyHash: expectedStrategyHash } = buildStrategy(makerAddress, bidId);

    // --- VERIFY SHIP TRANSACTION ON-CHAIN ---
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

    const network = await provider.getNetwork();
    if (Number(network.chainId) !== CHAIN_ID) {
      return NextResponse.json({ error: 'Internal Server Error: Wrong network' }, { status: 500 });
    }

    let receipt;
    try {
      receipt = await provider.getTransactionReceipt(shipTransactionHash);
    } catch {
      return NextResponse.json({ error: 'Bad Request: Could not fetch transaction receipt' }, { status: 400 });
    }

    if (!receipt) {
      return NextResponse.json({ error: 'Bad Request: Transaction not found on chain' }, { status: 400 });
    }
    if (receipt.status !== 1) {
      return NextResponse.json({ error: 'Bad Request: Ship transaction failed on chain' }, { status: 400 });
    }
    if (receipt.to?.toLowerCase() !== AQUA_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Bad Request: Transaction does not target Aqua' }, { status: 400 });
    }

    // --- VERIFY AQUA VIRTUAL BALANCE ---
    const aquaAbi = [
      'function rawBalances(address maker, address app, bytes32 strategyHash, address token) view returns (uint248 balance, uint8 tokensCount)'
    ];
    const aqua = new ethers.Contract(AQUA_ADDRESS, aquaAbi, provider);
    const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';

    let aquaBalance;
    try {
      const [bal] = await aqua.rawBalances(makerAddress, PARTYBID_AQUA_APP, expectedStrategyHash, WUSDC_ADDRESS);
      aquaBalance = bal;
    } catch (e) {
      console.error('Aqua rawBalances error:', e);
      return NextResponse.json({ error: 'Bad Request: Could not verify Aqua virtual balance' }, { status: 400 });
    }

    const roundedAmount = Math.round(amount * 100) / 100;
    const expectedWei = ethers.parseUnits(roundedAmount.toString(), 18);

    if (aquaBalance < expectedWei) {
      const actualFormatted = ethers.formatUnits(aquaBalance, 18);
      return NextResponse.json({ 
        error: `Bad Request: Aqua virtual balance (${actualFormatted} WUSDC) is less than required (${roundedAmount} WUSDC)` 
      }, { status: 400 });
    }

    // --- PERSIST BID ---
    const now = new Date();
    const bidsCollection = db.collection('bids');

    let result;
    try {
      result = await bidsCollection.insertOne({
        id: bidId,
        partyId,
        songRequestId: requestId,
        userId: privyUserId,
        amount: roundedAmount,
        status: 'ACTIVE',
        // Aqua metadata for traceability
        maker: makerAddress,
        strategyHash: expectedStrategyHash,
        shipTransactionHash,
        chainId: CHAIN_ID,
        token: WUSDC_ADDRESS,
        createdAt: now,
        updatedAt: now
      });
    } catch (insertError) {
      if (insertError.code === 11000) {
        return NextResponse.json({ error: 'Conflict: Bid already exists' }, { status: 409 });
      }
      throw insertError;
    }

    const savedBid = await bidsCollection.findOne({ id: bidId });
    const { _id, ...safeBid } = savedBid;

    return NextResponse.json({ bid: safeBid, shipTransactionHash }, { status: 200 });

  } catch (error) {
    console.error('Error confirming bid:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

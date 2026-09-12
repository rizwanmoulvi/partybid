import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import { buildStrategy } from '@/lib/aqua-strategy';
import { ethers } from 'ethers';
import crypto from 'crypto';

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';
const CHAIN_ID = 5042002;

const wusdcAbi = ['function balanceOf(address) view returns (uint256)'];

/**
 * POST /api/parties/[partyId]/requests/[requestId]/bid/prepare
 *
 * Step 1 of 2 in the Aqua bid flow.
 * Validates the bid amount, derives/reserves the bidId, and returns
 * strategyBytes + strategyHash so the frontend can call Aqua.ship().
 *
 * Does NOT write any bid to MongoDB yet.
 * The bid is persisted only after the frontend confirms the ship() transaction
 * via POST /bid/confirm.
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

    const { amount } = body;

    // Validate amount
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Bad Request: Amount must be a positive number' }, { status: 400 });
    }
    // Reject more than 2 decimal places
    const rounded = Math.round(amount * 100) / 100;
    if (Math.abs(rounded - amount) > 1e-10) {
      return NextResponse.json({ error: 'Bad Request: Amount must have at most 2 decimal places' }, { status: 400 });
    }
    if (rounded < 0.01) {
      return NextResponse.json({ error: 'Bad Request: Minimum bid is 0.01 WUSDC' }, { status: 400 });
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

    // Verify song request ownership
    const songReq = await db.collection('song_requests').findOne({ id: requestId, partyId });
    if (!songReq) return NextResponse.json({ error: 'SongRequest not found' }, { status: 404 });
    if (songReq.userId !== privyUserId) {
      return NextResponse.json({ error: 'Forbidden: You can only bid on your own requests' }, { status: 403 });
    }

    // Get user wallet address (server-authoritative — never trust client)
    const user = await db.collection('users').findOne({ id: privyUserId });
    let makerAddress = user?.walletAddress;
    if (!makerAddress) {
      const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
      makerAddress = membership?.walletAddress;
    }
    if (!makerAddress || !ethers.isAddress(makerAddress)) {
      return NextResponse.json({ error: 'Conflict: No wallet address on record. Please rejoin the party.' }, { status: 409 });
    }

    // Check on-chain WUSDC balance
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const wusdc = new ethers.Contract(WUSDC_ADDRESS, wusdcAbi, provider);
    const wusdcBal = await wusdc.balanceOf(makerAddress);
    const requiredWei = ethers.parseUnits(rounded.toString(), 18);

    // Check active bids across all parties to compute committed amount
    const activeBids = await db.collection('bids').find({ userId: privyUserId, status: 'ACTIVE' }).toArray();
    
    // Check if there's an existing bid for this request (allow replacement)
    const existingBid = activeBids.find(b => b.songRequestId === requestId);
    const existingBidWei = existingBid ? ethers.parseUnits(existingBid.amount.toString(), 18) : 0n;
    
    const committedWei = activeBids.reduce((sum, b) => {
      return sum + ethers.parseUnits(b.amount.toString(), 18);
    }, 0n);
    
    // Available = balance - total committed + existing bid for this request (since we're replacing it)
    const availableWei = wusdcBal - committedWei + existingBidWei;
    if (requiredWei > availableWei) {
      const availableFormatted = parseFloat(ethers.formatUnits(availableWei, 18)).toFixed(4);
      return NextResponse.json({ 
        error: `Insufficient available WUSDC. Available: ${availableFormatted} WUSDC` 
      }, { status: 400 });
    }

    // Determine bidId: reuse existing if it exists, or generate fresh
    // Important: for Aqua, each unique (maker, strategyHash) is a distinct position.
    // Bid increases require a new strategy since the amount differs, and old position would be stranded.
    // THEREFORE: bid increases are disabled. Only first bids are supported.
    if (existingBid) {
      return NextResponse.json({ 
        error: 'Bid already exists. Bid increases are not supported yet. Your current bid remains active.' 
      }, { status: 409 });
    }

    const bidId = crypto.randomUUID();

    // Build the canonical strategy
    const { strategyBytes, strategyHash } = buildStrategy(makerAddress, bidId);

    // Return the prepared bid payload for frontend to use in ship()
    return NextResponse.json({
      bidId,
      makerAddress,
      amount: rounded,
      amountWei: requiredWei.toString(),
      strategyBytes,
      strategyHash,
      wusdcAddress: WUSDC_ADDRESS,
    }, { status: 200 });

  } catch (error) {
    console.error('Error preparing bid:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

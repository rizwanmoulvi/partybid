import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const AQUA_ADDRESS = '0xBf4140CD28b03479aD2F129c382b673101CF442B';
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';
const EXPECTED_CHAIN_ID = 5042002;

const aquaAbi = [
  'function getBalance(address maker, address app, bytes32 strategyHash, address token) view returns (uint256)',
];

// SkipDock event emitted by PartyBidAquaApp when dock() is called
// Adjust to match your actual contract's dock event signature if different
const appAbi = [
  'event BidReleased(bytes32 indexed strategyHash, address indexed maker, address token, uint256 amount)',
];

/**
 * POST /api/parties/[partyId]/requests/[requestId]/settlement/release
 *
 * Called by the frontend after a successful Aqua.dock() (bid release) transaction.
 *
 * Independently verifies:
 *  1. Auth + membership
 *  2. Settlement exists and is PENDING with BIDDER_RELEASE outcome
 *  3. Transaction receipt targets Aqua contract
 *  4. Aqua virtual balance is now 0 (position cleared)
 *
 * Then transitions MongoDB settlement PENDING → COMPLETED and bid ACTIVE → SETTLED.
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
    const { transactionHash } = body;
    if (!transactionHash || !/^0x[A-Fa-f0-9]{64}$/.test(transactionHash)) {
      return NextResponse.json({ error: 'Bad Request: Invalid transactionHash' }, { status: 400 });
    }

    // --- DB ---
    const client = await clientPromise;
    const db = client.db();

    const party = await db.collection('parties').findOne({ id: partyId });
    if (!party) return NextResponse.json({ error: 'Party not found' }, { status: 404 });

    const isDJ = party.djUserId === privyUserId;
    if (!isDJ) {
      const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
      if (!membership) return NextResponse.json({ error: 'Forbidden: Must be a party member' }, { status: 403 });
    }

    // Load settlement
    const settlement = await db.collection('settlements').findOne({ partyId, songRequestId: requestId });
    if (!settlement) return NextResponse.json({ error: 'Not Found: Settlement missing' }, { status: 404 });

    if (settlement.outcome !== 'BIDDER_RELEASE') {
      return NextResponse.json({ error: 'Bad Request: Settlement outcome is not BIDDER_RELEASE' }, { status: 400 });
    }

    // Idempotency
    if (settlement.status === 'COMPLETED') {
      if (settlement.transactionHash === transactionHash) {
        const { _id, ...s } = settlement;
        return NextResponse.json({ settlement: s }, { status: 200 });
      } else {
        return NextResponse.json({ error: 'Conflict: Settlement already completed with a different transaction' }, { status: 409 });
      }
    }
    if (settlement.status !== 'PENDING') {
      return NextResponse.json({ error: `Conflict: Settlement status is ${settlement.status}` }, { status: 409 });
    }

    // Load bid
    const bid = await db.collection('bids').findOne({ id: settlement.bidId });
    if (!bid) return NextResponse.json({ error: 'Not Found: Bid missing' }, { status: 404 });

    const strategyHash = bid.strategyHash;
    const makerAddress = bid.maker;
    if (!strategyHash || !makerAddress) {
      return NextResponse.json({ error: 'Conflict: Bid missing Aqua metadata (strategyHash or maker)' }, { status: 409 });
    }

    // --- VERIFY RECEIPT ON-CHAIN ---
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
      return NextResponse.json({ error: 'Internal Server Error: Wrong network' }, { status: 500 });
    }

    let receipt;
    try {
      receipt = await provider.getTransactionReceipt(transactionHash);
    } catch {
      return NextResponse.json({ error: 'Bad Request: Could not fetch transaction' }, { status: 400 });
    }
    if (!receipt) return NextResponse.json({ error: 'Bad Request: Transaction not found on chain' }, { status: 400 });
    if (receipt.status !== 1) return NextResponse.json({ error: 'Bad Request: Transaction failed on chain' }, { status: 400 });
    // dock() is called on Aqua itself
    if (receipt.to?.toLowerCase() !== AQUA_ADDRESS.toLowerCase()) {
      return NextResponse.json({ error: 'Bad Request: Transaction does not target Aqua contract' }, { status: 400 });
    }

    // --- VERIFY AQUA POSITION IS CLEARED ---
    const aqua = new ethers.Contract(AQUA_ADDRESS, aquaAbi, provider);
    let remainingBalance;
    try {
      remainingBalance = await aqua.getBalance(makerAddress, PARTYBID_AQUA_APP, strategyHash, WUSDC_ADDRESS);
    } catch (e) {
      console.error('Aqua getBalance error:', e);
      return NextResponse.json({ error: 'Bad Request: Could not verify Aqua position was cleared' }, { status: 400 });
    }

    if (remainingBalance !== 0n) {
      const remaining = ethers.formatUnits(remainingBalance, 18);
      return NextResponse.json({
        error: `Bad Request: Aqua position still has ${remaining} WUSDC. Release may not have succeeded.`
      }, { status: 400 });
    }

    // --- UPDATE DB ---
    const now = new Date();

    // Mark bid as SETTLED
    await db.collection('bids').updateOne(
      { _id: bid._id },
      { $set: { status: 'SETTLED', updatedAt: now } }
    );

    // Mark song request as RESOLVED
    await db.collection('song_requests').updateOne(
      { id: requestId, partyId },
      { $set: { status: 'RESOLVED', updatedAt: now } }
    );

    // Mark settlement COMPLETED
    const updateResult = await db.collection('settlements').findOneAndUpdate(
      { _id: settlement._id, status: 'PENDING' },
      { $set: { status: 'COMPLETED', transactionHash, updatedAt: now } },
      { returnDocument: 'after' }
    );

    if (!updateResult) {
      return NextResponse.json({ error: 'Conflict: Settlement was modified concurrently' }, { status: 409 });
    }

    const { _id, ...safeDoc } = updateResult;
    return NextResponse.json({ settlement: safeDoc }, { status: 200 });

  } catch (error) {
    console.error('Error confirming bid release:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

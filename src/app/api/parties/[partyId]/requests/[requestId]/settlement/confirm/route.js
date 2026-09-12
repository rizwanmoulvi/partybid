import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';
const EXPECTED_CHAIN_ID = 5042002;

const appAbi = [
  "event SettlementExecuted(bytes32 indexed settlementId, bytes32 partyId, bytes32 songRequestId, bytes32 bidId, address indexed maker, address token, uint256 amount, bytes32 outcome, address indexed recipient)"
];

async function verifyAuthAndMembership(req, partyId) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.split(' ')[1];
  if (!token) return { error: 'Unauthorized: Missing token', status: 401 };

  const privy = getPrivyClient();
  let verifiedClaims;
  try {
    verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
  } catch (error) {
    return { error: 'Unauthorized: Invalid token', status: 401 };
  }

  const privyUserId = verifiedClaims.user_id;
  const client = await clientPromise;
  const db = client.db();

  const party = await db.collection('parties').findOne({ id: partyId });
  if (!party) return { error: 'Party not found', status: 404 };

  const isDJ = party.djUserId === privyUserId;
  if (!isDJ) {
    const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
    if (!membership) return { error: 'Forbidden: Must be a party member', status: 403 };
  }

  return { privyUserId, db, client };
}

export async function POST(req, { params }) {
  try {
    const { partyId: rawPartyId, requestId } = await params;
    const partyId = rawPartyId.toUpperCase();

    const auth = await verifyAuthAndMembership(req, partyId);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { db } = auth;

    let body;
    try {
      body = await req.json();
    } catch(e) {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON' }, { status: 400 });
    }

    const { transactionHash } = body;
    if (!transactionHash || typeof transactionHash !== 'string' || !/^0x([A-Fa-f0-9]{64})$/.test(transactionHash)) {
      return NextResponse.json({ error: 'Bad Request: Invalid transactionHash format' }, { status: 400 });
    }

    // Load existing settlement
    const settlement = await db.collection('settlements').findOne({ partyId, songRequestId: requestId });
    if (!settlement) {
      return NextResponse.json({ error: 'Not Found: Settlement missing' }, { status: 404 });
    }

    // Idempotency check
    if (settlement.status === 'COMPLETED') {
      if (settlement.transactionHash === transactionHash) {
        return NextResponse.json({ settlement: { ...settlement, _id: undefined } }, { status: 200 });
      } else {
        return NextResponse.json({ error: 'Conflict: Settlement already completed with a different transaction' }, { status: 409 });
      }
    }

    if (settlement.status !== 'PENDING') {
      return NextResponse.json({ error: `Conflict: Settlement status is ${settlement.status}, expected PENDING` }, { status: 409 });
    }

    // We need the recipient to verify it matches
    // Depending on PLAYER_PAYOUT or PLATFORM_PAYOUT
    let expectedRecipient = settlement.recipient;
    if (settlement.outcome === 'PLAYER_PAYOUT') {
      const songReq = await db.collection('song_requests').findOne({ id: requestId });
      const recUser = await db.collection('users').findOne({ id: songReq.userId });
      if (recUser && recUser.walletAddress) {
        expectedRecipient = recUser.walletAddress;
      }
    } else if (settlement.outcome === 'PLATFORM_PAYOUT') {
      expectedRecipient = process.env.PLATFORM_RECIPIENT;
    }

    // Verify transaction independently
    const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== EXPECTED_CHAIN_ID) {
      return NextResponse.json({ error: 'Internal Server Error: Wrong network' }, { status: 500 });
    }

    let tx, receipt;
    try {
      tx = await provider.getTransaction(transactionHash);
      receipt = await provider.getTransactionReceipt(transactionHash);
    } catch (e) {
      return NextResponse.json({ error: 'Bad Request: Could not fetch transaction' }, { status: 400 });
    }

    if (!tx || !receipt) {
      return NextResponse.json({ error: 'Bad Request: Transaction not found on chain' }, { status: 400 });
    }

    if (tx.to.toLowerCase() !== PARTYBID_AQUA_APP.toLowerCase()) {
      return NextResponse.json({ error: 'Bad Request: Transaction does not target PartyBidAquaApp' }, { status: 400 });
    }

    if (receipt.status !== 1) {
      return NextResponse.json({ error: 'Bad Request: Transaction failed on chain' }, { status: 400 });
    }

    // Decode event
    const iface = new ethers.Interface(appAbi);
    let foundValidEvent = false;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === PARTYBID_AQUA_APP.toLowerCase()) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed && parsed.name === 'SettlementExecuted') {
            const evPartyId = parsed.args.partyId;
            const evSongReqId = parsed.args.songRequestId;
            const evAmount = parsed.args.amount;
            const evOutcome = parsed.args.outcome;
            const evRecipient = parsed.args.recipient;
            const evToken = parsed.args.token;
            
            const expectedPartyIdHash = ethers.id(settlement.partyId);
            const expectedSongReqIdHash = ethers.id(settlement.songRequestId);
            const expectedOutcomeHash = ethers.id(settlement.outcome);
            const expectedAmount = ethers.parseUnits(settlement.amount.toString(), 18);

            if (evPartyId === expectedPartyIdHash &&
                evSongReqId === expectedSongReqIdHash &&
                evOutcome === expectedOutcomeHash &&
                evRecipient.toLowerCase() === expectedRecipient.toLowerCase() &&
                evToken.toLowerCase() === WUSDC_ADDRESS.toLowerCase() &&
                evAmount === expectedAmount) {
              foundValidEvent = true;
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (!foundValidEvent) {
      return NextResponse.json({ error: 'Bad Request: Transaction does not correspond to expected settlement parameters' }, { status: 400 });
    }

    // Verify successful! Update DB
    const now = new Date();
    const updateResult = await db.collection('settlements').findOneAndUpdate(
      { _id: settlement._id, status: 'PENDING' },
      { 
        $set: { 
          status: 'COMPLETED',
          transactionHash,
          updatedAt: now
        } 
      },
      { returnDocument: 'after' }
    );

    if (!updateResult) {
      return NextResponse.json({ error: 'Conflict: Settlement was modified concurrently' }, { status: 409 });
    }

    // Mark bid as SETTLED so it no longer appears in the active queue
    await db.collection('bids').updateOne(
      { id: settlement.bidId },
      { $set: { status: 'SETTLED', updatedAt: now } }
    );

    // Mark song request as RESOLVED
    await db.collection('song_requests').updateOne(
      { id: requestId, partyId },
      { $set: { status: 'RESOLVED', updatedAt: now } }
    );

    const { _id, ...safeDoc } = updateResult;
    return NextResponse.json({ settlement: safeDoc }, { status: 200 });

  } catch (error) {
    console.error('Error confirming settlement:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

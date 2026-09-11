import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import crypto from 'crypto';

async function verifyAuthAndMembership(req, partyId) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return { error: 'Unauthorized: Missing token', status: 401 };
  }

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
  if (!party) {
    return { error: 'Party not found', status: 404 };
  }

  const isDJ = party.djUserId === privyUserId;
  if (!isDJ) {
    const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
    if (!membership) {
      return { error: 'Forbidden: Must be a party member', status: 403 };
    }
  }

  return { privyUserId, db, client };
}

export async function GET(req, { params }) {
  try {
    const { partyId: rawPartyId, requestId } = await params;
    const partyId = rawPartyId.toUpperCase();

    const auth = await verifyAuthAndMembership(req, partyId);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { privyUserId, db } = auth;

    // Verify SongRequest exists and belongs to party
    const songReq = await db.collection('song_requests').findOne({ id: requestId, partyId });
    if (!songReq) {
      return NextResponse.json({ error: 'SongRequest not found in this party' }, { status: 404 });
    }

    // Fetch the authenticated user's current bid
    const bid = await db.collection('bids').findOne({ 
      partyId, 
      songRequestId: requestId, 
      userId: privyUserId 
    });

    const { getUserBalance } = await import('@/lib/balance');
    const balance = await getUserBalance(partyId, privyUserId);

    if (!bid) {
      return NextResponse.json({ bid: null, balance }, { status: 200 });
    }

    const { _id, ...safeBid } = bid;
    return NextResponse.json({ bid: safeBid, balance }, { status: 200 });
  } catch (error) {
    console.error('Error fetching bid:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const { partyId: rawPartyId, requestId } = await params;
    const partyId = rawPartyId.toUpperCase();

    const auth = await verifyAuthAndMembership(req, partyId);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { privyUserId, db } = auth;

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON' }, { status: 400 });
    }

    const { amount } = body;
    if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Bad Request: Amount must be a positive number' }, { status: 400 });
    }

    // Round to 2 decimal places max
    const sanitizedAmount = Math.round(amount * 100) / 100;

    // Verify SongRequest exists and belongs to party
    const songReq = await db.collection('song_requests').findOne({ id: requestId, partyId });
    if (!songReq) {
      return NextResponse.json({ error: 'SongRequest not found in this party' }, { status: 404 });
    }

    // Verify authenticated user is the requester
    if (songReq.userId !== privyUserId) {
      return NextResponse.json({ error: 'Forbidden: You can only bid on your own requests' }, { status: 403 });
    }

    const { getUserBalance } = await import('@/lib/balance');
    const balanceBeforeBid = await getUserBalance(partyId, privyUserId, requestId);
    
    if (sanitizedAmount > balanceBeforeBid.availableBalance) {
      return NextResponse.json({ error: 'Insufficient available balance' }, { status: 400 });
    }

    const now = new Date();
    const bidId = crypto.randomUUID();
    const bidsCollection = db.collection('bids');

    let result;
    try {
      result = await bidsCollection.findOneAndUpdate(
        { partyId, songRequestId: requestId, userId: privyUserId },
        { 
          $set: { 
            amount: sanitizedAmount, 
            status: "ACTIVE", 
            updatedAt: now 
          },
          $setOnInsert: {
            id: bidId,
            partyId,
            songRequestId: requestId,
            userId: privyUserId,
            createdAt: now
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (upsertError) {
      if (upsertError.code === 11000) {
        return NextResponse.json({ error: 'Conflict: Unique index violation during bid placement' }, { status: 409 });
      }
      throw upsertError;
    }

    const { _id, ...safeBid } = result;
    const finalBalance = await getUserBalance(partyId, privyUserId);
    
    return NextResponse.json({ bid: safeBid, balance: finalBalance }, { status: 200 });

  } catch (error) {
    console.error('Error placing bid:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

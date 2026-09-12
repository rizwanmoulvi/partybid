import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import crypto from 'crypto';
import { createSettlementForRequest } from '@/lib/settlement';

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

    const votes = await db.collection('votes').find({ partyId, songRequestId: requestId }).toArray();
    
    let likedVotes = 0;
    let notLikedVotes = 0;
    let currentUserVote = null;

    for (const v of votes) {
      if (v.vote === 'LIKED') likedVotes++;
      if (v.vote === 'NOT_LIKED') notLikedVotes++;
      if (v.userId === privyUserId) currentUserVote = v.vote;
    }

    const totalVotes = likedVotes + notLikedVotes;
    let result = null;

    // Strict majority required; tie → null
    if (likedVotes > notLikedVotes) result = 'LIKED';
    else if (notLikedVotes > likedVotes) result = 'NOT_LIKED';
    // else tie → result remains null

    return NextResponse.json({
      totalVotes,
      likedVotes,
      notLikedVotes,
      result,
      currentUserVote
    }, { status: 200 });

  } catch (error) {
    console.error('Error fetching votes:', error);
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

    const { vote } = body;
    if (vote !== 'LIKED' && vote !== 'NOT_LIKED') {
      return NextResponse.json({ error: 'Bad Request: vote must be LIKED or NOT_LIKED' }, { status: 400 });
    }

    // Verify SongRequest exists, belongs to party, and is PLAYED
    const songReq = await db.collection('song_requests').findOne({ id: requestId, partyId });
    if (!songReq) {
      return NextResponse.json({ error: 'SongRequest not found in this party' }, { status: 404 });
    }
    
    if (songReq.status !== 'PLAYED') {
      return NextResponse.json({ error: `Voting is only allowed for PLAYED songs (current status: ${songReq.status})` }, { status: 400 });
    }

    const voteDoc = {
      id: crypto.randomUUID(),
      partyId,
      songRequestId: requestId,
      userId: privyUserId,
      vote,
      createdAt: new Date()
    };

    try {
      await db.collection('votes').insertOne(voteDoc);
    } catch (insertError) {
      if (insertError.code === 11000) {
        return NextResponse.json({ error: 'Conflict: You have already voted on this request' }, { status: 409 });
      }
      throw insertError;
    }

    // Auto-create settlement if the vote triggered a terminal state
    try {
      await createSettlementForRequest(db, partyId, requestId);
    } catch (settleError) {
      console.error('Error auto-creating settlement after vote:', settleError);
    }

    const { _id, ...safeDoc } = voteDoc;
    return NextResponse.json({ vote: safeDoc }, { status: 201 });

  } catch (error) {
    console.error('Error placing vote:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

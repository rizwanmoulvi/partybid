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
    const { db } = auth;

    const songReq = await db.collection('song_requests').findOne({ id: requestId, partyId });
    if (!songReq) {
      return NextResponse.json({ error: 'SongRequest not found in this party' }, { status: 404 });
    }

    const settlement = await db.collection('settlements').findOne({ partyId, songRequestId: requestId });
    if (!settlement) {
      return NextResponse.json({ settlement: null }, { status: 200 });
    }

    const { _id, ...safeDoc } = settlement;
    return NextResponse.json({ settlement: safeDoc }, { status: 200 });

  } catch (error) {
    console.error('Error fetching settlement:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}



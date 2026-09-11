import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';

export async function POST(req, { params }) {
  try {
    const { partyId: rawPartyId, requestId } = await params;
    const partyId = rawPartyId.toUpperCase();
    
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }

    const privy = getPrivyClient();
    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
    } catch (error) {
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const privyUserId = verifiedClaims.user_id;

    const client = await clientPromise;
    const db = client.db();

    // Verify Party exists
    const party = await db.collection('parties').findOne({ id: partyId });
    if (!party) {
      return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    }

    // Verify DJ Role (must be the DJ of this specific party)
    if (party.djUserId !== privyUserId) {
      return NextResponse.json({ error: 'Forbidden: Only the DJ can control playback' }, { status: 403 });
    }

    // Attempt to atomically transition REQUESTED -> PLAYING
    const result = await db.collection('song_requests').findOneAndUpdate(
      { 
        id: requestId, 
        partyId, 
        status: "REQUESTED" // condition ensures atomicity and state validation
      },
      { 
        $set: { 
          status: "PLAYING", 
          updatedAt: new Date() 
        } 
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      // If we didn't find and update it, it either doesn't exist, doesn't belong to this party, or isn't REQUESTED.
      // Let's figure out why to return a good error.
      const existing = await db.collection('song_requests').findOne({ id: requestId, partyId });
      if (!existing) {
        return NextResponse.json({ error: 'Song request not found in this party' }, { status: 404 });
      }
      return NextResponse.json({ error: `Invalid state transition: Cannot play request with status ${existing.status}` }, { status: 400 });
    }

    const { _id, ...safeDoc } = result;
    return NextResponse.json({ request: safeDoc }, { status: 200 });

  } catch (error) {
    console.error('Error playing request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

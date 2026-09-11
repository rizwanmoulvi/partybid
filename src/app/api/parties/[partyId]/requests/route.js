import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import crypto from 'crypto';

export async function GET(req, { params }) {
  try {
    const { partyId: rawPartyId } = await params;
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

    const privyUserId = verifiedClaims.userId;

    const client = await clientPromise;
    const db = client.db();

    // Verify Party exists
    const party = await db.collection('parties').findOne({ id: partyId });
    if (!party) {
      return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    }

    // Verify Membership
    const isDJ = party.djUserId === privyUserId;
    if (!isDJ) {
      const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden: Must be a party member' }, { status: 403 });
      }
    }

    // Fetch requests sorted by createdAt ascending
    const requests = await db.collection('song_requests')
      .find({ partyId })
      .sort({ createdAt: 1 })
      .toArray();

    // Map `_id` out so we don't expose mongo internal _id
    const sanitizedRequests = requests.map(({ _id, ...rest }) => rest);

    return NextResponse.json({ requests: sanitizedRequests }, { status: 200 });
  } catch (error) {
    console.error('Error fetching requests:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(req, { params }) {
  try {
    const { partyId: rawPartyId } = await params;
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

    const privyUserId = verifiedClaims.userId;

    // Parse Body
    let body;
    try {
      body = await req.json();
    } catch (e) {
      return NextResponse.json({ error: 'Bad Request: Invalid JSON' }, { status: 400 });
    }

    const { song } = body;
    if (!song || typeof song !== 'object') {
      return NextResponse.json({ error: 'Bad Request: Missing song object' }, { status: 400 });
    }

    if (!song.id || !song.title || !song.artist) {
      return NextResponse.json({ error: 'Bad Request: Song must include id, title, and artist' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // Verify Party exists
    const party = await db.collection('parties').findOne({ id: partyId });
    if (!party) {
      return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    }

    // Verify Membership
    const isDJ = party.djUserId === privyUserId;
    if (!isDJ) {
      const membership = await db.collection('party_members').findOne({ partyId, privyUserId });
      if (!membership) {
        return NextResponse.json({ error: 'Forbidden: Must be a party member to request songs' }, { status: 403 });
      }
    }

    const requestId = crypto.randomUUID();
    const now = new Date();

    const requestDoc = {
      id: requestId,
      partyId,
      userId: privyUserId,
      songId: song.id,
      title: song.title,
      artist: song.artist,
      album: song.album || null,
      artworkUrl: song.artworkUrl || null,
      durationMs: song.durationMs || null,
      status: "REQUESTED",
      createdAt: now,
      updatedAt: now
    };

    await db.collection('song_requests').insertOne(requestDoc);

    const { _id, ...safeDoc } = requestDoc;

    return NextResponse.json({ request: safeDoc }, { status: 201 });
  } catch (error) {
    console.error('Error creating request:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

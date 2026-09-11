import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';

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

    const privyUserId = verifiedClaims.user_id;

    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      // Body is optional
    }
    const walletAddress = body.walletAddress || null;

    const client = await clientPromise;
    const db = client.db();
    
    const party = await db.collection('parties').findOne({ id: partyId });
    if (!party) {
      return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    }

    const role = (party.djUserId === privyUserId) ? 'DJ' : 'GUEST';

    const membersCollection = db.collection('party_members');
    
    // We use findOneAndUpdate with upsert to handle insertion.
    // Concurrency-level uniqueness is strictly guaranteed by the unique compound index
    // { partyId: 1, privyUserId: 1 } configured on the MongoDB Atlas collection.
    // If it doesn't exist, it sets all fields. If it does exist, it returns the existing doc unmodified.
    let result;
    try {
      result = await membersCollection.findOneAndUpdate(
        { partyId, privyUserId },
        { 
          $setOnInsert: { 
            partyId, 
            privyUserId, 
            role, 
            walletAddress, 
            joinedAt: new Date() 
          } 
        },
        { upsert: true, returnDocument: 'after' }
      );
    } catch (upsertError) {
      if (upsertError.code === 11000) {
        // Concurrent insert caused a duplicate key error despite upsert logic.
        // The unique index protected the database! Just fetch the existing one.
        result = await membersCollection.findOne({ partyId, privyUserId });
      } else {
        throw upsertError;
      }
    }

    const membership = result; // In mongodb driver 6.x, findOneAndUpdate returns the document directly when returnDocument is 'after'

    return NextResponse.json(
      {
        member: true,
        partyId: membership.partyId,
        role: membership.role,
        walletAddress: membership.walletAddress,
        joinedAt: membership.joinedAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error joining party:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';

function generatePartyId() {
  // Generates a 6 character URL-safe ID using hex
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 });
    }
    
    const privy = getPrivyClient();
    if (!privy) {
      return NextResponse.json({ error: 'Server misconfiguration: Missing Privy credentials (PRIVY_APP_SECRET/NEXT_PUBLIC_PRIVY_APP_ID). Please add them to your environment variables.' }, { status: 500 });
    }

    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
    } catch (error) {
      console.error('Token verification failed:', error);
      return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
    }

    const djUserId = verifiedClaims.user_id;

    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Bad Request: Party name must be at least 2 characters' }, { status: 400 });
    }

    const trimmedName = name.trim();
    const partyId = generatePartyId();

    const client = await clientPromise;
    const db = client.db(); // uses default database from connection string
    const partiesCollection = db.collection('parties');

    const newParty = {
      id: partyId,
      name: trimmedName,
      djUserId,
      status: 'CREATED',
      createdAt: new Date(),
    };

    await partiesCollection.insertOne(newParty);

    return NextResponse.json(
      {
        id: newParty.id,
        name: newParty.name,
        status: newParty.status,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating party:', error);
    // Surface the error message to help the developer debug connection/URI issues
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}

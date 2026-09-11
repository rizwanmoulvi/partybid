import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';

export async function GET(req, { params }) {
  try {
    const { partyId } = await params;
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

    const privyUserId = verifiedClaims.userId;

    const client = await clientPromise;
    const db = client.db();
    const membersCollection = db.collection('party_members');

    const membership = await membersCollection.findOne({ 
      partyId: partyId.toUpperCase(), 
      privyUserId 
    });

    if (!membership) {
      return NextResponse.json({ member: false }, { status: 200 });
    }

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
    console.error('Error fetching membership:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}

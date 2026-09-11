import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(req, { params }) {
  try {
    const { partyId } = await params;

    if (!partyId) {
      return NextResponse.json({ error: 'Bad Request: Missing partyId' }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const partiesCollection = db.collection('parties');

    const party = await partiesCollection.findOne({ id: partyId.toUpperCase() });

    if (!party) {
      return NextResponse.json({ error: 'Party not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        id: party.id,
        name: party.name,
        djUserId: party.djUserId,
        status: party.status,
        createdAt: party.createdAt,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error fetching party:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Internal Server Error' 
    }, { status: 500 });
  }
}

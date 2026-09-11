const { MongoClient } = require('mongodb');
require('dotenv').config({ path: '.env.local' });

async function initDb() {
  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const db = client.db();
    
    // 1. Create unique index for parties collection on 'id'
    console.log('Creating index for parties collection...');
    await db.collection('parties').createIndex({ id: 1 }, { unique: true });
    console.log('Parties index created.');

    // 2. Create unique compound index for party_members collection
    console.log('Creating index for party_members collection...');
    await db.collection('party_members').createIndex(
      { partyId: 1, privyUserId: 1 },
      { unique: true }
    );
    console.log('Party members index created.');

  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    await client.close();
  }
}

initDb();

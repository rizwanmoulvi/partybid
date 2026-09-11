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

    // 3. Create unique compound index for bids collection
    console.log('Creating index for bids collection...');
    await db.collection('bids').createIndex(
      { partyId: 1, songRequestId: 1, userId: 1 },
      { unique: true }
    );
    console.log('Bids index created.');

    // 4. Create unique compound index for votes collection
    console.log('Creating index for votes collection...');
    await db.collection('votes').createIndex(
      { partyId: 1, songRequestId: 1, userId: 1 },
      { unique: true }
    );
    console.log('Votes index created.');

    // 5. Create unique index for settlements collection
    console.log('Creating index for settlements collection...');
    await db.collection('settlements').createIndex(
      { partyId: 1, songRequestId: 1 },
      { unique: true }
    );
    console.log('Settlements index created.');

    console.log('Database initialization complete.');

  } catch (error) {
    console.error('Error initializing database:', error);
  } finally {
    await client.close();
  }
}

initDb();

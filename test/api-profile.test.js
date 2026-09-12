import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { MongoClient } from 'mongodb';

const PORT = 3006;
const MONGODB_URI = 'mongodb://127.0.0.1:27018/partybid_test';
const BASE_URL = `http://localhost:${PORT}`;

async function setupDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  await db.collection('users').deleteMany({});
  await db.collection('parties').deleteMany({});
  await db.collection('party_members').deleteMany({});
  await db.collection('song_requests').deleteMany({});
  await db.collection('bids').deleteMany({});
  await db.collection('settlements').deleteMany({});

  await db.collection('users').insertOne({ id: 'did:privy:test_user', walletAddress: '0x123' });
  await db.collection('parties').insertOne({ id: 'PARTY_1' });
  await db.collection('party_members').insertOne({ partyId: 'PARTY_1', privyUserId: 'did:privy:test_user' });
  
  await db.collection('song_requests').insertOne({ id: 'REQ_1', partyId: 'PARTY_1', userId: 'did:privy:test_user', title: 'Test Song' });
  await db.collection('bids').insertOne({ id: 'BID_1', partyId: 'PARTY_1', songRequestId: 'REQ_1', userId: 'did:privy:test_user', amount: '0.05', status: 'ACTIVE' });
  
  await db.collection('settlements').insertOne({
    id: 'SETTLE_1',
    partyId: 'PARTY_1',
    songRequestId: 'REQ_1',
    amount: '0.05',
    outcome: 'PLAYER_PAYOUT',
    recipient: '0x123',
    status: 'COMPLETED'
  });
  
  await client.close();
}

test('Profile API', async (t) => {
  await setupDB();
  const server = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
    env: { ...process.env, MONGODB_URI, MOCK_PRIVY: "true" }
  });
  await new Promise(r => setTimeout(r, 4000));

  const url = `${BASE_URL}/api/profile`;

  await t.test('returns profile data for authenticated user', async () => {
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer valid_token' } });
    assert.strictEqual(res.status, 200);
    const data = await res.json(); console.log(data);
    assert.strictEqual(data.wallet.address, '0x123');
    assert.strictEqual(data.stats.partiesJoined, 1);
    assert.strictEqual(data.stats.songsRequested, 1);
    assert.strictEqual(data.stats.bids, 1);
    assert.strictEqual(data.stats.spent, '0.05');
    assert.strictEqual(data.stats.earned, '0.05');
    assert.strictEqual(data.balances.committed, '0.05');
  });

  server.kill();
});

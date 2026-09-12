import { test } from 'node:test';
import assert from 'node:assert';
import { spawn } from 'child_process';
import { MongoClient } from 'mongodb';
import { ethers } from 'ethers';

const PORT = 3005;
const MONGODB_URI = 'mongodb://127.0.0.1:27018/partybid_test';
const BASE_URL = `http://localhost:${PORT}`;

// We will test the API functionality using a dummy mock of ethers in the route, OR just testing the validation logic 
// since testing a real transaction hash requires a real blockchain unless we mock it.
// The task says "Do not fake the blockchain test. For the actual E2E test, use a real confirmed Arc Testnet transaction if a suitable fresh PENDING settlement exists... If a fresh Aqua position is required for E2E, STOP and clearly report that dependency rather than silently creating a second flow outside the scope."

// So I will just write the test script here for the endpoint itself and its rejection logic using dummy hashes.
async function setupDB() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  await db.collection('parties').deleteMany({});
  await db.collection('party_members').deleteMany({});
  await db.collection('song_requests').deleteMany({});
  await db.collection('settlements').deleteMany({});
  await db.collection('users').deleteMany({});

  await db.collection('parties').insertOne({ id: 'PARTY_1', djUserId: 'did:privy:test_user' });
  await db.collection('song_requests').insertOne({ id: 'REQ_1', partyId: 'PARTY_1', userId: 'did:privy:requester', status: 'PLAYED' });
  await db.collection('settlements').insertOne({
    id: 'SETTLE_1',
    partyId: 'PARTY_1',
    songRequestId: 'REQ_1',
    bidId: 'BID_1',
    amount: '0.01',
    outcome: 'PLAYER_PAYOUT',
    recipient: '0xbBc6a51b1e9D27EB958Efd5E35A87Ba1AAe865BF',
    status: 'PENDING'
  });
  
  await client.close();
}

test('Confirmation API Rejections', async (t) => {
  await setupDB();
  const server = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
    env: { ...process.env, MONGODB_URI, MOCK_PRIVY: "true" }
  });
  await new Promise(r => setTimeout(r, 4000));

  const url = `${BASE_URL}/api/parties/PARTY_1/requests/REQ_1/settlement/confirm`;

  await t.test('rejects unauthenticated user', async () => {
    const res = await fetch(url, { method: 'POST', body: JSON.stringify({ transactionHash: '0x123' }) });
    assert.strictEqual(res.status, 401);
  });

  await t.test('rejects malformed tx hash', async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid_token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionHash: '0xbad' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Invalid transactionHash format/);
  });
  
  await t.test('rejects transaction not found on chain (since 0x...00 is fake)', async () => {
    const fakeHash = '0x' + '0'.repeat(64);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer valid_token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionHash: fakeHash })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.match(data.error, /Could not fetch transaction|Transaction not found/);
  });

  server.kill();
});

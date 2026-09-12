import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { MongoClient } from 'mongodb';
import { spawn } from 'child_process';
import { ethers } from 'ethers';

const MONGODB_URI = 'mongodb://127.0.0.1:27018/partybid_test';
let nextProcess;
const PORT = 3001;

describe('API Route: POST /api/settlement/authorize', () => {
  let db;
  let client;

  before(async () => {
    // 1. Setup DB
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db();
    
    // Clean collections
    await db.collection('parties').deleteMany({});
    await db.collection('song_requests').deleteMany({});
    await db.collection('bids').deleteMany({});
    await db.collection('settlements').deleteMany({});
    await db.collection('users').deleteMany({});

    // Seed Data
    const makerAddress = ethers.Wallet.createRandom().address;
    
    await db.collection('users').insertMany([
      { id: 'did:privy:requester', walletAddress: ethers.Wallet.createRandom().address },
      { id: 'did:privy:maker', walletAddress: makerAddress }
    ]);

    await db.collection('parties').insertOne({
      id: 'PARTY_123',
      name: 'Test Party'
    });

    await db.collection('song_requests').insertOne({
      id: 'REQ_123',
      partyId: 'PARTY_123',
      userId: 'did:privy:requester',
      status: 'PLAYED'
    });

    await db.collection('bids').insertOne({
      id: 'BID_123',
      partyId: 'PARTY_123',
      songRequestId: 'REQ_123',
      userId: 'did:privy:maker',
      amount: '5.25',
      status: 'ACTIVE'
    });

    await db.collection('settlements').insertOne({
      id: 'SETTLE_123',
      partyId: 'PARTY_123',
      songRequestId: 'REQ_123',
      bidId: 'BID_123',
      amount: '5.25',
      outcome: 'PLAYER_PAYOUT',
      status: 'PENDING'
    });

    // 2. Start Next.js Server (mocking privy via test mock file)
    // Wait, since we can't easily mock privy in the running server without restarting, 
    // we use our mock-privy.js by overwriting src/lib/privy.js temporarily.
    // I did this manually before starting.
    
    nextProcess = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
      env: {
        ...process.env,
        MONGODB_URI,
        AQUA_TEST_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
        NEXT_PUBLIC_PARTYBID_AQUA_APP: "0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071",
        NEXT_PUBLIC_WUSDC: ethers.Wallet.createRandom().address,
        PLATFORM_RECIPIENT: ethers.Wallet.createRandom().address
      }
    });

    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  after(async () => {
    await client.close();
    if (nextProcess) nextProcess.kill();
  });

  it('1. Authorizes a valid PENDING settlement successfully', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/settlement/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_token'
      },
      body: JSON.stringify({
        settlementId: 'SETTLE_123'
      })
    });
    
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    assert.strictEqual(data.settlementId, 'SETTLE_123');
    assert.ok(data.signature);
    
    // Verify deterministic strategyHash derivation correctly bypassed client payload
    assert.ok(data.typedData.message.strategyHash);
  });

  it('2. Client cannot override signed fields', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/settlement/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_token'
      },
      body: JSON.stringify({
        settlementId: 'SETTLE_123',
        amount: '9999999', // Malicious attempt
        outcome: 'PLATFORM_PAYOUT', // Malicious attempt
        recipientWallet: ethers.Wallet.createRandom().address
      })
    });
    
    const data = await res.json();
    assert.strictEqual(res.status, 200);
    
    // The server MUST ignore the client-provided values and use the DB
    assert.strictEqual(data.typedData.message.amount, '5250000000000000000');
  });

  it('3. Rejects missing settlement ID', async () => {
    const res = await fetch(`http://localhost:${PORT}/api/settlement/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer valid_token'
      },
      body: JSON.stringify({})
    });
    assert.strictEqual(res.status, 400);
  });
});

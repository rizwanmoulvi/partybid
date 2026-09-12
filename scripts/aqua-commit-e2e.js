import { ethers } from 'ethers';
import { MongoClient } from 'mongodb';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MONGODB_URI = 'mongodb://127.0.0.1:27018/partybid_test';
const PORT = 3003;
const rpcUrl = 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(rpcUrl);

const privateKey = process.env.AQUA_TEST_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const AQUA_ADDRESS = "0xBf4140CD28b03479aD2F129c382b673101CF442B";
const WUSDC_ADDRESS = "0x911b4000D3422F482F4062a913885f7b035382Df";
const PARTYBID_AQUA_APP = "0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071";

const wusdcAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)"
];

const aquaAbi = [
  "function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash)",
  "function safeBalances(address maker, address app, bytes32 strategyHash, address token1, address token2) external view returns (uint256 balance0, uint256 balance1)",
];

async function main() {
  console.log(`[1] Starting DB & Seeding...`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  await db.collection('parties').deleteMany({});
  await db.collection('song_requests').deleteMany({});
  await db.collection('bids').deleteMany({});
  await db.collection('settlements').deleteMany({});
  await db.collection('users').deleteMany({});

  const makerAddress = wallet.address;
  const recipientAddress = ethers.Wallet.createRandom().address;
  const SETTLEMENT_ID = 'SETTLE_E2E_' + Date.now();
  const testAmount = '0.01'; // small test amount
  
  await db.collection('users').insertMany([
    { id: 'did:privy:maker', walletAddress: makerAddress },
    { id: 'did:privy:requester', walletAddress: recipientAddress }
  ]);
  await db.collection('parties').insertOne({ id: 'PARTY_1' });
  await db.collection('song_requests').insertOne({ id: 'REQ_1', partyId: 'PARTY_1', userId: 'did:privy:requester', status: 'PLAYED' });
  await db.collection('bids').insertOne({ id: 'BID_E2E', partyId: 'PARTY_1', songRequestId: 'REQ_1', userId: 'did:privy:maker', amount: testAmount, status: 'ACTIVE' });
  await db.collection('settlements').insertOne({
    id: SETTLEMENT_ID,
    partyId: 'PARTY_1',
    songRequestId: 'REQ_1',
    bidId: 'BID_E2E',
    amount: testAmount,
    outcome: 'PLAYER_PAYOUT',
    status: 'PENDING'
  });

  console.log(`[2] Starting Next.js...`);
  const nextProcess = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
    env: {
      ...process.env,
      MONGODB_URI,
      NEXT_PUBLIC_PARTYBID_AQUA_APP: PARTYBID_AQUA_APP,
      WUSDC_ADDRESS,
      PLATFORM_RECIPIENT: "0x7D5C5cCf29296cec4325c7510e2C0C0f9614d694"
    }
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log(`[3] Hitting API /api/settlement/authorize...`);
  const res = await fetch(`http://localhost:${PORT}/api/settlement/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid_token' },
    body: JSON.stringify({ settlementId: SETTLEMENT_ID })
  });
  
  const data = await res.json();
  if (res.status !== 200) {
    console.error(data);
    process.exit(1);
  }

  const { strategyBytes, strategyHash } = data;
  console.log(`    Strategy Bytes: ${strategyBytes}`);
  console.log(`    Strategy Hash: ${strategyHash}`);

  // verify locally
  const computedHash = ethers.keccak256(strategyBytes);
  if (computedHash !== strategyHash) throw new Error("Hash mismatch");

  console.log(`[4] Preparing Transaction...`);
  const wusdc = new ethers.Contract(WUSDC_ADDRESS, wusdcAbi, wallet);
  const aqua = new ethers.Contract(AQUA_ADDRESS, aquaAbi, wallet);
  
  const requiredAmount = ethers.parseUnits(testAmount, 18);
  const wusdcBefore = await wusdc.balanceOf(makerAddress);
  let vBalBefore = 0n;
  try {
    const [b] = await aqua.safeBalances(makerAddress, PARTYBID_AQUA_APP, strategyHash, WUSDC_ADDRESS, WUSDC_ADDRESS);
    vBalBefore = b;
  } catch (e) {}

  console.log(`    Maker Address: ${makerAddress}`);
  console.log(`    WUSDC Before: ${ethers.formatUnits(wusdcBefore, 18)}`);
  console.log(`    Virtual Balance Before: ${ethers.formatUnits(vBalBefore, 18)}`);
  
  const allowance = await wusdc.allowance(makerAddress, AQUA_ADDRESS);
  if (allowance < requiredAmount) {
    console.log(`    Approving WUSDC...`);
    const tx = await wusdc.approve(AQUA_ADDRESS, requiredAmount);
    await tx.wait();
  }

  console.log(`[5] Executing Aqua.ship()...`);
  const tx = await aqua.ship(PARTYBID_AQUA_APP, strategyBytes, [WUSDC_ADDRESS], [requiredAmount]);
  const rx = await tx.wait();
  console.log(`    Tx Hash: ${rx.hash}`);
  console.log(`    Block: ${rx.blockNumber}`);

  console.log(`[6] Verifying Results...`);
  const wusdcAfter = await wusdc.balanceOf(makerAddress);
  let vBalAfter = 0n;
  try {
    const [b] = await aqua.safeBalances(makerAddress, PARTYBID_AQUA_APP, strategyHash, WUSDC_ADDRESS, WUSDC_ADDRESS);
    vBalAfter = b;
  } catch (e) {}

  console.log(`    WUSDC After: ${ethers.formatUnits(wusdcAfter, 18)} (Expect no change)`);
  console.log(`    Virtual Balance After: ${ethers.formatUnits(vBalAfter, 18)} (Expect +${testAmount})`);

  nextProcess.kill();
  process.exit(0);
}

main().catch(console.error);

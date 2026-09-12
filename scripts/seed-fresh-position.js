import { ethers } from 'ethers';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MONGODB_URI = 'mongodb://127.0.0.1:27017/partybid'; // use actual local dev db
const rpcUrl = 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(rpcUrl);

const privateKey = process.env.AQUA_TEST_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const AQUA = "0xBf4140CD28b03479aD2F129c382b673101CF442B";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const PARTYBID_AQUA_APP = "0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071";

const MAKER = "0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7";
const RECEIVER = "0xbBc6a51b1e9D27EB958Efd5E35A87Ba1AAe865BF";
const AMOUNT = ethers.parseUnits('0.01', 18);

const wusdcAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];

const aquaAbi = [
  "function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash)",
  "function safeBalances(address maker, address app, bytes32 strategyHash, address token1, address token2) external view returns (uint256 balance0, uint256 balance1)"
];

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();

  const PARTY_ID = 'PARTY_REAL_E2E';
  const REQ_ID = 'REQ_REAL_E2E';
  const BID_ID = 'BID_REAL_E2E';
  const SETTLEMENT_ID = 'SETTLE_REAL_E2E';

  // We need to construct the canonical strategy bytes.
  // The strategyBytes format used by the backend is abi.encodePacked(maker, uint256(keccak256(bidId)))
  const entropy = ethers.toBigInt(ethers.id(BID_ID));
  const strategyBytes = ethers.solidityPacked(["address", "uint256"], [MAKER, entropy]);
  const strategyHash = ethers.keccak256(strategyBytes);

  console.log(`[1] Creating Fresh Aqua Position`);
  console.log(`    Maker: ${MAKER}`);
  console.log(`    Strategy Bytes: ${strategyBytes}`);
  console.log(`    Strategy Hash: ${strategyHash}`);

  const aqua = new ethers.Contract(AQUA, aquaAbi, wallet);
  const wusdc = new ethers.Contract(WUSDC, wusdcAbi, wallet);

  // Check allowance
  const allowance = await wusdc.allowance(MAKER, AQUA);
  if (allowance < AMOUNT) {
    console.log(`    Approving WUSDC...`);
    const tx = await wusdc.approve(AQUA, AMOUNT);
    await tx.wait();
  }

  // Ship
  console.log(`    Executing Aqua.ship()...`);
  const txShip = await aqua.ship(PARTYBID_AQUA_APP, strategyBytes, [WUSDC], [AMOUNT]);
  const rxShip = await txShip.wait();
  console.log(`    Ship Tx Hash: ${rxShip.hash}`);
  console.log(`    Ship Block: ${rxShip.blockNumber}`);

  let virtualBal = 0n;
  try {
    const [b] = await aqua.safeBalances(MAKER, PARTYBID_AQUA_APP, strategyHash, WUSDC, WUSDC);
    virtualBal = b;
  } catch (e) {}
  
  if (virtualBal !== AMOUNT) {
    throw new Error(`Failed to create Aqua position! Balance is ${virtualBal}`);
  }
  console.log(`    Aqua Virtual Balance: 0.01 WUSDC`);

  console.log(`\n[2] Seeding MongoDB with PENDING Settlement`);
  await db.collection('parties').updateOne({ id: PARTY_ID }, { $set: { id: PARTY_ID } }, { upsert: true });
  
  // We need a user session. I will use a test user id or just rely on the existing wallet auth.
  // Assuming the user will login via Privy in the UI. 
  // We should just use the actual Privy DID for the DJ / members if needed. 
  
  await db.collection('song_requests').updateOne(
    { id: REQ_ID },
    { $set: { id: REQ_ID, partyId: PARTY_ID, status: 'PLAYED', title: 'Real E2E Test Song', artist: 'Tester', activeBidAmount: 0.01, activeBidUserId: 'did:privy:maker' } },
    { upsert: true }
  );

  await db.collection('bids').updateOne(
    { id: BID_ID },
    { $set: { id: BID_ID, partyId: PARTY_ID, songRequestId: REQ_ID, amount: '0.01', status: 'ACTIVE', userId: 'did:privy:maker' } },
    { upsert: true }
  );

  await db.collection('settlements').updateOne(
    { id: SETTLEMENT_ID },
    { $set: {
        id: SETTLEMENT_ID,
        partyId: PARTY_ID,
        songRequestId: REQ_ID,
        bidId: BID_ID,
        amount: '0.01',
        outcome: 'PLAYER_PAYOUT',
        recipient: RECEIVER,
        status: 'PENDING'
      }
    },
    { upsert: true }
  );

  console.log(`    Seeded PENDING settlement: ${SETTLEMENT_ID}`);
  
  await client.close();
  console.log(`\n✅ Setup complete. Ready for frontend execution.`);
}

main().catch(console.error);

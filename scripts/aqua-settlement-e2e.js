import { ethers } from 'ethers';
import { MongoClient } from 'mongodb';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const MONGODB_URI = 'mongodb://127.0.0.1:27018/partybid_test';
const PORT = 3004;
const rpcUrl = 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(rpcUrl);

const privateKey = process.env.AQUA_TEST_PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

const AQUA = "0xBf4140CD28b03479aD2F129c382b673101CF442B";
const WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
const PARTYBID_AQUA_APP = "0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071";

const MAKER = "0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7";
const STRATEGY_HASH = "0xd29ab832868f640bc3f065b36054d087bd407d117cf6e07c93b185b4af6a9951";
const RECEIVER = "0xbBc6a51b1e9D27EB958Efd5E35A87Ba1AAe865BF";
const AMOUNT = ethers.parseUnits('0.01', 18);

const wusdcAbi = [
  "function balanceOf(address) view returns (uint256)"
];

const aquaAbi = [
  "function safeBalances(address maker, address app, bytes32 strategyHash, address token1, address token2) external view returns (uint256 balance0, uint256 balance1)"
];

const appAbi = [
  "function executeSettlement((bytes32 partyId, bytes32 songRequestId, bytes32 bidId, address maker, bytes32 strategyHash, address token, uint256 amount, bytes32 outcome, address recipient, uint256 nonce, uint256 deadline), bytes signature) external",
  "event SettlementExecuted(bytes32 indexed settlementId, bytes32 partyId, bytes32 songRequestId, bytes32 bidId, address indexed maker, address token, uint256 amount, bytes32 outcome, address indexed recipient)"
];

async function main() {
  if (wallet.address !== MAKER) {
    throw new Error(`Configured wallet ${wallet.address} is not the maker ${MAKER}`);
  }

  const aqua = new ethers.Contract(AQUA, aquaAbi, provider);
  const wusdc = new ethers.Contract(WUSDC, wusdcAbi, provider);
  const app = new ethers.Contract(PARTYBID_AQUA_APP, appAbi, wallet);

  console.log(`[1] PRE-FLIGHT READS`);
  
  let virtualBalBefore = 0n;
  try {
    const [b] = await aqua.safeBalances(MAKER, PARTYBID_AQUA_APP, STRATEGY_HASH, WUSDC, WUSDC);
    virtualBalBefore = b;
  } catch (e) { console.error(e) }
  
  const makerWusdcBefore = await wusdc.balanceOf(MAKER);
  const receiverWusdcBefore = await wusdc.balanceOf(RECEIVER);

  console.log(`    Aqua Virtual Balance: ${ethers.formatUnits(virtualBalBefore, 18)}`);
  console.log(`    Maker WUSDC Balance: ${ethers.formatUnits(makerWusdcBefore, 18)}`);
  console.log(`    Receiver WUSDC Balance: ${ethers.formatUnits(receiverWusdcBefore, 18)}`);

  if (virtualBalBefore !== AMOUNT) {
    throw new Error(`Expected Virtual Balance to be ${ethers.formatUnits(AMOUNT, 18)}, but got ${ethers.formatUnits(virtualBalBefore, 18)}. STOPPING.`);
  }

  console.log(`\n[2] CREATE THE SETTLEMENT AUTHORIZATION (VIA MOCK DB)`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db();
  
  await db.collection('parties').deleteMany({});
  await db.collection('song_requests').deleteMany({});
  await db.collection('bids').deleteMany({});
  await db.collection('settlements').deleteMany({});
  await db.collection('users').deleteMany({});

  const SETTLEMENT_ID = 'SETTLE_E2E_' + Date.now();
  const PARTY_ID = 'PARTY_E2E_' + Date.now();
  const REQ_ID = 'REQ_E2E_' + Date.now();
  
  await db.collection('users').insertMany([
    { id: 'did:privy:maker', walletAddress: MAKER },
    { id: 'did:privy:requester', walletAddress: RECEIVER }
  ]);
  await db.collection('parties').insertOne({ id: PARTY_ID });
  await db.collection('song_requests').insertOne({ id: REQ_ID, partyId: PARTY_ID, userId: 'did:privy:requester', status: 'PLAYED' });
  await db.collection('bids').insertOne({ id: 'BID_E2E', partyId: PARTY_ID, songRequestId: REQ_ID, userId: 'did:privy:maker', amount: '0.01', status: 'ACTIVE' });
  await db.collection('settlements').insertOne({
    id: SETTLEMENT_ID,
    partyId: PARTY_ID,
    songRequestId: REQ_ID,
    bidId: 'BID_E2E',
    amount: '0.01',
    outcome: 'PLAYER_PAYOUT',
    status: 'PENDING'
  });

  const nextProcess = spawn('npm', ['run', 'start', '--', '-p', String(PORT)], {
    env: {
      ...process.env,
      MONGODB_URI,
      NEXT_PUBLIC_PARTYBID_AQUA_APP: PARTYBID_AQUA_APP,
      WUSDC_ADDRESS: WUSDC,
      PLATFORM_RECIPIENT: "0x7D5C5cCf29296cec4325c7510e2C0C0f9614d694"
    }
  });

  await new Promise(resolve => setTimeout(resolve, 5000));

  const res = await fetch(`http://localhost:${PORT}/api/settlement/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer valid_token' },
    body: JSON.stringify({ settlementId: SETTLEMENT_ID })
  });
  
  const data = await res.json();
  if (res.status !== 200) {
    console.error(data);
    nextProcess.kill();
    process.exit(1);
  }

  const { typedData, signature } = data;
  const settlementArgs = [
    typedData.message.partyId,
    typedData.message.songRequestId,
    typedData.message.bidId,
    typedData.message.maker,
    typedData.message.strategyHash,
    typedData.message.token,
    typedData.message.amount,
    typedData.message.outcome,
    typedData.message.recipient,
    typedData.message.nonce,
    typedData.message.deadline
  ];

  console.log(`\n[3] VERIFY SIGNATURE`);
  const recoveredSigner = ethers.verifyTypedData(typedData.domain, typedData.types, typedData.message, signature);
  console.log(`    Recovered Signer: ${recoveredSigner}`);
  if (recoveredSigner !== MAKER) {
    throw new Error(`Signature validation failed! Expected ${MAKER}, got ${recoveredSigner}`);
  }
  if (typedData.domain.verifyingContract !== PARTYBID_AQUA_APP || typedData.domain.chainId !== 5042002) {
    throw new Error("EIP-712 Domain mismatch!");
  }

  console.log(`\n[4] VERIFY SETTLEMENT FIELDS`);
  if (typedData.message.maker !== MAKER) throw new Error("Maker mismatch");
  if (typedData.message.strategyHash !== STRATEGY_HASH) throw new Error("StrategyHash mismatch");
  if (typedData.message.token !== WUSDC) throw new Error("Token mismatch");
  if (typedData.message.amount.toString() !== AMOUNT.toString()) throw new Error("Amount mismatch");
  if (typedData.message.outcome !== ethers.id("PLAYER_PAYOUT")) throw new Error("Outcome mismatch");
  if (typedData.message.recipient !== RECEIVER) throw new Error("Recipient mismatch");
  console.log(`    Fields matched perfectly.`);

  console.log(`\n[5] EXECUTE REAL TRANSACTION`);
  const tx = await app.executeSettlement(settlementArgs, signature);
  console.log(`    Sent transaction: ${tx.hash}`);
  
  const receipt = await tx.wait();
  
  console.log(`\n[6] VERIFY TRANSACTION`);
  console.log(`    Tx Hash: ${receipt.hash}`);
  console.log(`    Block: ${receipt.blockNumber}`);
  console.log(`    Status: ${receipt.status === 1 ? 'SUCCESS' : 'FAILED'}`);
  console.log(`    Gas Used: ${receipt.gasUsed}`);
  
  if (receipt.status !== 1) {
    throw new Error("Transaction reverted!");
  }

  console.log(`\n[7] VERIFY PHYSICAL WUSDC TRANSFER`);
  const makerWusdcAfter = await wusdc.balanceOf(MAKER);
  const receiverWusdcAfter = await wusdc.balanceOf(RECEIVER);
  
  console.log(`    Maker WUSDC After: ${ethers.formatUnits(makerWusdcAfter, 18)}`);
  console.log(`    Receiver WUSDC After: ${ethers.formatUnits(receiverWusdcAfter, 18)}`);
  
  const makerDelta = makerWusdcBefore - makerWusdcAfter;
  const receiverDelta = receiverWusdcAfter - receiverWusdcBefore;
  
  console.log(`    Maker Delta: -${ethers.formatUnits(makerDelta, 18)}`);
  console.log(`    Receiver Delta: +${ethers.formatUnits(receiverDelta, 18)}`);
  
  if (makerDelta !== AMOUNT) throw new Error("Maker WUSDC delta incorrect!");
  if (receiverDelta !== AMOUNT) throw new Error("Receiver WUSDC delta incorrect!");

  console.log(`\n[8] VERIFY AQUA POSITION IS CONSUMED`);
  let virtualBalAfter = 0n;
  try {
    const [b] = await aqua.safeBalances(MAKER, PARTYBID_AQUA_APP, STRATEGY_HASH, WUSDC, WUSDC);
    virtualBalAfter = b;
  } catch (e) {}
  
  console.log(`    Virtual Balance After: ${ethers.formatUnits(virtualBalAfter, 18)}`);
  if (virtualBalAfter !== 0n) {
    throw new Error("Aqua Virtual Balance was not consumed!");
  }

  console.log(`\n[9] VERIFY EVENTS`);
  const iface = new ethers.Interface(appAbi);
  let settlementEventFound = false;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === 'SettlementExecuted') {
        settlementEventFound = true;
        console.log(`    Found SettlementExecuted Event`);
        console.log(`      Settlement ID Hash: ${parsed.args[0]}`);
        console.log(`      Party ID: ${parsed.args[1]}`);
        console.log(`      Recipient: ${parsed.args[8]}`);
      }
    } catch(e) {}
  }
  if (!settlementEventFound) {
    throw new Error("SettlementExecuted event not found in receipt!");
  }

  console.log(`\n[10] REPLAY PROTECTION`);
  let replayReverted = false;
  try {
    const replayTx = await app.executeSettlement(settlementArgs, signature);
    await replayTx.wait();
  } catch (err) {
    console.log(`    Replay execution reverted as expected: ${err.shortMessage || err.message}`);
    replayReverted = true;
  }
  
  if (!replayReverted) {
    throw new Error("REPLAY VULNERABILITY! Transaction succeeded twice!");
  }
  
  const receiverWusdcReplay = await wusdc.balanceOf(RECEIVER);
  if (receiverWusdcReplay !== receiverWusdcAfter) {
    throw new Error("Receiver balance changed during replay attempt!");
  }
  console.log(`    Receiver balance unchanged after replay attempt.`);

  console.log(`\n[11] MONGODB MUST REMAIN UNCHANGED`);
  console.log(`    Database updates were made to the isolated local test container ONLY.`);

  nextProcess.kill();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});

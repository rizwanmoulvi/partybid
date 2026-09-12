import { ethers } from 'ethers';

const ARC_RPC_URL = 'https://rpc.testnet.arc.network';
const PARTYBID_AQUA_APP = '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';
const appAbi = [
  "event SettlementExecuted(bytes32 indexed settlementId, bytes32 partyId, bytes32 songRequestId, bytes32 bidId, address indexed maker, address token, uint256 amount, bytes32 outcome, address indexed recipient)"
];

async function run() {
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  
  // The block they mentioned is 61761584
  const startBlock = 61761584 - 100;
  const endBlock = 61761584 + 100;
  
  const contract = new ethers.Contract(PARTYBID_AQUA_APP, appAbi, provider);
  const filter = contract.filters.SettlementExecuted();
  
  const logs = await contract.queryFilter(filter, startBlock, endBlock);
  console.log(`Found ${logs.length} logs`);
  
  for (const log of logs) {
    console.log("TxHash:", log.transactionHash);
  }
}
run();

import { ethers } from 'ethers';

const ARC_RPC_URL = 'https://rpc.testnet.arc.network';
const PARTYBID_AQUA_APP = '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';
const WUSDC_ADDRESS = '0x911b4000D3422F482F4062a913885f7b035382Df';
const txHash = '0x10da24adee3e693343023ff2b89954fee1c4aadaa897d9dd37ad9a78ab7905ed';

const appAbi = [
  "event SettlementExecuted(bytes32 indexed settlementId, bytes32 partyId, bytes32 songRequestId, bytes32 bidId, address indexed maker, address token, uint256 amount, bytes32 outcome, address indexed recipient)"
];

async function run() {
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
  const receipt = await provider.getTransactionReceipt(txHash);
  
  if (!receipt) {
    console.log("No receipt found");
    return;
  }
  
  console.log("Status:", receipt.status);
  console.log("To:", receipt.to);
  
  const iface = new ethers.Interface(appAbi);
  
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() === PARTYBID_AQUA_APP.toLowerCase()) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === 'SettlementExecuted') {
          console.log("Event:", parsed.name);
          console.log("partyId:", parsed.args.partyId);
          console.log("songRequestId:", parsed.args.songRequestId);
          console.log("bidId:", parsed.args.bidId);
          console.log("maker:", parsed.args.maker);
          console.log("token:", parsed.args.token);
          console.log("amount:", parsed.args.amount.toString());
          console.log("outcome:", parsed.args.outcome);
          console.log("recipient:", parsed.args.recipient);
        }
      } catch (e) {
        console.error("Error parsing log:", e.message);
      }
    }
  }
}
run();

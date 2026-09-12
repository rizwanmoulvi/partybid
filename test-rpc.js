import { ethers } from 'ethers';
const rpcUrl = 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(rpcUrl);
const WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const MAKER = '0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7';

async function test() {
  const wusdc = new ethers.Contract(WUSDC, ["event Transfer(address indexed from, address indexed to, uint256 value)"], provider);
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, currentBlock - 50000);
  console.log(`Querying from ${fromBlock} to ${currentBlock}`);
  
  const filterFrom = wusdc.filters.Transfer(MAKER);
  const logs = await wusdc.queryFilter(filterFrom, fromBlock);
  console.log(`Found ${logs.length} sent events`);
}
test().catch(console.error);

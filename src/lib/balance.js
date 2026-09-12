import clientPromise from '@/lib/mongodb';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';

const wusdcAbi = ["function balanceOf(address) view returns (uint256)"];

/**
 * Calculates the real dynamic balance for a user in a party.
 * 
 * @param {string} partyId 
 * @param {string} userId 
 * @param {string} excludeSongRequestId - Optional. If provided, excludes this request's bid from the committed total.
 */
export async function getUserBalance(partyId, userId, excludeSongRequestId = null) {
  const client = await clientPromise;
  const db = client.db();
  
  // 1. Get wallet address
  const user = await db.collection('users').findOne({ id: userId });
  let walletAddress = user?.walletAddress;
  
  if (!walletAddress) {
    const membership = await db.collection('party_members').findOne({ privyUserId: userId, partyId });
    if (membership?.walletAddress) {
      walletAddress = membership.walletAddress;
    }
  }
  
  let wusdcBalance = 0;
  let usdcBalance = 0;
  
  if (walletAddress) {
    try {
      const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
      const wusdc = new ethers.Contract(WUSDC_ADDRESS, wusdcAbi, provider);
      
      const [balWusdc, balNative] = await Promise.all([
        wusdc.balanceOf(walletAddress),
        provider.getBalance(walletAddress)
      ]);
      
      wusdcBalance = parseFloat(ethers.formatUnits(balWusdc, 18));
      usdcBalance = parseFloat(ethers.formatEther(balNative));
    } catch (e) {
      console.error("Failed to fetch on-chain balances in getUserBalance:", e);
    }
  }
  
  // 2. Calculate Active Bids (commitments not yet shipped)
  const query = {
    userId, // Global across all parties to ensure they don't over-commit their single wallet
    status: 'ACTIVE'
  };
  
  if (excludeSongRequestId) {
    query.songRequestId = { $ne: excludeSongRequestId };
  }
  
  const activeBids = await db.collection('bids').find(query).toArray();
  
  // Sum up all active commitments, rounding properly to avoid float precision issues
  const rawSum = activeBids.reduce((sum, bid) => sum + (bid.amount || 0), 0);
  const committedBalance = Math.round(rawSum * 100) / 100;
  
  // Available balance is actual WUSDC minus pending active bids
  const availableBalance = Math.max(0, Math.round((wusdcBalance - committedBalance) * 100) / 100);
  
  return {
    simulatedBalance: wusdcBalance, // The UI previously called this simulatedBalance
    committedBalance,
    availableBalance,
    usdcBalance // Adding native gas balance just in case
  };
}

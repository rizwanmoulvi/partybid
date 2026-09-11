import clientPromise from '@/lib/mongodb';

export const SIMULATED_BALANCE = 20.00;

/**
 * Calculates the off-chain simulated balance for a user in a party.
 * 
 * @param {string} partyId 
 * @param {string} userId 
 * @param {string} excludeSongRequestId - Optional. If provided, excludes this request's bid from the committed total (useful when updating an existing bid).
 */
export async function getUserBalance(partyId, userId, excludeSongRequestId = null) {
  const client = await clientPromise;
  const db = client.db();
  
  const query = {
    partyId,
    userId,
    status: 'ACTIVE'
  };
  
  if (excludeSongRequestId) {
    query.songRequestId = { $ne: excludeSongRequestId };
  }
  
  const activeBids = await db.collection('bids').find(query).toArray();
  
  // Sum up all active commitments, rounding properly to avoid float precision issues
  const rawSum = activeBids.reduce((sum, bid) => sum + (bid.amount || 0), 0);
  const committedBalance = Math.round(rawSum * 100) / 100;
  
  const availableBalance = Math.max(0, Math.round((SIMULATED_BALANCE - committedBalance) * 100) / 100);
  
  return {
    simulatedBalance: SIMULATED_BALANCE,
    committedBalance,
    availableBalance
  };
}

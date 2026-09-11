/**
 * Deterministically sorts an array of song requests for the live queue.
 *
 * Rules:
 * 1. Active bid amount DESC
 * 2. SongRequest createdAt ASC (earlier wins ties)
 * 3. deterministic ID ASC as a final tie-breaker
 *
 * @param {Array} requests - Array of request objects mapped with their activeBidAmount
 * @returns {Array} - A new sorted array
 */
export function sortRequests(requests) {
  return [...requests].sort((a, b) => {
    const bidA = a.activeBidAmount || 0;
    const bidB = b.activeBidAmount || 0;
    
    // 1. active bid amount DESC
    if (bidB !== bidA) {
      return bidB - bidA;
    }
    
    // 2. createdAt ASC
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    if (timeA !== timeB) {
      return timeA - timeB; // Earliest (smaller timestamp) goes first
    }
    
    // 3. ID ASC as final tie-breaker
    const idA = a.id || '';
    const idB = b.id || '';
    if (idA < idB) return -1;
    if (idA > idB) return 1;
    return 0;
  });
}

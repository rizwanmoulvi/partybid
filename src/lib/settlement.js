import crypto from 'crypto';

/**
 * Automatically creates a settlement record for a song request if it has reached a terminal state.
 *
 * Terminal states:
 * - SKIPPED -> BIDDER_RELEASE
 * - PLAYED with LIKED majority -> PLAYER_PAYOUT
 * - PLAYED with NOT_LIKED majority -> PLATFORM_PAYOUT
 *
 * @param {import('mongodb').Db} db - MongoDB database instance
 * @param {string} partyId
 * @param {string} requestId
 * @returns {Promise<object|null>} The created or existing settlement, or null if unresolved.
 */
export async function createSettlementForRequest(db, partyId, requestId) {
  // 1. Verify Song Request
  const songReq = await db.collection('song_requests').findOne({ id: requestId, partyId });
  if (!songReq) {
    throw new Error('SongRequest not found');
  }

  // 2. Fetch ACTIVE bid
  const activeBid = await db.collection('bids').findOne({ partyId, songRequestId: requestId, status: 'ACTIVE' });
  if (!activeBid) {
    throw new Error('Cannot settle request without an active bid');
  }

  let outcome;
  let recipient;

  // 3. Determine Outcome Server-Side
  if (songReq.status === 'SKIPPED') {
    outcome = 'BIDDER_RELEASE';
    recipient = activeBid.userId; // The original bidder's ID
  } else if (songReq.status === 'PLAYED') {
    const votes = await db.collection('votes').find({ partyId, songRequestId: requestId }).toArray();
    let likedVotes = 0;
    let notLikedVotes = 0;
    for (const v of votes) {
      if (v.vote === 'LIKED') likedVotes++;
      if (v.vote === 'NOT_LIKED') notLikedVotes++;
    }
    const totalVotes = likedVotes + notLikedVotes;
    
    if (totalVotes === 0) {
      return null;
    }
    
    // Simple majority; tie goes to the player
    if (likedVotes >= notLikedVotes) {
      outcome = 'PLAYER_PAYOUT';
      recipient = songReq.userId;
    } else {
      outcome = 'PLATFORM_PAYOUT';
      recipient = 'PLATFORM';
    }
  } else {
    // Neither skipped nor played, no settlement yet.
    return null;
  }

  // 4. Create Settlement
  const now = new Date();
  const settlementDoc = {
    id: crypto.randomUUID(),
    partyId,
    songRequestId: requestId,
    bidId: activeBid.id,
    amount: activeBid.amount,
    outcome,
    recipient,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now
  };

  try {
    await db.collection('settlements').insertOne(settlementDoc);
    return settlementDoc;
  } catch (insertError) {
    if (insertError.code === 11000) {
      // Idempotent: return the existing settlement
      return await db.collection('settlements').findOne({ partyId, songRequestId: requestId });
    }
    throw insertError;
  }
}

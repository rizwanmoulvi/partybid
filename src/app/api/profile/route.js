import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';
import { getPrivyClient } from '@/lib/privy';
import { ethers } from 'ethers';

const ARC_RPC_URL = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network';
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';
const AQUA = '0xBf4140CD28b03479aD2F129c382b673101CF442B';

const wusdcAbi = ["function balanceOf(address) view returns (uint256)"];
const aquaAbi = ["function safeBalances(address maker, address app, bytes32 strategyHash, address token1, address token2) external view returns (uint256 balance0, uint256 balance1)"];

export async function GET(req) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.split(' ')[1];
    if (!token || token === 'null' || token === 'undefined') {
      return NextResponse.json({ error: 'Unauthorized: Missing token', authHeader }, { status: 401 });
    }

    const privy = getPrivyClient();
    let verifiedClaims;
    try {
      verifiedClaims = await privy.utils().auth().verifyAccessToken(token);
    } catch (e) {
      console.error("Privy token verification failed:", e);
      return NextResponse.json({ error: 'Unauthorized: Invalid token', details: e.message }, { status: 401 });
    }
    const privyUserId = verifiedClaims.user_id;

    const url = new URL(req.url);
    const queryWallet = url.searchParams.get('wallet');

    const client = await clientPromise;
    const db = client.db();
    
    // Get user wallet address from DB or query
    const user = await db.collection('users').findOne({ id: privyUserId });
    const walletAddress = queryWallet || user?.walletAddress;
    
    // Auto-update DB if wallet address is missing
    if (queryWallet && (!user || user.walletAddress !== queryWallet)) {
      await db.collection('users').updateOne(
        { id: privyUserId }, 
        { $set: { walletAddress: queryWallet } }, 
        { upsert: true }
      );
    }
    
    let wusdcBalance = "0";
    let usdcBalance = "0";
    if (walletAddress) {
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
        const wusdc = new ethers.Contract(WUSDC_ADDRESS, wusdcAbi, provider);
        const bal = await wusdc.balanceOf(walletAddress);
        wusdcBalance = ethers.formatUnits(bal, 18);
        
        const nativeBal = await provider.getBalance(walletAddress);
        // Format to 4 decimal places for display
        usdcBalance = parseFloat(ethers.formatEther(nativeBal)).toFixed(4);
      } catch (e) {
        console.error("Failed to fetch balances:", e);
      }
    }

    // Stats
    const partiesJoined = await db.collection('party_members').countDocuments({ privyUserId });
    
    const songRequestsCursor = await db.collection('song_requests').find({ userId: privyUserId });
    const songRequests = await songRequestsCursor.toArray();
    const songsRequested = songRequests.length;
    
    const bidsCursor = await db.collection('bids').find({ userId: privyUserId });
    const bids = await bidsCursor.toArray();
    
    let spent = 0;
    bids.forEach(b => {
      if (b.status === 'ACTIVE' || b.status === 'COMPLETED') {
        spent += parseFloat(b.amount || '0');
      }
    });

    const settlementsCursor = await db.collection('settlements').find({ 
      $or: [
        { recipient: walletAddress },
        { "outcome": "PLAYER_PAYOUT" } // Will filter down to user below
      ]
    });
    const allSettlements = await settlementsCursor.toArray();
    
    // We must find settlements where the user is the recipient. 
    // If PLAYER_PAYOUT, the recipient is the song requester.
    let earned = 0;
    let pendingWusdc = 0;
    let committedWusdc = 0;
    
    const userSettlements = [];
    for (const s of allSettlements) {
      let isRecipient = false;
      if (s.recipient && s.recipient.toLowerCase() === walletAddress?.toLowerCase()) {
        isRecipient = true;
      } else if (s.outcome === 'PLAYER_PAYOUT') {
        const req = await db.collection('song_requests').findOne({ id: s.songRequestId });
        if (req && req.userId === privyUserId) {
          isRecipient = true;
        }
      }
      
      if (isRecipient) {
        userSettlements.push(s);
        if (s.status === 'COMPLETED') {
          earned += parseFloat(s.amount || '0');
        } else if (s.status === 'PENDING') {
          pendingWusdc += parseFloat(s.amount || '0');
        }
      }
    }
    
    // Activity Log
    const activity = [];
    
    // Add completed payouts
    userSettlements.forEach(s => {
      activity.push({
        id: `settlement-${s.id}`,
        type: s.status === 'COMPLETED' ? 'payout' : 'pending_settlement',
        amount: s.amount,
        outcome: s.outcome,
        partyId: s.partyId,
        songRequestId: s.songRequestId,
        date: s.updatedAt || s._id.getTimestamp(),
        txHash: s.transactionHash,
        status: s.status,
        settlement: s
      });
    });

    // Add bids
    bids.forEach(b => {
      activity.push({
        id: `bid-${b.id}`,
        type: 'bid',
        amount: b.amount,
        partyId: b.partyId,
        songRequestId: b.songRequestId,
        status: b.status,
        date: b.createdAt || b._id.getTimestamp()
      });
      if (b.status === 'ACTIVE' && walletAddress) {
         committedWusdc += parseFloat(b.amount || '0');
      }
    });
    
    // Sort activity newest first
    activity.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Enrich activity with names (simple lookup)
    const partyIds = [...new Set(activity.map(a => a.partyId).filter(Boolean))];
    const reqIds = [...new Set(activity.map(a => a.songRequestId).filter(Boolean))];
    
    const parties = await db.collection('parties').find({ id: { $in: partyIds } }).toArray();
    const reqs = await db.collection('song_requests').find({ id: { $in: reqIds } }).toArray();
    
    const partyMap = {};
    parties.forEach(p => partyMap[p.id] = p.name || `Party ${p.id.slice(0,4)}`);
    const reqMap = {};
    reqs.forEach(r => reqMap[r.id] = `${r.title} - ${r.artist}`);

    const enrichedActivity = activity.map(a => ({
      ...a,
      partyName: a.partyId ? partyMap[a.partyId] : null,
      songName: a.songRequestId ? reqMap[a.songRequestId] : null
    }));

    return NextResponse.json({
      wallet: {
        address: walletAddress,
        network: "Arc Testnet"
      },
      balances: {
        usdc: usdcBalance,
        wusdc: wusdcBalance,
        committed: committedWusdc.toString(),
        pending: pendingWusdc.toString()
      },
      stats: {
        partiesJoined,
        songsRequested,
        bids: bids.length,
        spent: spent.toString(),
        earned: earned.toString()
      },
      activity: enrichedActivity
    });
  } catch (error) {
    console.error("Profile API Error:", error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

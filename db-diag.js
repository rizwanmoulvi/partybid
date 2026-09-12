import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import clientPromise from './src/lib/mongodb.js';
import { ethers } from 'ethers';

async function run() {
  const client = await clientPromise;
  const db = client.db();
  
  const settlements = await db.collection('settlements').find({ status: 'PENDING' }).toArray();
  console.log(`Found ${settlements.length} PENDING settlements`);
  
  for (const s of settlements) {
    console.log("Settlement ID:", s.id);
    console.log("Party ID:", s.partyId);
    console.log("SongRequest ID:", s.songRequestId);
    console.log("Amount:", s.amount);
    console.log("Outcome:", s.outcome);
    console.log("Recipient:", s.recipient);
    
    console.log("Expected partyId Hash:", ethers.id(s.partyId));
    console.log("Expected songRequestId Hash:", ethers.id(s.songRequestId));
    console.log("Expected outcome Hash:", ethers.id(s.outcome));
    console.log("Expected amount (wei):", ethers.parseUnits(s.amount.toString(), 18).toString());
    console.log("------------------");
  }
  process.exit(0);
}
run();

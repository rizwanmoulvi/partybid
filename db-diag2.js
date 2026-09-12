import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import clientPromise from './src/lib/mongodb.js';

async function run() {
  const client = await clientPromise;
  const db = client.db();
  
  const settlements = await db.collection('settlements').find().toArray();
  console.log(`Found ${settlements.length} total settlements`);
  
  for (const s of settlements) {
    console.log("Settlement ID:", s.id);
    console.log("SongRequest ID:", s.songRequestId);
    console.log("Status:", s.status);
    console.log("TxHash:", s.transactionHash);
    console.log("------------------");
  }
  process.exit(0);
}
run();

import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function test() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log("No MONGODB_URI");
    return;
  }
  try {
    console.log("Connecting to " + uri.split('@')[1] || uri);
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    await client.db().command({ ping: 1 });
    console.log("Connected successfully!");
    await client.close();
  } catch (e) {
    console.error("Connection failed:", e.message);
  }
}
test();

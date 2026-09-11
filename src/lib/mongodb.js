import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
const options = {};

let client;
let clientPromise;

if (!process.env.MONGODB_URI) {
  console.warn("Invalid/Missing environment variable: MONGODB_URI");
  // Mock promise to prevent build crash when env variables are missing.
  // We use resolve().then() so the error is only thrown when awaited at runtime,
  // avoiding unhandled promise rejections during static configuration collection.
  clientPromise = Promise.resolve().then(() => {
    throw new Error("Missing MONGODB_URI environment variable.");
  });
} else {
  if (process.env.NODE_ENV === "development") {
    if (!global._mongoClientPromise) {
      client = new MongoClient(uri, options);
      global._mongoClientPromise = client.connect();
    }
    clientPromise = global._mongoClientPromise;
  } else {
    client = new MongoClient(uri, options);
    clientPromise = client.connect();
  }
}

export default clientPromise;

import { ethers } from 'ethers';
import fs from 'fs';
import { MongoClient } from 'mongodb';

const MONGODB_URI = 'mongodb://127.0.0.1:27018/partybid_test';
const PORT = 3001;
const rpcUrl = 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(rpcUrl);

const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // The maker! Wait, the prompt says "use a small test amount". Wait, I should use the real AQUA_TEST_PRIVATE_KEY from .env.local because it has funds!

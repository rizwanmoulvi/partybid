import { ethers } from 'ethers';
const maker = "0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7";
const bidId = "BID_123";
const entropy = ethers.toBigInt(ethers.id(bidId));
const strategyBytes = ethers.solidityPacked(["address", "uint256"], [maker, entropy]);
const strategyHash = ethers.keccak256(strategyBytes);
console.log(`strategyBytes: ${strategyBytes}`);
console.log(`strategyHash: ${strategyHash}`);

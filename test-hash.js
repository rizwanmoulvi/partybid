import { ethers } from 'ethers';
const maker = "0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7";
const bidId = "BID_E2E";
const entropy = ethers.toBigInt(ethers.id(bidId));
const strategyBytes = ethers.solidityPacked(["address", "uint256"], [maker, entropy]);
console.log(ethers.keccak256(strategyBytes));

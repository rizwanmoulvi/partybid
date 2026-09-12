import { ethers } from 'ethers';

/**
 * The canonical strategy builder for PartyBid Aqua integration.
 * 
 * Constructs the exact strategy bytes required for the Aqua ship() operation.
 * 
 * @param {string} maker - The wallet address of the bid maker
 * @param {string} bidId - The authoritative MongoDB bid ID to use as entropy
 * @returns {{ strategyBytes: string, strategyHash: string }}
 */
export function buildStrategy(maker, bidId) {
  if (!ethers.isAddress(maker)) {
    throw new Error('Invalid maker address');
  }

  // Use the unique bidId entropy casted to an integer representing the "nonce" parameter of the strategy
  const entropy = ethers.toBigInt(ethers.id(bidId));
  
  // Strategy Bytes Encoding:
  // abi.encodePacked(address maker, uint256 entropy)
  // This matches the exact format tested in AQUA-3.x ship() proofs.
  const strategyBytes = ethers.solidityPacked(
    ["address", "uint256"], 
    [maker, entropy]
  );
  
  const strategyHash = ethers.keccak256(strategyBytes);
  
  return {
    strategyBytes,
    strategyHash
  };
}

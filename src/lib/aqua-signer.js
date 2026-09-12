import { ethers } from 'ethers';
import { buildStrategy } from './aqua-strategy.js';

// Fixed Testnet Config
const CHAIN_ID = 5042002;
const AQUA_APP_ADDRESS = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP;
const WUSDC_ADDRESS = process.env.WUSDC_ADDRESS || process.env.NEXT_PUBLIC_WUSDC;
const PLATFORM_RECIPIENT = process.env.PLATFORM_RECIPIENT;

export function getDomain() {
  const AQUA_APP_ADDRESS = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP;
  if (!AQUA_APP_ADDRESS) throw new Error("Missing NEXT_PUBLIC_PARTYBID_AQUA_APP");
  
  return {
    name: "PartyBidAquaApp",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: AQUA_APP_ADDRESS
  };
}

export const types = {
  Settlement: [
    { name: "partyId", type: "bytes32" },
    { name: "songRequestId", type: "bytes32" },
    { name: "bidId", type: "bytes32" },
    { name: "maker", type: "address" },
    { name: "strategyHash", type: "bytes32" },
    { name: "token", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "outcome", type: "bytes32" },
    { name: "recipient", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" }
  ]
};

export function parseAmountToBaseUnits(amountStr) {
  if (typeof amountStr === 'number') {
    amountStr = amountStr.toString();
  }
  return ethers.parseUnits(amountStr, 18);
}

export async function signSettlement(privateKey, settlementData) {
  const AQUA_APP_ADDRESS = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP;
  const WUSDC_ADDRESS = process.env.WUSDC_ADDRESS || process.env.NEXT_PUBLIC_WUSDC;
  const PLATFORM_RECIPIENT = process.env.PLATFORM_RECIPIENT;

  if (!AQUA_APP_ADDRESS) throw new Error("Missing NEXT_PUBLIC_PARTYBID_AQUA_APP");
  if (!WUSDC_ADDRESS) throw new Error("Missing WUSDC_ADDRESS");
  if (!PLATFORM_RECIPIENT) throw new Error("Missing PLATFORM_RECIPIENT");
  
  const wallet = new ethers.Wallet(privateKey);
  const domain = getDomain();

  const amountBaseUnits = parseAmountToBaseUnits(settlementData.amount);

  // Derive outcome
  let outcomeBytes;
  if (settlementData.outcome === "PLAYER_PAYOUT") {
    outcomeBytes = ethers.id("PLAYER_PAYOUT");
  } else if (settlementData.outcome === "PLATFORM_PAYOUT") {
    outcomeBytes = ethers.id("PLATFORM_PAYOUT");
  } else if (settlementData.outcome === "BIDDER_RELEASE") {
    outcomeBytes = ethers.id("BIDDER_RELEASE");
  } else {
    throw new Error("Unsupported outcome: " + settlementData.outcome);
  }

  // Derive recipient
  let recipientAddress;
  if (settlementData.outcome === "PLAYER_PAYOUT") {
    recipientAddress = ethers.getAddress(settlementData.recipientWallet);
  } else if (settlementData.outcome === "PLATFORM_PAYOUT") {
    recipientAddress = ethers.getAddress(PLATFORM_RECIPIENT);
  }
  
  const makerAddress = ethers.getAddress(settlementData.makerWallet);

  // Replay-safe nonce: hash the settlement ID
  const nonceBytes = ethers.id(settlementData.id);
  const nonce = ethers.toBigInt(nonceBytes);
  
  // Create deterministic strategyHash based on the bidId
  const { strategyHash } = buildStrategy(makerAddress, settlementData.bidId);

  const message = {
    partyId: ethers.id(settlementData.partyId),
    songRequestId: ethers.id(settlementData.songRequestId),
    bidId: ethers.id(settlementData.bidId),
    maker: makerAddress,
    strategyHash,
    token: ethers.getAddress(WUSDC_ADDRESS),
    amount: amountBaseUnits,
    outcome: outcomeBytes,
    recipient: recipientAddress,
    nonce,
    deadline: Math.floor(Date.now() / 1000) + 86400 // 24 hours
  };

  const signature = await wallet.signTypedData(domain, types, message);

  // Local verification
  const recoveredAddress = ethers.verifyTypedData(domain, types, message, signature);
  if (recoveredAddress !== wallet.address) {
    throw new Error("Local signature verification failed");
  }

  return {
    domain,
    types,
    primaryType: "Settlement",
    message,
    signature
  };
}

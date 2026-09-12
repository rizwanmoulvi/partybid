import { signSettlement } from '../src/lib/aqua-signer.js';
import { ethers } from 'ethers';

process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP = "0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071";
process.env.NEXT_PUBLIC_WUSDC = "0x911b4000D3422F482F4062a913885f7b035382Df";
process.env.NEXT_PUBLIC_PLATFORM_RECIPIENT = "0x7D5C5cCf29296cec4325c7510e2C0C0f9614d694";

const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; 

async function run() {
  const data = {
      id: 'settlement-858',
      partyId: 'PARTY_99',
      songRequestId: 'REQ_42',
      bidId: 'BID_12',
      makerWallet: '0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7',
      strategyHash: ethers.id('strat_12'),
      amount: '5.25',
      outcome: 'PLAYER_PAYOUT',
      recipientWallet: '0x4C45c578B8662cBAE3DC418E97E1f4655CC57b70'
  };
  const res = await signSettlement(privateKey, data);
  console.log(JSON.stringify({
    settlementId: data.id,
    typedData: {
      domain: res.domain,
      types: res.types,
      primaryType: res.primaryType,
      message: res.message
    },
    signature: res.signature
  }, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}
run();

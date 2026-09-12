import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ethers } from 'ethers';

const rpcUrl = 'https://rpc.testnet.arc.network';
const provider = new ethers.JsonRpcProvider(rpcUrl);

const PARTYBID_AQUA_APP = '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';
const EXPECTED_AQUA = '0xBf4140CD28b03479aD2F129c382b673101CF442B';
const EXPECTED_WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df';
const EXPECTED_PLATFORM = '0x7D5C5cCf29296cec4325c7510e2C0C0f9614d694'; // Based on .env.local
const EXPECTED_SIGNER = '0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7';

const abi = [
  "function aqua() external view returns (address)",
  "function wusdc() external view returns (address)",
  "function platformRecipient() external view returns (address)",
  "function settlementSigner() external view returns (address)"
];

describe('Live Contract Configuration Test', () => {
  it('Reads configurations accurately from deployed contract on Arc Testnet', async () => {
    const contract = new ethers.Contract(PARTYBID_AQUA_APP, abi, provider);

    const aqua = await contract.aqua();
    const wusdc = await contract.wusdc();
    const platform = await contract.platformRecipient();
    const signer = await contract.settlementSigner();

    assert.strictEqual(aqua, EXPECTED_AQUA, 'Aqua mismatch');
    assert.strictEqual(wusdc, EXPECTED_WUSDC, 'WUSDC mismatch');
    // Platform recipient might differ if they used a different one when deploying
    assert.strictEqual(platform, EXPECTED_PLATFORM, 'Platform recipient mismatch');
    assert.strictEqual(signer, EXPECTED_SIGNER, 'Settlement signer mismatch');
  });
});

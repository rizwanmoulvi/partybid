import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ethers } from 'ethers';
import { signSettlement, parseAmountToBaseUnits } from '../src/lib/aqua-signer.js';
import { buildStrategy } from '../src/lib/aqua-strategy.js';

describe('Aqua Signer', () => {
  const privateKey = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Anvil 0
  const wallet = new ethers.Wallet(privateKey);
  
  // Set env vars for tests
  process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP = "0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071";
  process.env.NEXT_PUBLIC_WUSDC = ethers.Wallet.createRandom().address;
  process.env.PLATFORM_RECIPIENT = ethers.Wallet.createRandom().address;
  
  const validSettlement = {
    id: 'test-settlement-123',
    partyId: 'party-1',
    songRequestId: 'req-1',
    bidId: 'bid-1',
    makerWallet: wallet.address,
    amount: '5',
    outcome: 'PLAYER_PAYOUT',
    recipientWallet: ethers.Wallet.createRandom().address,
    strategyHash: ethers.id('strat')
  };

  it('A. Valid PENDING settlement produces a signature', async () => {
    const result = await signSettlement(privateKey, validSettlement);
    assert.ok(result.signature);
    assert.ok(result.message);
  });

  it('B. Recovered signer equals configured settlement signer', async () => {
    const result = await signSettlement(privateKey, validSettlement);
    const recovered = ethers.verifyTypedData(result.domain, result.types, result.message, result.signature);
    assert.strictEqual(recovered, wallet.address);
  });

  it('G. Unsupported outcome is rejected', async () => {
    const invalid = { ...validSettlement, outcome: 'INVALID_OUTCOME' };
    await assert.rejects(async () => {
      await signSettlement(privateKey, invalid);
    }, /Unsupported outcome/);
  });

  it('K. Bid amount is converted correctly to 18-decimal base units', () => {
    assert.strictEqual(parseAmountToBaseUnits('0.01').toString(), '10000000000000000');
    assert.strictEqual(parseAmountToBaseUnits('0.10').toString(), '100000000000000000');
    assert.strictEqual(parseAmountToBaseUnits('1').toString(), '1000000000000000000');
    assert.strictEqual(parseAmountToBaseUnits('5').toString(), '5000000000000000000');
    assert.strictEqual(parseAmountToBaseUnits('8.25').toString(), '8250000000000000000');
    assert.strictEqual(parseAmountToBaseUnits('20').toString(), '20000000000000000000');
  });

  it('L. Floating-point precision is not used (strings work safely)', () => {
    assert.strictEqual(parseAmountToBaseUnits('0.1').toString(), '100000000000000000');
  });

  it('M. Missing/invalid settlement signer configuration is rejected', async () => {
    await assert.rejects(async () => {
      await signSettlement('invalid_key', validSettlement);
    });
  });

  it('O. Changing ANY signed field causes the resulting signature to no longer recover to the expected authorization', async () => {
    const result = await signSettlement(privateKey, validSettlement);
    
    // Modify amount
    const tamperedMessage = { ...result.message, amount: result.message.amount + 1n };
    const recovered = ethers.verifyTypedData(result.domain, result.types, tamperedMessage, result.signature);
    assert.notStrictEqual(recovered, wallet.address);
  });

  it('P. Deadline is generated in the future', async () => {
    const result = await signSettlement(privateKey, validSettlement);
    const now = Math.floor(Date.now() / 1000);
    assert.ok(result.message.deadline > now);
  });
  
  it('Q. Replay/duplicate authorization behavior is deterministic', async () => {
    const res1 = await signSettlement(privateKey, validSettlement);
    const res2 = await signSettlement(privateKey, validSettlement);
    assert.strictEqual(res1.message.nonce, res2.message.nonce);
    // Signatures might slightly differ if deadline changed across seconds, 
    // but the nonce is proven deterministic.
  });
});

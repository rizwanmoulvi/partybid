import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ethers } from 'ethers';
import { buildStrategy } from '../src/lib/aqua-strategy.js';

describe('Aqua Strategy Builder', () => {
  const maker1 = '0x7aad6559B98d6B558b065Ffcaa5114d558Dd61A7';
  const maker2 = '0x4C45c578B8662cBAE3DC418E97E1f4655CC57b70';
  const bidId1 = 'bid-123';
  const bidId2 = 'bid-456';

  it('Produces deterministic output for identical inputs', () => {
    const res1 = buildStrategy(maker1, bidId1);
    const res2 = buildStrategy(maker1, bidId1);
    
    assert.strictEqual(res1.strategyBytes, res2.strategyBytes);
    assert.strictEqual(res1.strategyHash, res2.strategyHash);
  });

  it('Outputs valid hex formats', () => {
    const res = buildStrategy(maker1, bidId1);
    assert.ok(res.strategyBytes.startsWith('0x'));
    assert.ok(res.strategyHash.startsWith('0x'));
    assert.strictEqual(res.strategyHash.length, 66); // 0x + 64 hex chars
  });

  it('Proves strategyHash == keccak256(strategyBytes)', () => {
    const res = buildStrategy(maker1, bidId1);
    const computedHash = ethers.keccak256(res.strategyBytes);
    assert.strictEqual(res.strategyHash, computedHash);
  });

  it('Different maker produces different hash and bytes', () => {
    const res1 = buildStrategy(maker1, bidId1);
    const res2 = buildStrategy(maker2, bidId1);
    
    assert.notStrictEqual(res1.strategyBytes, res2.strategyBytes);
    assert.notStrictEqual(res1.strategyHash, res2.strategyHash);
  });

  it('Different bidId produces different hash and bytes', () => {
    const res1 = buildStrategy(maker1, bidId1);
    const res2 = buildStrategy(maker1, bidId2);
    
    assert.notStrictEqual(res1.strategyBytes, res2.strategyBytes);
    assert.notStrictEqual(res1.strategyHash, res2.strategyHash);
  });

  it('Validates maker is an Ethereum address', () => {
    assert.throws(() => buildStrategy('invalid', bidId1), /Invalid maker address/);
  });
});

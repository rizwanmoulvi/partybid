"use client";

import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Button } from './ui/button';
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { useWallets } from '@privy-io/react-auth';

const ARC_CHAIN_ID = 5042002;
const AQUA_ADDRESS = '0xBf4140CD28b03479aD2F129c382b673101CF442B';
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';

const aquaAbi = [
  'function dock(address app, bytes32 strategyHash, address[] calldata tokens) external',
];

/**
 * SkipReleaseButton
 *
 * For BIDDER_RELEASE settlements: calls Aqua.dock() to release the committed
 * WUSDC position back to the maker's virtual balance (wallet is unchanged).
 *
 * Flow:
 *   PENDING → wallet dock() → backend release confirmation → COMPLETED
 *
 * @param {Object} props
 * @param {string} props.partyId
 * @param {Object} props.request
 * @param {Object} props.settlement - must have outcome === 'BIDDER_RELEASE'
 * @param {Function} props.getAccessToken
 * @param {Function} props.onCompleted - called with updated settlement
 */
export function SkipReleaseButton({ partyId, request, settlement, getAccessToken, onCompleted }) {
  const { wallets } = useWallets();
  const [status, setStatus] = useState(settlement?.status || 'PENDING');
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(settlement?.transactionHash || null);

  if (settlement?.outcome !== 'BIDDER_RELEASE') return null;

  if (status === 'COMPLETED') {
    return (
      <div className="flex flex-col gap-2 mt-2 p-3 bg-surface rounded-lg border border-green-500/20">
        <div className="flex items-center text-green-500 font-bold text-sm">
          <CheckCircle2 className="h-4 w-4 mr-2" />
          Bid Released ✓ — Your WUSDC was never moved.
        </div>
        {txHash && (
          <a
            href={`https://explorer.testnet.arc.network/tx/${txHash}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center text-xs text-accent hover:underline"
          >
            View Transaction <ExternalLink className="h-3 w-3 ml-1" />
          </a>
        )}
      </div>
    );
  }

  const handleRelease = async () => {
    try {
      setError(null);
      setStatus('EXECUTING');

      const activeWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];
      if (!activeWallet) throw new Error('No connected wallet');

      // Ensure correct chain
      const rawChainId = String(activeWallet.chainId || '');
      const chainId = parseInt(rawChainId.includes(':') ? rawChainId.split(':')[1] : rawChainId);
      if (chainId !== ARC_CHAIN_ID) {
        try { await activeWallet.switchChain(ARC_CHAIN_ID); }
        catch { throw new Error('Please connect to Arc Testnet (5042002).'); }
      }

      const eip1193 = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(eip1193);
      const signer = await provider.getSigner();

      // Fetch the strategyHash from the settlement's bid (server-authoritative)
      // We get it by loading bid info via the authorize endpoint's response
      const token = await getAccessToken();
      const authRes = await fetch('/api/settlement/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ settlementId: settlement.id }),
      });
      const authData = await authRes.json();
      if (!authRes.ok) throw new Error(authData.error || 'Failed to load settlement data');

      const strategyHash = authData.strategyHash;
      if (!strategyHash) throw new Error('Strategy hash missing from server response');

      // Call Aqua.dock() — releases the virtual balance back to the maker
      const aqua = new ethers.Contract(AQUA_ADDRESS, aquaAbi, signer);
      setStatus('CONFIRMING');
      const tx = await aqua.dock(PARTYBID_AQUA_APP, strategyHash, [process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df']);
      const receipt = await tx.wait();

      if (receipt.status !== 1) throw new Error('dock() transaction failed on chain');

      // Confirm with backend — verifies Aqua balance is 0, marks COMPLETED
      setStatus('VERIFYING');
      const releaseRes = await fetch(
        `/api/parties/${partyId}/requests/${request.id}/settlement/release`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ transactionHash: receipt.hash }),
        }
      );
      const releaseData = await releaseRes.json();
      if (!releaseRes.ok) throw new Error(releaseData.error || 'Backend release confirmation failed');

      setTxHash(receipt.hash);
      setStatus('COMPLETED');
      if (onCompleted) onCompleted(releaseData.settlement);

    } catch (err) {
      console.error(err);
      setError(err.message || 'Release failed');
      setStatus('FAILED');
    }
  };

  const isBusy = ['EXECUTING', 'CONFIRMING', 'VERIFYING'].includes(status);

  return (
    <div className="mt-2 p-3 bg-surface rounded-lg border border-border">
      {status === 'FAILED' && error && (
        <div className="mb-3 p-2 bg-destructive/10 text-destructive text-xs font-semibold rounded border border-destructive/20 flex items-start gap-1.5">
          <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>Release Failed: {error}</span>
        </div>
      )}
      <p className="text-xs text-muted-foreground mb-3">
        Song was skipped. Release your committed WUSDC back to your Aqua balance.
        <br />
        <span className="text-green-500 font-medium">Your wallet WUSDC was never moved.</span>
      </p>
      <Button
        size="sm"
        className="w-full font-bold"
        onClick={handleRelease}
        disabled={isBusy}
      >
        {status === 'EXECUTING' && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirm in wallet...</>}
        {status === 'CONFIRMING' && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Releasing on chain...</>}
        {status === 'VERIFYING' && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying release...</>}
        {(status === 'PENDING' || status === 'FAILED') && 'Release Commitment'}
      </Button>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Loader2, CheckCircle2, ExternalLink, AlertTriangle } from 'lucide-react';
import { useWallets } from '@privy-io/react-auth';

const ARC_CHAIN_ID = 5042002;
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';
const AQUA_ADDRESS = '0xBf4140CD28b03479aD2F129c382b673101CF442B';
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';

const wusdcAbi = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
];
const aquaAbi = [
  'function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash)',
];

/**
 * BidAquaModal
 *
 * Implements the correct Aqua-first bid flow:
 *   1. User enters bid amount
 *   2. Server validates & returns bidId + strategyBytes (no DB write yet)
 *   3. Frontend calls Aqua.ship()
 *   4. Server independently verifies ship tx + Aqua virtual balance
 *   5. Only then persists bid as ACTIVE in MongoDB
 *
 * @param {Object} props
 * @param {string} props.partyId
 * @param {Object} props.request - the song request object
 * @param {Function} props.getAccessToken
 * @param {Function} props.onBidPlaced - called with the new bid object after success
 * @param {Function} props.onClose
 */
export function BidAquaModal({ partyId, request, getAccessToken, onBidPlaced, onClose }) {
  const { wallets } = useWallets();

  // Steps:
  // 'INPUT'        — user entering amount
  // 'PREPARING'    — calling /bid/prepare on server
  // 'READY'        — prepared, show confirm details
  // 'APPROVING'    — WUSDC.approve() in progress
  // 'SHIPPING'     — Aqua.ship() in progress
  // 'CONFIRMING'   — backend verifying and persisting bid
  // 'DONE'         — bid committed successfully
  // 'FAILED'       — error occurred
  const [step, setStep] = useState('INPUT');
  const [amountInput, setAmountInput] = useState('');
  const [error, setError] = useState('');
  const [wusdcBalance, setWusdcBalance] = useState(null);
  const [preparedData, setPreparedData] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [finalBid, setFinalBid] = useState(null);
  const [shipFailed, setShipFailed] = useState(false); // true after ship tx submitted but confirm failed

  // Load wallet WUSDC balance for display
  useEffect(() => {
    const activeWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];
    if (!activeWallet) return;

    (async () => {
      try {
        const eip1193 = await activeWallet.getEthereumProvider();
        const provider = new ethers.BrowserProvider(eip1193);
        const wusdc = new ethers.Contract(WUSDC_ADDRESS, wusdcAbi, provider);
        const bal = await wusdc.balanceOf(activeWallet.address);
        setWusdcBalance(parseFloat(ethers.formatUnits(bal, 18)));
      } catch (e) {
        console.warn('Could not fetch WUSDC balance:', e.message);
      }
    })();
  }, [wallets]);

  const handlePrepare = async () => {
    setError('');
    const amountNum = parseFloat(amountInput);
    if (isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid positive amount.');
      return;
    }
    const rounded = Math.round(amountNum * 100) / 100;
    if (rounded < 0.01) {
      setError('Minimum bid is 0.01 WUSDC.');
      return;
    }

    setStep('PREPARING');
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/parties/${partyId}/requests/${request.id}/bid/prepare`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ amount: rounded }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to prepare bid');

      // Verify strategy hash integrity locally
      const computedHash = ethers.keccak256(data.strategyBytes);
      if (computedHash !== data.strategyHash) {
        throw new Error('Critical: Strategy hash mismatch from server');
      }

      setPreparedData(data);
      setStep('READY');
    } catch (err) {
      console.error(err);
      setError(err.message);
      setStep('INPUT');
    }
  };

  const handleCommit = async () => {
    setError('');
    setShipFailed(false);
    try {
      const activeWallet = wallets.find(w => w.walletClientType === 'privy') || wallets[0];
      if (!activeWallet) throw new Error('No connected wallet');

      // Ensure correct chain
      const rawChainId = String(activeWallet.chainId || '');
      const chainId = parseInt(rawChainId.includes(':') ? rawChainId.split(':')[1] : rawChainId);
      if (chainId !== ARC_CHAIN_ID) {
        try {
          await activeWallet.switchChain(ARC_CHAIN_ID);
        } catch {
          throw new Error('Please connect to Arc Testnet (5042002).');
        }
      }

      const eip1193 = await activeWallet.getEthereumProvider();
      const provider = new ethers.BrowserProvider(eip1193);
      const signer = await provider.getSigner();

      const wusdc = new ethers.Contract(WUSDC_ADDRESS, wusdcAbi, signer);
      const aqua = new ethers.Contract(AQUA_ADDRESS, aquaAbi, signer);

      const requiredWei = BigInt(preparedData.amountWei);

      // Check balance
      const balance = await wusdc.balanceOf(activeWallet.address);
      if (balance < requiredWei) {
        throw new Error(`Insufficient WUSDC. You need ${ethers.formatUnits(requiredWei, 18)} WUSDC.`);
      }

      // Approve if needed
      const allowance = await wusdc.allowance(activeWallet.address, AQUA_ADDRESS);
      if (allowance < requiredWei) {
        setStep('APPROVING');
        const txApprove = await wusdc.approve(AQUA_ADDRESS, requiredWei);
        await txApprove.wait();
      }

      // Ship
      setStep('SHIPPING');
      const txShip = await aqua.ship(
        PARTYBID_AQUA_APP,
        preparedData.strategyBytes,
        [WUSDC_ADDRESS],
        [requiredWei]
      );
      const receipt = await txShip.wait();
      const hash = receipt.hash;
      setTxHash(hash);

      // Confirm with backend (blockchain-first, database-second)
      setStep('CONFIRMING');
      const token = await getAccessToken();
      const confirmRes = await fetch(`/api/parties/${partyId}/requests/${request.id}/bid/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          bidId: preparedData.bidId,
          amount: preparedData.amount,
          shipTransactionHash: hash,
        }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        // Ship succeeded but confirm failed — blockchain is irreversible
        setShipFailed(true);
        throw new Error(
          confirmData.error ||
            'Bid was committed on-chain but backend confirmation failed. Do not retry the ship — contact support with your transaction hash.'
        );
      }

      setFinalBid(confirmData.bid);
      setStep('DONE');
      if (onBidPlaced) onBidPlaced(confirmData.bid);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Transaction failed');
      if (step !== 'CONFIRMING') {
        setStep('READY');
      } else {
        setStep('FAILED');
      }
    }
  };

  const stepLabel = {
    INPUT: null,
    PREPARING: 'Validating with server...',
    READY: null,
    APPROVING: 'Approving WUSDC spend...',
    SHIPPING: 'Committing to Aqua...',
    CONFIRMING: 'Verifying on-chain...',
    DONE: null,
    FAILED: null,
  };

  const isLoading = ['PREPARING', 'APPROVING', 'SHIPPING', 'CONFIRMING'].includes(step);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface border border-border p-6 rounded-xl shadow-xl flex flex-col gap-5 relative">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground text-lg"
          disabled={isLoading}
        >
          ✕
        </button>

        <div>
          <h2 className="text-xl font-bold">Commit Bid</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Your WUSDC remains in your wallet until the song is settled.
          </p>
        </div>

        {/* Song info */}
        <div className="bg-surface-elevated rounded-lg p-3 border border-border flex items-center gap-3">
          {request.artworkUrl && (
            <img src={request.artworkUrl} alt="" className="h-10 w-10 rounded object-cover" />
          )}
          <div className="min-w-0">
            <div className="font-semibold text-sm truncate">{request.title}</div>
            <div className="text-xs text-muted-foreground truncate">{request.artist}</div>
          </div>
        </div>

        {/* Balance info */}
        {wusdcBalance !== null && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-surface-elevated rounded-lg p-3 border border-border">
              <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">WUSDC Balance</div>
              <div className="font-bold text-accent">{wusdcBalance.toFixed(4)}</div>
            </div>
            {preparedData && (
              <div className="bg-surface-elevated rounded-lg p-3 border border-border">
                <div className="text-xs text-muted-foreground mb-1 uppercase font-semibold">Committing</div>
                <div className="font-bold">{preparedData.amount.toFixed(4)} WUSDC</div>
              </div>
            )}
          </div>
        )}

        {/* INPUT STEP */}
        {(step === 'INPUT' || step === 'PREPARING') && (
          <div className="flex flex-col gap-3">
            <label className="text-sm font-medium">Bid Amount (WUSDC)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.01"
                className="pl-7 bg-surface border-border"
                value={amountInput}
                onChange={(e) => { setAmountInput(e.target.value); setError(''); }}
                disabled={step === 'PREPARING'}
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}
            <Button
              onClick={handlePrepare}
              disabled={!amountInput || step === 'PREPARING'}
              className="w-full font-bold"
            >
              {step === 'PREPARING' ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Validating...</>
              ) : 'Review Bid'}
            </Button>
          </div>
        )}

        {/* READY / IN-PROGRESS STEP */}
        {(step === 'READY' || step === 'APPROVING' || step === 'SHIPPING' || step === 'CONFIRMING') && preparedData && (
          <div className="flex flex-col gap-4">
            <div className="bg-surface-elevated rounded-lg p-4 border border-border">
              <div className="text-xs text-muted-foreground mb-1">You are committing</div>
              <div className="text-2xl font-black text-accent">{preparedData.amount.toFixed(4)} WUSDC</div>
              <div className="text-xs text-muted-foreground mt-2">
                Strategy hash: <span className="font-mono">{preparedData.strategyHash.slice(0, 16)}…</span>
              </div>
            </div>

            {stepLabel[step] && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {stepLabel[step]}
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            {step === 'READY' && (
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('INPUT')}>
                  Back
                </Button>
                <Button onClick={handleCommit} className="flex-1 font-bold">
                  Approve & Commit
                </Button>
              </div>
            )}

            {(step === 'APPROVING' || step === 'SHIPPING' || step === 'CONFIRMING') && (
              <Button disabled className="w-full font-bold">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {stepLabel[step]}
              </Button>
            )}
          </div>
        )}

        {/* DONE STEP */}
        {step === 'DONE' && (
          <div className="flex flex-col items-center gap-4 py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <div className="text-center">
              <div className="text-lg font-bold text-green-500 mb-1">Bid Committed! 🎉</div>
              <div className="text-sm text-muted-foreground">
                {preparedData?.amount.toFixed(4)} WUSDC is committed to Aqua.
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Your WUSDC stays in your wallet until the song is settled.
              </div>
            </div>
            {txHash && (
              <a
                href={`https://explorer.testnet.arc.network/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-accent underline text-sm"
              >
                View on Explorer <ExternalLink className="h-3 w-3" />
              </a>
            )}
            <Button onClick={onClose} className="w-full font-bold mt-2">
              Done
            </Button>
          </div>
        )}

        {/* FAILED STEP (ship succeeded but confirm failed) */}
        {step === 'FAILED' && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 text-amber-600 text-sm rounded-lg">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold mb-1">Transaction succeeded, but confirmation is pending.</div>
                <div>{error}</div>
                {txHash && (
                  <a
                    href={`https://explorer.testnet.arc.network/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 text-amber-700 underline mt-2 text-xs"
                  >
                    View Ship Transaction <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
            <Button onClick={onClose} variant="outline" className="w-full">
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

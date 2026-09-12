import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Button } from './ui/button';
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { useWallets } from '@privy-io/react-auth';

const ARC_CHAIN_ID = 5042002;
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || '0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071';

const appAbi = [
  "function executeSettlement((bytes32 partyId, bytes32 songRequestId, bytes32 bidId, address maker, bytes32 strategyHash, address token, uint256 amount, bytes32 outcome, address recipient, uint256 nonce, uint256 deadline), bytes signature) external"
];

export function SettlementExecuteButton({ partyId, request, settlement, getAccessToken, onCompleted }) {
  const { wallets } = useWallets();
  const [status, setStatus] = useState(settlement?.status || 'PENDING');
  const [error, setError] = useState(null);
  const [txHash, setTxHash] = useState(settlement?.transactionHash || null);

  const handleExecute = async () => {
    try {
      setError(null);
      setStatus('EXECUTING');
      
      const activeWallet = wallets[0];
      if (!activeWallet) throw new Error("No connected wallet");

      const rawChainId = String(activeWallet.chainId || "");
      const chainId = parseInt(rawChainId.includes(":") ? rawChainId.split(":")[1] : rawChainId);
      if (chainId !== ARC_CHAIN_ID) {
        try {
          await activeWallet.switchChain(ARC_CHAIN_ID);
        } catch (e) {
          throw new Error("Please connect to Arc Testnet (5042002).");
        }
      }

      const token = await getAccessToken();
      
      // 1. Get Authorization from backend
      const authRes = await fetch(`/api/settlement/authorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ settlementId: settlement.id })
      });
      const authData = await authRes.json();
      if (!authRes.ok) throw new Error(authData.error || "Failed to authorize settlement");

      const { typedData, signature } = authData;
      
      const settlementArgs = [
        typedData.message.partyId,
        typedData.message.songRequestId,
        typedData.message.bidId,
        typedData.message.maker,
        typedData.message.strategyHash,
        typedData.message.token,
        typedData.message.amount,
        typedData.message.outcome,
        typedData.message.recipient,
        typedData.message.nonce,
        typedData.message.deadline
      ];

      // 2. Execute Transaction
      const provider = new ethers.BrowserProvider(await activeWallet.getEthereumProvider());
      const signer = await provider.getSigner();
      const appContract = new ethers.Contract(PARTYBID_AQUA_APP, appAbi, signer);

      const tx = await appContract.executeSettlement(settlementArgs, signature);
      
      setStatus('CONFIRMING');
      const receipt = await tx.wait();
      
      if (receipt.status !== 1) {
        throw new Error("Transaction failed on the blockchain");
      }
      
      // 3. Confirm with Backend
      const confirmRes = await fetch(`/api/parties/${partyId}/requests/${request.id}/settlement/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ transactionHash: receipt.hash })
      });
      
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error || "Backend confirmation failed");

      setTxHash(receipt.hash);
      setStatus('COMPLETED');
      if (onCompleted) onCompleted(confirmData.settlement);
      
    } catch (err) {
      console.error(err);
      setError(err.message || "An unknown error occurred");
      setStatus('FAILED');
    }
  };

  if (status === 'COMPLETED') {
    return (
      <div className="flex flex-col gap-2 mt-2 p-3 bg-surface rounded-lg border border-border">
        <div className="flex items-center text-green-500 font-bold text-sm">
          <CheckCircle2 className="h-4 w-4 mr-2" /> Settlement Completed
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

  return (
    <div className="mt-2 p-3 bg-surface rounded-lg border border-border">
      {status === 'FAILED' && (
        <div className="mb-3 p-2 bg-destructive/10 text-destructive text-xs font-semibold rounded border border-destructive/20 flex items-start">
          <XCircle className="h-4 w-4 mr-1.5 shrink-0" />
          <span>Settlement Failed: {error}</span>
        </div>
      )}
      
      <Button 
        size="sm" 
        className="w-full font-bold bg-accent text-accent-foreground hover:bg-accent/90"
        onClick={handleExecute}
        disabled={status === 'EXECUTING' || status === 'CONFIRMING'}
      >
        {status === 'EXECUTING' && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Confirming in wallet...</>}
        {status === 'CONFIRMING' && <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Waiting for blockchain confirmation...</>}
        {(status === 'PENDING' || status === 'FAILED') && "Execute Settlement"}
      </Button>
    </div>
  );
}

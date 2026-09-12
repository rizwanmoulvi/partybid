import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { useWallets } from '@privy-io/react-auth';

const ARC_CHAIN_ID = 5042002;
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || "0x911b4000D3422F482F4062a913885f7b035382Df";
const AQUA_ADDRESS = "0xBf4140CD28b03479aD2F129c382b673101CF442B";
const PARTYBID_AQUA_APP = process.env.NEXT_PUBLIC_PARTYBID_AQUA_APP || "0x2Bb9b80C0Bba2B1F50d98f72ec7dC4187ea7e071";

const wusdcAbi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function decimals() view returns (uint8)"
];

const aquaAbi = [
  "function ship(address app, bytes calldata strategy, address[] calldata tokens, uint256[] calldata amounts) external returns (bytes32 strategyHash)"
];

export function CommitModal({ open, onClose, payload, getAccessToken }) {
  const { wallets } = useWallets();
  const [step, setStep] = useState(1); // 1 = Fetching Auth, 2 = Ready, 3 = Approving, 4 = Shipping, 5 = Done
  const [error, setError] = useState(null);
  const [authData, setAuthData] = useState(null);
  const [txHash, setTxHash] = useState(null);

  useEffect(() => {
    if (open && payload) {
      setStep(1);
      setError(null);
      setAuthData(null);
      fetchAuthData();
    }
  }, [open, payload]);

  const fetchAuthData = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/settlement/authorize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ settlementId: payload.settlementId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to authorize");

      // Verify strategy hash locally
      const computedHash = ethers.keccak256(data.strategyBytes);
      if (computedHash !== data.strategyHash) {
        throw new Error("Critical Error: Strategy hash mismatch. Backend returned corrupt strategyBytes.");
      }

      setAuthData(data);
      setStep(2);
    } catch (err) {
      console.error(err);
      setError(err.message);
    }
  };

  const handleCommit = async () => {
    try {
      setError(null);
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

      const provider = new ethers.BrowserProvider(await activeWallet.getEthereumProvider());
      const signer = await provider.getSigner();
      
      const wusdc = new ethers.Contract(WUSDC_ADDRESS, wusdcAbi, signer);
      const aqua = new ethers.Contract(AQUA_ADDRESS, aquaAbi, signer);

      const requiredAmount = ethers.toBigInt(authData.typedData.message.amount);

      // Check balance
      const balance = await wusdc.balanceOf(activeWallet.address);
      if (balance < requiredAmount) {
        throw new Error(`Insufficient WUSDC. You need ${ethers.formatUnits(requiredAmount, 18)} WUSDC.`);
      }

      // Check allowance
      const allowance = await wusdc.allowance(activeWallet.address, AQUA_ADDRESS);
      if (allowance < requiredAmount) {
        setStep(3);
        const txApprove = await wusdc.approve(AQUA_ADDRESS, requiredAmount);
        await txApprove.wait();
      }

      setStep(4);
      // SHIP
      const txShip = await aqua.ship(
        PARTYBID_AQUA_APP, 
        authData.strategyBytes, 
        [WUSDC_ADDRESS], 
        [requiredAmount]
      );
      
      const receipt = await txShip.wait();
      setTxHash(receipt.hash);
      setStep(5);
    } catch (err) {
      console.error(err);
      setStep(2);
      setError(err.message || "Transaction failed");
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md bg-surface border border-border p-6 rounded-xl shadow-xl flex flex-col gap-4 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">✕</button>
        <h2 className="text-xl font-bold">Commit Bid to Aqua</h2>
        
        {step === 1 && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-accent mb-4" />
            <p className="text-sm text-muted-foreground">Authenticating payload securely...</p>
          </div>
        )}

        {step > 1 && authData && (
          <div className="space-y-4">
            <div className="bg-surface-elevated p-4 rounded-lg border border-border">
              <div className="text-sm text-muted-foreground mb-1">Amount</div>
              <div className="text-2xl font-bold text-accent">
                {ethers.formatUnits(authData.typedData.message.amount, 18)} WUSDC
              </div>
            </div>
            
            <div className="bg-surface-elevated p-4 rounded-lg border border-border text-xs break-all">
              <span className="text-muted-foreground font-semibold uppercase tracking-wider block mb-1">Strategy Hash</span>
              {authData.strategyHash}
            </div>
            
            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg font-medium">
                {error}
              </div>
            )}
            
            {step === 2 && (
              <Button onClick={handleCommit} className="w-full font-bold">
                Approve & Commit
              </Button>
            )}
            {step === 3 && (
              <Button disabled className="w-full font-bold">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Approving WUSDC...
              </Button>
            )}
            {step === 4 && (
              <Button disabled className="w-full font-bold">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Shipping to Aqua...
              </Button>
            )}
            {step === 5 && (
              <div className="text-center">
                <div className="text-green-500 font-bold mb-2">🎉 Successfully Committed!</div>
                <a href={`https://explorer.testnet.arc.network/tx/${txHash}`} target="_blank" rel="noreferrer" className="text-accent underline text-sm">
                  View on Explorer
                </a>
                <Button onClick={onClose} className="w-full mt-4 font-bold">Close</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

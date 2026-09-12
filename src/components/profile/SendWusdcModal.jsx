import React, { useState } from 'react';
import { ethers } from 'ethers';
import { useWallets } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react';

const ARC_CHAIN_ID = 5042002;
const WUSDC_ADDRESS = process.env.NEXT_PUBLIC_WUSDC || '0x911b4000D3422F482F4062a913885f7b035382Df';

const erc20Abi = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function balanceOf(address) view returns (uint256)"
];

export function SendWusdcModal({ availableBalance, onClose }) {
  const { wallets } = useWallets();
  const [step, setStep] = useState('input'); // input, review, sending, success
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState(null);

  const handleReview = () => {
    setError('');
    if (!ethers.isAddress(recipient)) {
      setError('Invalid wallet address');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Invalid amount');
      return;
    }
    if (numAmount > parseFloat(availableBalance || 0)) {
      setError('Insufficient balance');
      return;
    }
    setStep('review');
  };

  const handleSend = async () => {
    try {
      setError('');
      setStep('sending');
      const activeWallet = wallets[0];
      if (!activeWallet) throw new Error("No connected wallet");

      const rawChainId = String(activeWallet.chainId || "");
      const chainId = parseInt(rawChainId.includes(":") ? rawChainId.split(":")[1] : rawChainId);
      if (chainId !== ARC_CHAIN_ID) {
        await activeWallet.switchChain(ARC_CHAIN_ID);
      }

      const provider = new ethers.BrowserProvider(await activeWallet.getEthereumProvider());
      const signer = await provider.getSigner();
      const wusdc = new ethers.Contract(WUSDC_ADDRESS, erc20Abi, signer);

      const amountWei = ethers.parseUnits(amount.toString(), 18);
      const tx = await wusdc.transfer(recipient, amountWei);
      
      const receipt = await tx.wait();
      if (receipt.status !== 1) throw new Error("Transaction failed on blockchain");
      
      setTxHash(receipt.hash);
      setStep('success');
      
      // Auto-reload to refresh balances
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      
    } catch (err) {
      console.error(err);
      setError(err.message || 'Failed to send');
      setStep('input');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-surface border border-border rounded-xl shadow-lg flex flex-col relative overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h3 className="font-bold text-lg">Send WUSDC</h3>
          {step !== 'sending' && (
            <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          {step === 'input' && (
            <>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 block">Recipient</label>
                <Input 
                  placeholder="0x..." 
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                  className="font-mono text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex justify-between">
                  <span>Amount</span>
                  <span className="text-accent font-mono normal-case">Available: {availableBalance}</span>
                </label>
                <div className="relative">
                  <Input 
                    type="number"
                    placeholder="0.00" 
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="pr-16 text-lg font-bold"
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">
                    WUSDC
                  </div>
                </div>
              </div>
              
              {error && <div className="p-2 text-xs text-destructive bg-destructive/10 rounded">{error}</div>}
              
              <Button className="w-full font-bold mt-2" onClick={handleReview}>Review transaction</Button>
            </>
          )}

          {step === 'review' && (
            <>
              <div className="bg-background p-4 rounded-lg border border-border font-mono text-sm space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To</span>
                  <span className="text-right">{recipient.slice(0,6)}...{recipient.slice(-4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network</span>
                  <span>Arc Testnet</span>
                </div>
                <div className="flex justify-between pt-3 border-t border-border font-bold">
                  <span>You'll send</span>
                  <span className="text-accent">{amount} WUSDC</span>
                </div>
              </div>
              
              {error && <div className="p-2 text-xs text-destructive bg-destructive/10 rounded">{error}</div>}
              
              <div className="flex gap-3 mt-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep('input')}>Back</Button>
                <Button className="flex-1 font-bold bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleSend}>Confirm & Send</Button>
              </div>
            </>
          )}

          {step === 'sending' && (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-10 w-10 animate-spin text-accent mb-4" />
              <p className="font-bold">Confirming in wallet...</p>
              <p className="text-sm text-muted-foreground mt-2 text-center">Please approve the transaction in your Privy wallet and wait for blockchain confirmation.</p>
            </div>
          )}

          {step === 'success' && (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="font-bold text-lg mb-2">Sent Successfully</h3>
              <p className="text-muted-foreground text-sm mb-6">Your WUSDC has been transferred.</p>
              
              <a 
                href={`https://explorer.testnet.arc.network/tx/${txHash}`} 
                target="_blank" 
                rel="noreferrer" 
                className="flex items-center text-accent hover:underline text-sm font-medium mb-6"
              >
                View on Explorer <ExternalLink className="h-3 w-3 ml-1" />
              </a>
              
              <Button className="w-full font-bold" onClick={onClose}>Close</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

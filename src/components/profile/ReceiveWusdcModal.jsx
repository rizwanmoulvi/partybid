import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { X, Copy, Check, AlertTriangle } from 'lucide-react';

export function ReceiveWusdcModal({ walletAddress, onClose }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-surface border border-border rounded-xl shadow-lg flex flex-col relative overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <h3 className="font-bold text-lg">Receive WUSDC</h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        
        <div className="p-6 flex flex-col items-center text-center gap-4">
          <p className="text-sm text-muted-foreground mb-2">Scan this QR code or copy your wallet address.</p>
          
          <div className="bg-white p-4 rounded-xl shadow-sm mb-2">
            {/* Using a simple placeholder for QR since we don't want to add extra dependencies like qrcode.react unless necessary */}
            <div className="w-48 h-48 bg-muted flex items-center justify-center text-muted-foreground border-4 border-dashed border-border rounded-lg">
              QR Code 
              <br/>
              (Address)
            </div>
          </div>
          
          <div className="w-full bg-background p-3 rounded-lg border border-border font-mono text-xs break-all text-left relative pr-10">
            {walletAddress}
            <button 
              onClick={handleCopy}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-muted-foreground hover:text-foreground bg-background"
            >
              {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
          
          <div className="w-full bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 flex items-start gap-3 text-left mt-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0 mt-0.5" />
            <div className="text-xs text-yellow-500/90 font-medium">
              Only send WUSDC on the supported Arc Testnet network. Sending other tokens may result in permanent loss.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

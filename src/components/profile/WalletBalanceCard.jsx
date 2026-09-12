import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { SendWusdcModal } from './SendWusdcModal';
import { ReceiveWusdcModal } from './ReceiveWusdcModal';

export function WalletBalanceCard({ balances, walletAddress }) {
  const [showSend, setShowSend] = useState(false);
  const [showReceive, setShowReceive] = useState(false);

  return (
    <>
      <Card className="p-6 bg-surface border-border flex flex-col items-center justify-center text-center relative overflow-hidden">
        <p className="text-muted-foreground text-sm font-medium mb-2">WUSDC Balance</p>
        <h2 className="text-4xl font-black text-foreground mb-2">{balances?.wusdc || "0.00"} <span className="text-xl font-semibold text-muted-foreground">WUSDC</span></h2>
        
        <div className="bg-background/50 rounded-full px-4 py-1 flex items-center gap-2 border border-border text-xs font-medium">
          <span className="h-2 w-2 rounded-full bg-blue-500"></span>
          {balances?.usdc || "0.00"} USDC (Gas)
        </div>
        
        <div className="flex gap-4 mt-6 w-full max-w-[300px]">
          <Button 
            className="flex-1 bg-accent text-accent-foreground font-bold hover:bg-accent/90" 
            onClick={() => setShowSend(true)}
          >
            <ArrowUpRight className="mr-2 h-4 w-4" /> Send
          </Button>
          <Button 
            variant="outline"
            className="flex-1 font-bold" 
            onClick={() => setShowReceive(true)}
          >
            <ArrowDownLeft className="mr-2 h-4 w-4" /> Receive
          </Button>
        </div>
      </Card>
      
      {showSend && <SendWusdcModal availableBalance={balances?.wusdc} onClose={() => setShowSend(false)} />}
      {showReceive && <ReceiveWusdcModal walletAddress={walletAddress} onClose={() => setShowReceive(false)} />}
    </>
  );
}

"use client";

import { useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Copy, Check, LogOut, Loader2 } from "lucide-react";

export function WalletDisplay() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets } = useWallets();
  const [copied, setCopied] = useState(false);

  if (!ready) {
    return (
      <div className="h-10 w-24 flex items-center justify-center rounded-md bg-surface border border-border">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <Button onClick={login} variant="outline" size="sm" className="h-10 px-4">
        Sign In
      </Button>
    );
  }

  // Find embedded wallet, or fallback to the first connected wallet
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
  const address = embeddedWallet?.address;
  const shortAddress = address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "No Wallet";

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {address && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleCopy}
          className="h-10 font-mono text-xs text-muted-foreground hover:text-foreground"
        >
          {copied ? <Check className="h-3 w-3 mr-1.5" /> : <Copy className="h-3 w-3 mr-1.5" />}
          {shortAddress}
        </Button>
      )}
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={logout}
        className="h-10 w-10 text-muted-foreground hover:text-destructive"
        title="Log out"
      >
        <LogOut className="h-4 w-4" />
      </Button>
    </div>
  );
}

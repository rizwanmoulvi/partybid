import React from 'react';
import Link from 'next/link';
import { Disc3 } from 'lucide-react';
import { WalletDisplay } from '@/components/WalletDisplay';

export function AppShell({ children }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/80 backdrop-blur">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2 transition-colors hover:text-accent">
            <Disc3 className="h-6 w-6 text-accent" />
            <span className="font-bold tracking-tight">PartyBid</span>
          </Link>
          <WalletDisplay />
        </div>
      </header>
      <main className="flex-1">
        <div className="container mx-auto p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WalletDisplay } from "@/components/WalletDisplay";
import { WalletBalanceCard } from "@/components/profile/WalletBalanceCard";
import { BalanceBreakdown, PartyBidStats } from "@/components/profile/BalanceBreakdown";
import { ActivityList } from "@/components/profile/ActivityList";
import { AquaCommitments } from "@/components/profile/AquaCommitments";

export default function ProfilePage() {
  const { ready, authenticated, login, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async () => {
    try {
      if (!authenticated) return;
      setLoading(true);
      setError(null);
      const token = await getAccessToken();
      if (!token) {
        throw new Error("Authenticating...");
      }
      const activeWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
      const address = activeWallet?.address || '';
      
      const res = await fetch(`/api/profile?wallet=${address}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();
      setProfileData(data);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [authenticated, getAccessToken, wallets]);

  useEffect(() => {
    if (ready && authenticated) {
      fetchProfile();
    } else if (ready && !authenticated) {
      setLoading(false);
    }
  }, [ready, authenticated, fetchProfile]);

  if (!ready) {
    return <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>;
  }

  if (!authenticated) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <h1 className="text-3xl font-black mb-4">Your Profile</h1>
        <p className="text-muted-foreground mb-8">Connect your wallet to view your balance and activity.</p>
        <Button onClick={login} className="font-bold">Connect Wallet</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-black">Profile</h1>
          <p className="text-sm text-muted-foreground">Manage your wallet and PartyBid activity</p>
        </div>
        <WalletDisplay />
      </div>

      {loading && !profileData ? (
        <div className="flex justify-center p-12"><Loader2 className="h-8 w-8 animate-spin text-accent" /></div>
      ) : error && !profileData ? (
        <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <div className="flex-1">Failed to load profile. Please try again.</div>
          <Button variant="outline" size="sm" onClick={fetchProfile}>Retry</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <section>
            <WalletBalanceCard 
              balances={profileData?.balances} 
              walletAddress={profileData?.wallet?.address} 
            />
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Overview</h2>
            <BalanceBreakdown balances={profileData?.balances} stats={profileData?.stats} />
          </section>

          <section>
            <PartyBidStats stats={profileData?.stats} />
            <AquaCommitments balances={profileData?.balances} />
          </section>

          <section>
            <h2 className="text-xl font-bold mb-4">Recent Activity</h2>
            <ActivityList 
              activity={profileData?.activity} 
              getAccessToken={getAccessToken} 
              onSettlementCompleted={fetchProfile} 
            />
          </section>
        </div>
      )}
    </div>
  );
}

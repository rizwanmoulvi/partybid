"use client";

import { use, useEffect, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PartyHeader } from "@/components/PartyHeader";
import { SongCard } from "@/components/SongCard";
import { mockParty } from "@/lib/mockData";

export default function PartyPage({ params }) {
  const { partyId } = use(params);
  const { authenticated, login } = usePrivy();
  
  const [party, setParty] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchParty() {
      try {
        const res = await fetch(`/api/parties/${partyId}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to load party");
        }
        
        // Merge real party data with mock songs for now
        setParty({
          ...data,
          currentSong: mockParty.currentSong,
          queue: mockParty.queue,
          myActiveBids: mockParty.myActiveBids,
          peopleCount: 1 // Starting count
        });
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchParty();
  }, [partyId]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !party) {
    return (
      <div className="flex min-h-[calc(100vh-10rem)] flex-col items-center justify-center text-center p-6">
        <h2 className="text-2xl font-bold mb-2">Party not found</h2>
        <p className="text-muted-foreground mb-6">This party doesn't exist or has ended.</p>
        <Button onClick={() => window.location.href = '/create'}>Create a Party</Button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto pb-24 animate-in fade-in duration-500">
      <PartyHeader party={party} />

      <div className="space-y-8">
        <section>
          <h2 className="text-xl font-semibold mb-4 text-foreground/90">Now Playing</h2>
          <SongCard song={party.currentSong} isCurrent />
        </section>

        {!authenticated ? (
          <section className="bg-surface-elevated rounded-xl p-8 text-center border border-border">
            <h2 className="text-xl font-semibold mb-2">Join the Party</h2>
            <p className="text-muted-foreground mb-6">Authenticate to request songs and place bids.</p>
            <Button onClick={login} size="lg" className="font-semibold">
              Sign In to Participate
            </Button>
          </section>
        ) : (
          <>
            <section>
              <h2 className="text-xl font-semibold mb-4 text-foreground/90">Request a Song</h2>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input 
                    placeholder="Search for a track..." 
                    className="pl-10 h-12 bg-surface border-border"
                  />
                </div>
                <Button className="font-semibold h-12">Search</Button>
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-foreground/90">Live Queue</h2>
                <span className="text-sm text-muted-foreground">Highest bids play next</span>
              </div>
              <div className="space-y-3">
                {party.queue.map((song) => (
                  <SongCard key={song.id} song={song} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4 text-foreground/90">My Active Bids</h2>
              <div className="space-y-3">
                {party.myActiveBids.map((bid) => (
                  <SongCard key={bid.id} song={bid} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

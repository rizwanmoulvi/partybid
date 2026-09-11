"use client";

import { use, useEffect, useState, useCallback } from "react";
import { Search, Loader2 } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PartyHeader } from "@/components/PartyHeader";
import { SongCard } from "@/components/SongCard";
import { mockParty } from "@/lib/mockData";

export default function PartyPage({ params }) {
  const { partyId } = use(params);
  const { authenticated, login, user, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  
  const [party, setParty] = useState(null);
  const [membership, setMembership] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [selectedSong, setSelectedSong] = useState(null);
  
  const [requests, setRequests] = useState([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");

  const isDJ = authenticated && user?.id && party?.djUserId && user.id === party.djUserId;
  const isMember = isDJ || (membership && membership.member);

  const fetchRequests = useCallback(async () => {
    if (!authenticated) return;
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/parties/${partyId}/requests`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error("Failed to fetch requests:", err);
    }
  }, [partyId, authenticated, getAccessToken]);

  useEffect(() => {
    async function fetchPartyAndMembership() {
      try {
        const res = await fetch(`/api/parties/${partyId}`);
        const data = await res.json();
        
        if (!res.ok) {
          throw new Error(data.error || "Failed to load party");
        }
        
        setParty({
          ...data,
          currentSong: mockParty.currentSong, // Temporarily retain mock playing song
          peopleCount: 1
        });

        if (authenticated) {
          const token = await getAccessToken();
          if (user?.id !== data.djUserId) {
            const memRes = await fetch(`/api/parties/${partyId}/membership`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
            const memData = await memRes.json();
            if (memRes.ok) setMembership(memData);
          }
          await fetchRequests();
        }
      } catch (err) {
        console.error(err);
        setError(err.message);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchPartyAndMembership();
  }, [partyId, authenticated, user?.id, getAccessToken, fetchRequests]);

  const handleJoin = async () => {
    if (!authenticated) {
      login();
      return;
    }
    
    setIsJoining(true);
    try {
      const token = await getAccessToken();
      const embeddedWallet = wallets.find((w) => w.walletClientType === "privy") || wallets[0];
      
      const res = await fetch(`/api/parties/${partyId}/join`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ walletAddress: embeddedWallet?.address || null })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to join party");
      
      setMembership(data);
      await fetchRequests(); // Load requests after joining
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError("");
    setSearchResults(null);
    setSelectedSong(null);

    try {
      const res = await fetch(`/api/music/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || "Failed to search music");
      
      setSearchResults(data.results || []);
    } catch (err) {
      console.error(err);
      setSearchError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSubmitRequest = async () => {
    if (!selectedSong || !authenticated) return;
    
    setIsRequesting(true);
    setRequestError("");
    
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/parties/${partyId}/requests`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ song: selectedSong })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit request");
      
      setSelectedSong(null);
      await fetchRequests();
    } catch (err) {
      console.error(err);
      setRequestError(err.message);
    } finally {
      setIsRequesting(false);
    }
  };

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

        {!isMember ? (
          <section className="bg-surface-elevated rounded-xl p-8 text-center border border-border">
            <h2 className="text-xl font-semibold mb-2">Join the Party</h2>
            <p className="text-muted-foreground mb-6">Authenticate to request songs.</p>
            <Button onClick={handleJoin} size="lg" className="font-semibold h-12 px-8" disabled={isJoining}>
              {isJoining ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isJoining ? "Joining..." : "Join Party"}
            </Button>
          </section>
        ) : (
          <>
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-foreground/90">Request a Song</h2>
                {isDJ && <span className="text-xs font-semibold bg-accent/20 text-accent px-2 py-1 rounded">DJ</span>}
              </div>
              
              <form onSubmit={handleSearch} className="flex gap-2 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                  <Input 
                    placeholder="Search for a track..." 
                    className="pl-10 h-12 bg-surface border-border"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <Button type="submit" className="font-semibold h-12" disabled={isSearching || !searchQuery.trim()}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                </Button>
              </form>

              {searchError && (
                <div className="p-4 mb-6 rounded-lg bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
                  {searchError}
                </div>
              )}

              {searchResults !== null && !selectedSong && (
                <div className="space-y-3 mb-8">
                  {searchResults.length === 0 ? (
                    <div className="text-center p-8 text-muted-foreground bg-surface rounded-xl border border-border">
                      No results found for "{searchQuery}". Try a different search.
                    </div>
                  ) : (
                    searchResults.map((song) => (
                      <div 
                        key={song.id} 
                        onClick={() => setSelectedSong(song)}
                        className="cursor-pointer transition-transform active:scale-[0.98]"
                      >
                        <SongCard song={song} />
                      </div>
                    ))
                  )}
                </div>
              )}

              {selectedSong && (
                <div className="mb-8 p-4 bg-surface-elevated rounded-xl border border-border animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold">Selected Track</h3>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedSong(null)} className="h-8 text-muted-foreground">
                      Cancel
                    </Button>
                  </div>
                  <SongCard song={selectedSong} />
                  
                  {requestError && (
                    <div className="mt-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
                      {requestError}
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-border flex justify-end">
                    <Button onClick={handleSubmitRequest} disabled={isRequesting} className="w-full sm:w-auto font-semibold">
                      {isRequesting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {isRequesting ? "Submitting..." : "Request Song"}
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-foreground/90">Requests</h2>
                <span className="text-sm text-muted-foreground">Oldest first</span>
              </div>
              <div className="space-y-3">
                {requests.length === 0 ? (
                  <div className="text-center p-8 text-muted-foreground bg-surface rounded-xl border border-border border-dashed">
                    No requests yet. Be the first!
                  </div>
                ) : (
                  requests.map((request) => (
                    <SongCard key={request.id} song={request} />
                  ))
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

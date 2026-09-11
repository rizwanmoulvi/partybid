"use client";

import { use, useEffect, useState, useCallback } from "react";
import { Search, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PartyHeader } from "@/components/PartyHeader";
import { SongCard } from "@/components/SongCard";
import { mockParty } from "@/lib/mockData";

function PastSongCard({ partyId, request, getAccessToken }) {
  const [voteData, setVoteData] = useState(null);
  const [settlement, setSettlement] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState("");

  const isPlayed = request.status === 'PLAYED';
  const isSkipped = request.status === 'SKIPPED';

  const fetchState = useCallback(async () => {
    try {
      const token = await getAccessToken();
      
      // Fetch votes if PLAYED
      if (isPlayed) {
        const voteRes = await fetch(`/api/parties/${partyId}/requests/${request.id}/votes`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (voteRes.ok) {
          const voteJson = await voteRes.json();
          setVoteData(voteJson);
        }
      }

      // Fetch settlement status
      const settleRes = await fetch(`/api/parties/${partyId}/requests/${request.id}/settlement`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (settleRes.ok) {
        const settleJson = await settleRes.json();
        setSettlement(settleJson.settlement);
      }
    } catch (err) {
      console.error(err);
    }
  }, [partyId, request.id, getAccessToken, isPlayed]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const handleVote = async (voteValue) => {
    setIsVoting(true);
    setError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/parties/${partyId}/requests/${request.id}/votes`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ vote: voteValue })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to vote");
      await fetchState();
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="mb-4 relative opacity-80">
      <SongCard song={{ ...request, bidAmount: request.activeBidAmount }} />
      <div className="mt-2 p-4 bg-surface-elevated rounded-xl border border-border">
        <div className="flex justify-between items-center mb-3">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {isSkipped ? "SKIPPED" : "PLAYED"}
          </span>
        </div>

        {error && <div className="mb-3 text-sm text-destructive font-medium">{error}</div>}
        
        {isPlayed && (
          <div className="mb-4">
            {voteData ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-sm font-medium">
                  {voteData.result ? (
                    <span className={voteData.result === 'LIKED' ? 'text-green-500' : 'text-accent'}>
                      Result: {voteData.result === 'LIKED' ? '👍 Liked' : '👎 Not Liked'} ({voteData.totalVotes} votes)
                    </span>
                  ) : (
                    <span className="text-muted-foreground">
                      No votes yet. Be the first to vote!
                    </span>
                  )}
                </div>
                
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant={voteData.currentUserVote === 'LIKED' ? 'default' : 'outline'}
                    disabled={isVoting || !!voteData.currentUserVote}
                    onClick={() => handleVote('LIKED')}
                  >
                    <ThumbsUp className="h-4 w-4 mr-2" />
                    Liked {voteData.likedVotes > 0 && `(${voteData.likedVotes})`}
                  </Button>
                  <Button 
                    size="sm" 
                    variant={voteData.currentUserVote === 'NOT_LIKED' ? 'destructive' : 'outline'}
                    disabled={isVoting || !!voteData.currentUserVote}
                    onClick={() => handleVote('NOT_LIKED')}
                  >
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Not Liked {voteData.notLikedVotes > 0 && `(${voteData.notLikedVotes})`}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            )}
          </div>
        )}

        {/* Settlement Area */}
        {request.activeBidAmount > 0 && (
          <div className="pt-3 border-t border-border flex items-center justify-between text-sm">
            {settlement ? (
              <div className="font-semibold flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
                {settlement.outcome === 'PLAYER_PAYOUT' && <span className="text-green-500">Player payout pending</span>}
                {settlement.outcome === 'PLATFORM_PAYOUT' && <span className="text-accent">Platform payout pending</span>}
                {settlement.outcome === 'BIDDER_RELEASE' && <span className="text-muted-foreground">Bid release pending</span>}
              </div>
            ) : isSkipped || (isPlayed && voteData?.result) ? (
              <span className="text-muted-foreground italic flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Finalizing settlement...
              </span>
            ) : (
              <span className="text-muted-foreground italic">Settlement unresolved</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [playingSong, setPlayingSong] = useState(null);
  const [playedHistory, setPlayedHistory] = useState([]);
  const [isRequesting, setIsRequesting] = useState(false);
  const [requestError, setRequestError] = useState("");

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [currentBid, setCurrentBid] = useState(null);
  const [userBalance, setUserBalance] = useState(null);
  const [bidAmountInput, setBidAmountInput] = useState("");
  const [isPlacingBid, setIsPlacingBid] = useState(false);
  const [bidError, setBidError] = useState("");

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
        setPlayingSong(data.playing || null);
        setPlayedHistory(data.played || []);
      }
    } catch (err) {
      console.error("Failed to fetch requests:", err);
    }
  }, [partyId, authenticated, getAccessToken]);

  const handleSelectRequest = async (request) => {
    // Only allow selecting if the user owns the request
    if (request.userId !== user?.id) return;
    
    setSelectedRequest(request);
    setCurrentBid(null);
    setUserBalance(null);
    setBidAmountInput("");
    setBidError("");

    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/parties/${partyId}/requests/${request.id}/bid`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        if (data.bid) {
          setCurrentBid(data.bid);
          setBidAmountInput(data.bid.amount.toString());
        }
        if (data.balance) {
          setUserBalance(data.balance);
        }
      }
    } catch (err) {
      console.error("Failed to fetch bid:", err);
    }
  };

  const handlePlaceBid = async () => {
    if (!selectedRequest || !authenticated) return;
    
    const amountNum = parseFloat(bidAmountInput);
    if (isNaN(amountNum) || amountNum <= 0) {
      setBidError("Please enter a valid positive amount.");
      return;
    }

    // Client-side affordability check (server still enforces this!)
    if (userBalance) {
      const existingAmount = currentBid?.amount || 0;
      const effectiveAvailable = userBalance.availableBalance + existingAmount;
      if (amountNum > effectiveAvailable) {
        setBidError("Insufficient available balance.");
        return;
      }
    }

    setIsPlacingBid(true);
    setBidError("");

    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/parties/${partyId}/requests/${selectedRequest.id}/bid`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ amount: amountNum })
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to place bid");
      
      setCurrentBid(data.bid);
      setBidAmountInput(data.bid.amount.toString());
      if (data.balance) {
        setUserBalance(data.balance);
      }
      
      // Refresh the queue to show new rankings instantly
      await fetchRequests();
      
    } catch (err) {
      console.error(err);
      setBidError(err.message);
    } finally {
      setIsPlacingBid(false);
    }
  };

  const [isProcessingDJAction, setIsProcessingDJAction] = useState(false);

  const handleDJAction = async (requestId, action) => {
    if (!isDJ || isProcessingDJAction) return;
    setIsProcessingDJAction(true);
    
    try {
      const token = await getAccessToken();
      const res = await fetch(`/api/parties/${partyId}/requests/${requestId}/${action}`, {
        method: "POST",
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `Failed to ${action} request`);
      }
      
      await fetchRequests();
    } catch (err) {
      console.error(`DJ Action Error (${action}):`, err);
      // Depending on severity, we could show a toast here, but simple console is okay for demo
    } finally {
      setIsProcessingDJAction(false);
    }
  };

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
    setSelectedRequest(null); // Clear selected request if searching

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
          {playingSong ? (
            <div className="relative">
              <SongCard song={{ ...playingSong, bidAmount: playingSong.activeBidAmount }} isCurrent />
              {isDJ && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleDJAction(playingSong.id, 'played')}
                    disabled={isProcessingDJAction}
                  >
                    Mark Played
                  </Button>
                </div>
              )}
            </div>
          ) : party.currentSong ? (
            <SongCard song={party.currentSong} isCurrent />
          ) : (
            <div className="p-8 text-center text-muted-foreground bg-surface rounded-xl border border-border border-dashed">
              Nothing is playing right now.
            </div>
          )}
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
                  requests.map((request, index) => {
                    const isMyRequest = request.userId === user?.id;
                    const isSelected = selectedRequest?.id === request.id;
                    
                    return (
                      <div key={request.id} className="relative group">
                        <div 
                          onClick={() => isMyRequest && handleSelectRequest(request)}
                          className={`transition-transform ${isMyRequest ? "cursor-pointer active:scale-[0.98]" : "opacity-80"}`}
                        >
                          <SongCard 
                            queuePosition={index + 1}
                            song={{
                              ...request,
                              bidAmount: request.activeBidAmount
                            }} 
                          />
                        </div>
                        
                        {isDJ && (
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2 z-20 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button 
                              size="sm" 
                              variant="secondary" 
                              onClick={(e) => { e.stopPropagation(); handleDJAction(request.id, 'play'); }}
                              disabled={isProcessingDJAction}
                            >
                              Play
                            </Button>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              onClick={(e) => { e.stopPropagation(); handleDJAction(request.id, 'skip'); }}
                              disabled={isProcessingDJAction}
                            >
                              Skip
                            </Button>
                          </div>
                        )}
                        
                        {isSelected && (
                          <div className="mt-2 p-4 bg-surface-elevated rounded-xl border border-border animate-in fade-in">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="font-semibold">Place Bid</h3>
                              <Button variant="ghost" size="sm" onClick={() => setSelectedRequest(null)} className="h-8 text-muted-foreground">
                                Cancel
                              </Button>
                            </div>
                            
                            {userBalance && (
                              <div className="mb-4 flex gap-4 p-3 bg-surface rounded-lg border border-border text-sm">
                                <div className="flex-1">
                                  <div className="text-muted-foreground text-xs uppercase font-semibold">Demo Balance</div>
                                  <div className="font-bold">${userBalance.simulatedBalance.toFixed(2)}</div>
                                </div>
                                <div className="flex-1">
                                  <div className="text-muted-foreground text-xs uppercase font-semibold">Committed</div>
                                  <div className="font-bold text-accent">${userBalance.committedBalance.toFixed(2)}</div>
                                </div>
                                <div className="flex-1">
                                  <div className="text-muted-foreground text-xs uppercase font-semibold">Available</div>
                                  <div className="font-bold text-green-500">${userBalance.availableBalance.toFixed(2)}</div>
                                </div>
                              </div>
                            )}

                            {currentBid && (
                              <div className="mb-4 text-sm font-medium text-accent">
                                Current bid: ${currentBid.amount.toFixed(2)}
                              </div>
                            )}
                            
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                                <Input 
                                  type="number"
                                  min="0.01"
                                  step="0.01"
                                  placeholder="5.00"
                                  className="pl-7 bg-surface border-border"
                                  value={bidAmountInput}
                                  onChange={(e) => setBidAmountInput(e.target.value)}
                                />
                              </div>
                              <Button onClick={handlePlaceBid} disabled={isPlacingBid || !bidAmountInput} className="font-semibold">
                                {isPlacingBid ? <Loader2 className="h-4 w-4 animate-spin" /> : "Place Bid"}
                              </Button>
                            </div>
                            
                            {bidError && (
                              <div className="mt-3 p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium border border-destructive/20">
                                {bidError}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            {playedHistory.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-foreground/90">History & Voting</h2>
                </div>
                <div className="space-y-4">
                  {playedHistory.map((request) => (
                    <PastSongCard 
                      key={request.id} 
                      partyId={partyId} 
                      request={request} 
                      getAccessToken={getAccessToken} 
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

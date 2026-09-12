import React from 'react';

export function BalanceBreakdown({ balances, stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Available</div>
        <div className="text-xl font-bold">{balances?.wusdc || '—'} WUSDC</div>
      </div>
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Committed</div>
        <div className="text-xl font-bold">{balances?.committed || '—'} WUSDC</div>
      </div>
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Total Earned</div>
        <div className="text-xl font-bold text-green-500">{stats?.earned || '—'} WUSDC</div>
      </div>
      <div className="bg-surface border border-border rounded-lg p-4">
        <div className="text-xs text-muted-foreground uppercase tracking-wider font-bold mb-1">Total Spent</div>
        <div className="text-xl font-bold">{stats?.spent || '—'} WUSDC</div>
      </div>
    </div>
  );
}

export function PartyBidStats({ stats }) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6">
      <h3 className="font-bold text-lg mb-4">Your PartyBid Stats</h3>
      <div className="grid grid-cols-3 gap-y-6 gap-x-4 text-center sm:text-left">
        <div>
          <div className="text-2xl font-black">{stats?.partiesJoined || 0}</div>
          <div className="text-xs text-muted-foreground font-medium">Parties</div>
        </div>
        <div>
          <div className="text-2xl font-black">{stats?.songsRequested || 0}</div>
          <div className="text-xs text-muted-foreground font-medium">Songs</div>
        </div>
        <div>
          <div className="text-2xl font-black">{stats?.bids || 0}</div>
          <div className="text-xs text-muted-foreground font-medium">Bids</div>
        </div>
      </div>
    </div>
  );
}

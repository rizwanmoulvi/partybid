import React from 'react';
import { ExternalLink } from 'lucide-react';
import { SettlementExecuteButton } from '@/components/SettlementExecuteButton';

export function ActivityList({ activity, getAccessToken, onSettlementCompleted }) {
  if (!activity || activity.length === 0) {
    return (
      <div className="bg-surface border border-border rounded-xl p-8 text-center">
        <p className="text-muted-foreground">Your PartyBid activity will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {activity.map(item => (
        <ActivityItem 
          key={item.id} 
          item={item} 
          getAccessToken={getAccessToken} 
          onSettlementCompleted={onSettlementCompleted} 
        />
      ))}
    </div>
  );
}

function ActivityItem({ item, getAccessToken, onSettlementCompleted }) {
  const date = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  
  if (item.type === 'pending_settlement') {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse"></span>
            <span className="text-sm font-bold text-yellow-500">Pending Payout</span>
          </div>
          <div className="font-bold">{item.songName || 'Unknown Song'}</div>
          <div className="text-xs text-muted-foreground">{item.partyName || 'Unknown Party'}</div>
        </div>
        <div className="flex flex-col sm:items-end w-full sm:w-auto">
          <div className="text-lg font-bold mb-2">{item.amount} WUSDC</div>
          <div className="w-full sm:w-48">
            <SettlementExecuteButton 
              partyId={item.partyId}
              request={{ id: item.songRequestId }}
              settlement={item.settlement}
              getAccessToken={getAccessToken}
              onCompleted={onSettlementCompleted}
            />
          </div>
        </div>
      </div>
    );
  }

  if (item.type === 'payout') {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center">
        <div>
          <div className="text-xs font-bold text-green-500 uppercase tracking-wider mb-1">
            {item.outcome === 'PLAYER_PAYOUT' ? 'PLAYER PAYOUT' : 'PLATFORM PAYOUT'}
          </div>
          <div className="font-bold">{item.songName || 'Unknown Song'}</div>
          <div className="text-xs text-muted-foreground">{item.partyName || 'Unknown Party'}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold text-green-500">+{item.amount} WUSDC</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center justify-end gap-1">
            Completed • {date}
          </div>
          {item.txHash && (
             <a 
               href={`https://explorer.testnet.arc.network/tx/${item.txHash}`} 
               target="_blank" 
               rel="noreferrer" 
               className="flex items-center justify-end text-xs text-accent hover:underline mt-1"
             >
               {item.txHash.slice(0,6)}...{item.txHash.slice(-4)} <ExternalLink className="h-3 w-3 ml-1" />
             </a>
          )}
        </div>
      </div>
    );
  }

  if (item.type === 'bid') {
    return (
      <div className="bg-surface border border-border rounded-xl p-4 flex justify-between items-center">
        <div>
          <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Bid Placed</div>
          <div className="font-bold">{item.songName || 'Unknown Song'}</div>
          <div className="text-xs text-muted-foreground">{item.partyName || 'Unknown Party'}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{item.amount} WUSDC</div>
          <div className="text-xs text-muted-foreground mt-1 capitalize">{item.status.toLowerCase()} • {date}</div>
        </div>
      </div>
    );
  }

  return null;
}

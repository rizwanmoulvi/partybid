import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

export function AquaCommitments({ balances }) {
  const [expanded, setExpanded] = useState(false);
  
  if (!balances?.committed || balances.committed === '0') {
    return null;
  }

  return (
    <div className="bg-surface border border-border rounded-xl p-5 mb-6">
      <div className="flex justify-between items-center cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div>
          <h3 className="font-bold text-lg">Aqua Commitments</h3>
          <p className="text-sm text-muted-foreground">{balances.committed} WUSDC currently committed to active strategies.</p>
        </div>
        <Button variant="ghost" size="icon">
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </Button>
      </div>
      
      {expanded && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-sm text-muted-foreground italic text-center py-4">Detailed commitment history is actively managed by PartyBid. (Detailed breakdown coming soon)</p>
        </div>
      )}
    </div>
  );
}

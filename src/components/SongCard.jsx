import React from "react";
import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

export function SongCard({ song, isCurrent = false, queuePosition = null }) {
  const imageSource = song.artworkUrl || song.coverUrl;

  return (
    <Card className="flex items-center gap-4 p-4 hover:bg-surface-elevated transition-colors cursor-pointer border-border relative">
      {queuePosition !== null && (
        <div className="absolute -left-3 -top-3 w-8 h-8 rounded-full bg-accent text-accent-foreground flex items-center justify-center font-bold text-sm shadow-md border-2 border-background z-10">
          {queuePosition}
        </div>
      )}
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-elevated">
        {imageSource ? (
          <img src={imageSource} alt={song.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted">
            <span className="text-muted-foreground text-xs">No cover</span>
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-foreground truncate">{song.title}</h4>
        <p className="text-sm text-muted-foreground truncate">{song.artist}</p>
        {isCurrent && song.timeRemaining && (
          <p className="text-xs text-accent mt-1">{song.timeRemaining} remaining</p>
        )}
      </div>
      
      <div className="flex flex-col items-end shrink-0 gap-2">
        {song.bidAmount !== undefined && (
          <div className="flex items-center text-accent font-bold bg-accent/10 px-2 py-1 rounded-md">
            <DollarSign className="h-4 w-4 mr-0.5" />
            {song.bidAmount}
          </div>
        )}
        {song.status && (
          <div className="text-xs font-semibold px-2 py-1 bg-surface-elevated border border-border rounded-md text-muted-foreground uppercase tracking-wider">
            {song.status}
          </div>
        )}
      </div>
    </Card>
  );
}

import React from "react";
import { Users, Radio } from "lucide-react";

export function PartyHeader({ party }) {
  return (
    <div className="flex items-start justify-between pb-6 border-b border-border/50 mb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{party.name}</h1>
        <div className="flex items-center gap-4 mt-2 text-muted-foreground text-sm">
          <div className="flex items-center gap-1.5">
            <Radio className="h-4 w-4 text-accent animate-pulse" />
            <span className="font-medium text-accent">{party.status}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            <span>{party.peopleCount} listening</span>
          </div>
        </div>
      </div>
    </div>
  );
}

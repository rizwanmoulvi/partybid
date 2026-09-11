"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QrCode } from "lucide-react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

export default function JoinPartyPage() {
  const [partyId, setPartyId] = useState("");
  const router = useRouter();

  const handleJoin = (e) => {
    e.preventDefault();
    if (!partyId.trim()) return;
    
    router.push(`/p/${partyId.toUpperCase()}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
      <Card className="w-full max-w-md animate-in slide-in-from-bottom-4 duration-500">
        <CardHeader>
          <CardTitle className="text-2xl">Join a party</CardTitle>
          <CardDescription>Enter a party code or scan a QR code.</CardDescription>
        </CardHeader>
        <form onSubmit={handleJoin}>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="party-code" className="text-sm font-medium leading-none">
                Party Code
              </label>
              <Input
                id="party-code"
                placeholder="Enter 6-digit code"
                value={partyId}
                onChange={(e) => setPartyId(e.target.value)}
                className="uppercase tracking-widest text-center"
                maxLength={8}
                required
              />
            </div>
            
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-surface px-2 text-muted-foreground">Or</span>
              </div>
            </div>

            <Button type="button" variant="outline" className="w-full h-24 border-dashed">
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <QrCode className="h-8 w-8" />
                <span>Scan QR Code (Coming Soon)</span>
              </div>
            </Button>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full font-semibold" disabled={!partyId.trim()}>
              Join party
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

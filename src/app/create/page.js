"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

export default function CreatePartyPage() {
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { authenticated, login, getAccessToken } = usePrivy();

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim() || isLoading) return;
    setError("");

    if (!authenticated) {
      login();
      return;
    }
    
    setIsLoading(true);

    try {
      const token = await getAccessToken();
      const response = await fetch("/api/parties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ name }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create party");
      }

      router.push(`/p/${data.id}`);
    } catch (err) {
      console.error(err);
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)]">
      <Card className="w-full max-w-md animate-in slide-in-from-bottom-4 duration-500 border border-border">
        <CardHeader>
          <CardTitle className="text-2xl">Create a party</CardTitle>
          <CardDescription>Give your party a name to get started.</CardDescription>
        </CardHeader>
        <form onSubmit={handleCreate}>
          <CardContent>
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="party-name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                  Party Name
                </label>
                <Input
                  id="party-name"
                  placeholder="e.g. Friday Night"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading}
                  required
                  minLength={2}
                />
              </div>
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full font-semibold" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              {isLoading ? "Creating..." : "Create party"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

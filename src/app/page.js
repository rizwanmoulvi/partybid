import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] text-center space-y-8 animate-in fade-in duration-700">
      <div className="space-y-4 max-w-2xl">
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
          Bid for priority.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground">
          Turn your song request into a live party bid. Get it played. Let the crowd decide.
        </p>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto mt-8">
        <Button asChild size="lg" className="w-full sm:w-auto font-semibold">
          <Link href="/create">Create a party</Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full sm:w-auto font-semibold">
          <Link href="/join">Join a party</Link>
        </Button>
      </div>
    </div>
  );
}

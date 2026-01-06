import Link from "next/link";

import { HomeClient } from "@/components/home/HomeClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">ESA Edge Layer</Badge>
          <Badge variant="secondary">Web3 On-chain</Badge>
          <Badge variant="secondary">AI Agent</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          EdgeWave Nexus — Edge acceleration, on-chain visuals, AI insights
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          A champion-style demo that compresses three pillars into one experience: RPC racing at the edge, DeFi data
          aggregation every 30 seconds, and an AI agent that turns metrics into narrative.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href="/demo">Open Edge Sniper Demo</Link>
          </Button>
          <Button variant="secondary" asChild>
            <a href="#galaxy">3D DeFi Galaxy</a>
          </Button>
          <Button variant="secondary" asChild>
            <a href="#ai">AI Insight</a>
          </Button>
        </div>
      </section>

      <HomeClient />
    </main>
  );
}

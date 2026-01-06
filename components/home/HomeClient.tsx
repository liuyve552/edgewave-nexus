"use client";

import React, { memo, useEffect, useMemo, useState } from "react";

import type { ProtocolsData } from "@/contracts/defi";
import { ChatWithChain } from "@/components/ChatWithChain";
import { DefiDataGalaxy } from "@/components/defi/DefiDataGalaxy";
import { ErrorBoundary } from "@/components/error-boundary";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { config } from "@/lib/config";
import { getDefiStorm } from "@/lib/edge/defiAggregator";

function buildEmpty(): ProtocolsData {
  return {
    updatedAt: new Date().toISOString(),
    source: "local",
    chainId: 1,
    protocols: {
      uniswap_v3: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "Loading..." },
      aave: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "Loading..." },
      compound: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "Loading..." },
    },
  };
}

async function fetchDefiData(force?: boolean): Promise<ProtocolsData> {
  const url = config.nextPublicEdgeDefiAggregatorUrl;
  if (url) {
    const res = await fetch(`${url}${force ? "?force=1" : ""}`, { cache: "no-store" });
    return (await res.json()) as ProtocolsData;
  }

  // Local fallback (client-side): directly call public RPCs and aggregate in browser.
  return getDefiStorm(config.publicRpcUrls, { force: !!force });
}

export const HomeClient = memo(function HomeClient() {
  const [data, setData] = useState<ProtocolsData>(() => buildEmpty());
  const [err, setErr] = useState<string | null>(null);

  const aiUrl = useMemo(() => config.nextPublicEdgeAiInsightUrl, []);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async (force?: boolean) => {
      try {
        const next = await fetchDefiData(force);
        if (!cancelled) setData(next);
        if (!cancelled) setErr(null);
      } catch (e) {
        console.log("HomeClient fetchDefiData failed", e);
        if (!cancelled) setErr("DeFi data unavailable (check RPC/CORS or configure NEXT_PUBLIC_EDGE_DEFI_AGGREGATOR_URL).");
      } finally {
        timer = window.setTimeout(() => void tick(false), 30_000);
      }
    };

    void tick(true);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <section id="galaxy" className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">3D DeFi Galaxy</div>
            <div className="text-xs text-muted-foreground">
              Updated {new Date(data.updatedAt).toLocaleTimeString()} • Block {data.blockNumber ?? "—"}
            </div>
          </div>
          <Badge variant="outline">R3F + Drei</Badge>
        </div>
        {err ? (
          <Card className="p-4 text-sm text-muted-foreground">{err}</Card>
        ) : (
          <ErrorBoundary>
            <DefiDataGalaxy protocolsData={data} />
          </ErrorBoundary>
        )}
      </section>

      <section id="ai" className="space-y-4 scroll-mt-24">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">AI Agent Layer — Chain Insight</div>
            <Badge variant="outline">Streaming UI</Badge>
          </div>
          <Separator className="my-3" />
          <div className="text-sm text-muted-foreground">
            Uses Vercel AI SDK <code>useChat</code>. Configure <code>NEXT_PUBLIC_EDGE_AI_INSIGHT_URL</code> to point to your ESA
            edge AI function for the full on-edge demo.
          </div>
        </Card>
        {aiUrl ? <ChatWithChain api={aiUrl} /> : null}
        {!aiUrl ? (
          <Card className="p-4 text-sm text-muted-foreground">
            AI is running in fallback-disabled mode for static export. Set <code>NEXT_PUBLIC_EDGE_AI_INSIGHT_URL</code> in ESA Pages
            build env to enable the agent.
          </Card>
        ) : null}
      </section>
    </>
  );
});

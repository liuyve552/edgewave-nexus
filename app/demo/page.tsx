"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

type PanelStats = {
  label: string;
  fcpMs?: number;
  apiLatencyMs?: number;
  fastest?: string;
  blockNumber?: number;
  receiptLookupMs?: number;
  status: "idle" | "loading" | "ok" | "error";
};

type MetricsMessage = {
  type: "edgewave-metrics";
  side: "baseline" | "edgewave";
  payload: Omit<PanelStats, "label">;
};

const DEFAULT_PUBLIC_RPCS =
  process.env.NEXT_PUBLIC_RPC_URLS ??
  "https://cloudflare-eth.com,https://rpc.ankr.com/eth,https://eth.llamarpc.com";

const EDGE_RPC_ROUTER_URL = process.env.NEXT_PUBLIC_EDGE_RPC_ROUTER_URL ?? "";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function DemoPage() {
  const baselineRef = useRef<HTMLIFrameElement | null>(null);
  const edgewaveRef = useRef<HTMLIFrameElement | null>(null);

  const [slow, setSlow] = useState<PanelStats>({ label: "Baseline (Slow DApp)", status: "idle" });
  const [fast, setFast] = useState<PanelStats>({ label: "EdgeWave (Accelerated DApp)", status: "idle" });

  const baselineSrc = useMemo(() => {
    const qs = new URLSearchParams({
      rpcUrls: DEFAULT_PUBLIC_RPCS,
      delayMs: "500",
    });
    return `/baseline-dapp.html?${qs.toString()}`;
  }, []);

  const edgewaveSrc = useMemo(() => {
    const qs = new URLSearchParams({
      rpcUrls: DEFAULT_PUBLIC_RPCS,
      edgeRpcRouterUrl: EDGE_RPC_ROUTER_URL,
    });
    return `/edgewave-dapp.html?${qs.toString()}`;
  }, []);

  const postToIframes = useCallback((message: unknown) => {
    baselineRef.current?.contentWindow?.postMessage(message, window.location.origin);
    edgewaveRef.current?.contentWindow?.postMessage(message, window.location.origin);
  }, []);

  useEffect(() => {
    const onMessage = (evt: MessageEvent) => {
      if (evt.origin !== window.location.origin) return;
      const data = evt.data as Partial<MetricsMessage> | null;
      if (!data || data.type !== "edgewave-metrics" || !data.side || !data.payload) return;
      if (data.side === "baseline") setSlow((s) => ({ ...s, ...data.payload }));
      if (data.side === "edgewave") setFast((s) => ({ ...s, ...data.payload }));
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const maxLatency = 1800;
  const pct = (ms?: number) => (ms ? Math.round((clamp(ms, 0, maxLatency) / maxLatency) * 100) : 0);

  return (
    <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-6">
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">Edge Sniper Mode — Side-by-side proof</div>
            <div className="text-xs text-muted-foreground">Metrics via Performance API + iframe message bridge (client measured).</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => postToIframes({ type: "measure", what: "receipt" })}>
              Measure Tx Confirmation (Receipt Lookup)
            </Button>
            <Button onClick={() => postToIframes({ type: "measure", what: "block" })}>Refresh</Button>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Baseline FCP (iframe)</div>
            <div className="text-lg font-mono">{slow.fcpMs ? `${slow.fcpMs.toFixed(0)} ms` : "—"}</div>
            <Progress value={pct(slow.fcpMs)} className="mt-2" />
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Baseline API latency</div>
            <div className="text-lg font-mono">{slow.apiLatencyMs ? `${slow.apiLatencyMs.toFixed(0)} ms` : "—"}</div>
            <Progress value={pct(slow.apiLatencyMs)} className="mt-2" />
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">EdgeWave API latency</div>
            <div className="text-lg font-mono">{fast.apiLatencyMs ? `${fast.apiLatencyMs.toFixed(0)} ms` : "—"}</div>
            <Progress value={pct(fast.apiLatencyMs)} className="mt-2" />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <FrameCard title={slow.label} badge="Normal Server (simulated)" src={baselineSrc} refEl={baselineRef} stats={slow} />
        <FrameCard
          title={fast.label}
          badge={EDGE_RPC_ROUTER_URL ? "ESA Edge RPC Router" : "Client-side RPC Race (fallback)"}
          src={edgewaveSrc}
          refEl={edgewaveRef}
          stats={fast}
        />
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">How this works</div>
          <Badge variant="secondary">Promise.race + Promise.any</Badge>
        </div>
        <Separator className="my-3" />
        <div className="text-sm text-muted-foreground">
          Baseline iframe hits a single public RPC (plus intentional delay). EdgeWave iframe calls the ESA RPC router when configured,
          otherwise it performs a client-side RPC race fallback.
        </div>
      </Card>
    </main>
  );
}

function FrameCard({
  title,
  badge,
  src,
  refEl,
  stats,
}: {
  title: string;
  badge: string;
  src: string;
  refEl: React.RefObject<HTMLIFrameElement | null>;
  stats: PanelStats;
}) {
  const statusBadge =
    stats.status === "ok" ? (
      <Badge>OK</Badge>
    ) : stats.status === "loading" ? (
      <Badge variant="secondary">Loading</Badge>
    ) : stats.status === "error" ? (
      <Badge variant="destructive">Error</Badge>
    ) : (
      <Badge variant="outline">Idle</Badge>
    );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{badge}</div>
        </div>
        <div className="flex items-center gap-2">{statusBadge}</div>
      </div>

      <Separator className="my-3" />

      <div className="grid gap-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Fastest path</span>
          <span className="truncate font-mono">{stats.fastest ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Block number</span>
          <span className="font-mono">{stats.blockNumber ?? "—"}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Tx confirmation</span>
          <span className="font-mono">{stats.receiptLookupMs ? `${stats.receiptLookupMs.toFixed(0)} ms` : "—"}</span>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border">
        <iframe
          ref={refEl}
          title={title}
          src={src}
          className="h-[520px] w-full bg-background"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
    </Card>
  );
}

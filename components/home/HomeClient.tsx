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
      uniswap_v3: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "加载中..." },
      aave: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "加载中..." },
      compound: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "加载中..." },
    },
  };
}

async function fetchDefiData(force?: boolean): Promise<ProtocolsData> {
  // Local fallback (client-side): directly call public RPCs and aggregate in browser.
  return getDefiStorm(config.publicRpcUrls, { force: !!force });
}

export const HomeClient = memo(function HomeClient() {
  const [data, setData] = useState<ProtocolsData>(() => buildEmpty());
  const [err, setErr] = useState<string | null>(null);

  const [edgeDefiUrl, setEdgeDefiUrl] = useState<string>(() => config.nextPublicEdgeDefiAggregatorUrl || "");
  const [edgeAiUrl, setEdgeAiUrl] = useState<string>(() => config.nextPublicEdgeAiInsightUrl || "");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return;
    if (!edgeDefiUrl) setEdgeDefiUrl(new URL("/edge/defi", window.location.origin).toString());
    if (!edgeAiUrl) setEdgeAiUrl(new URL("/edge/ai", window.location.origin).toString());
  }, [edgeAiUrl, edgeDefiUrl]);

  const aiUrl = useMemo(() => edgeAiUrl, [edgeAiUrl]);

  const cacheBadge = useMemo(() => {
    const layer = data.cache?.layer;
    if (layer === "kv") return "EdgeKV";
    if (layer === "memory") return "Memory";
    if (layer === "live") return "Live";
    return null;
  }, [data.cache?.layer]);

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async (force?: boolean) => {
      try {
        let next: ProtocolsData | null = null;
        if (edgeDefiUrl) {
          try {
            const res = await fetch(`${edgeDefiUrl}${force ? "?force=1" : ""}`, { cache: "no-store" });
            if (res.ok) next = (await res.json()) as ProtocolsData;
          } catch {
            // ignore
          }
        }
        if (!next) next = await fetchDefiData(force);
        if (!cancelled) setData(next);
        if (!cancelled) setErr(null);
      } catch (e) {
        console.log("HomeClient fetchDefiData failed", e);
        if (!cancelled) setErr("DeFi 数据暂不可用（检查 RPC/CORS；如需边缘聚合请确认已部署 Functions 并启用 EdgeKV）。");
      } finally {
        timer = window.setTimeout(() => void tick(false), 30_000);
      }
    };

    void tick(true);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [edgeDefiUrl]);

  return (
    <>
      <section id="galaxy" className="space-y-4 scroll-mt-24">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-sm font-medium">3D DeFi 星系</div>
            <div className="text-xs text-muted-foreground">
              更新时间 {new Date(data.updatedAt).toLocaleTimeString("zh-CN")} | 区块 {data.blockNumber ?? "暂无"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline">R3F + Drei</Badge>
            <Badge variant={data.source === "edge" ? "secondary" : "outline"}>{data.source === "edge" ? "ESA Edge" : "Local"}</Badge>
            {cacheBadge ? <Badge variant="outline">Cache: {cacheBadge}</Badge> : null}
          </div>
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
            <div className="text-sm font-medium">AI 代理层：链上洞察</div>
            <Badge variant="outline">流式 UI</Badge>
          </div>
          <Separator className="my-3" />
          <div className="text-sm text-muted-foreground">
            为适配 ESA Pages 静态部署并确保评委侧无需配置密钥/外部服务，AI 模块默认使用浏览器端“确定性洞察生成器”输出结构化报告；如你已部署 ESA 边缘 AI
            函数，可通过 <code>NEXT_PUBLIC_EDGE_AI_INSIGHT_URL</code> 切换到边缘流式模式（可选能力）。
          </div>
        </Card>
        <ChatWithChain api={aiUrl || undefined} data={data} />
      </section>
    </>
  );
});

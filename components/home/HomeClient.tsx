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
        if (!cancelled) setErr("DeFi 数据暂不可用（检查 RPC/CORS，或在 ESA Pages 配置 NEXT_PUBLIC_EDGE_DEFI_AGGREGATOR_URL）。");
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
            <div className="text-sm font-medium">3D DeFi 星系</div>
            <div className="text-xs text-muted-foreground">
              更新时间 {new Date(data.updatedAt).toLocaleTimeString("zh-CN")} | 区块 {data.blockNumber ?? "暂无"}
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
            <div className="text-sm font-medium">AI 代理层：链上洞察</div>
            <Badge variant="outline">流式 UI</Badge>
          </div>
          <Separator className="my-3" />
          <div className="text-sm text-muted-foreground">
            使用 Vercel AI SDK 的 <code>useChat</code>。如需开启 ESA 边缘 AI 演示，请将 <code>NEXT_PUBLIC_EDGE_AI_INSIGHT_URL</code>{" "}
            配置为你的 ESA 边缘函数地址。
          </div>
        </Card>
        {aiUrl ? <ChatWithChain api={aiUrl} /> : null}
        {!aiUrl ? (
          <Card className="p-4 text-sm text-muted-foreground">
            当前为静态导出模式，AI 功能默认关闭。请在 ESA Pages 构建环境变量中设置 <code>NEXT_PUBLIC_EDGE_AI_INSIGHT_URL</code>{" "}
            来启用 AI 洞察助手。
          </Card>
        ) : null}
      </section>
    </>
  );
});

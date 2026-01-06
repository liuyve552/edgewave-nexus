import Link from "next/link";

import { HomeClient } from "@/components/home/HomeClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">ESA 边缘层</Badge>
          <Badge variant="secondary">Web3 链上</Badge>
          <Badge variant="secondary">AI 代理</Badge>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          EdgeWave Nexus：边缘加速、链上可视化、AI 洞察
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          一个面向评审的综合演示：把三件事压缩到一次体验里——边缘侧 RPC 竞速、30 秒节奏的 DeFi 链上指标聚合、以及将指标转为可读报告的 AI 洞察助手。
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link href="/demo">打开 Edge Sniper 对比演示</Link>
          </Button>
          <Button variant="secondary" asChild>
            <a href="#galaxy">查看 3D DeFi 星系</a>
          </Button>
          <Button variant="secondary" asChild>
            <a href="#ai">AI 洞察助手</a>
          </Button>
        </div>
      </section>

      <HomeClient />
    </main>
  );
}

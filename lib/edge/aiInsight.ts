import type { ProtocolsData } from "@/contracts/defi";

function pickTopic(question: string) {
  const q = question.toLowerCase();
  const raw = question;
  if (q.includes("uniswap")) return "uniswap_v3";
  if (q.includes("uni") || raw.includes("优尼") || raw.includes("云上") || raw.includes("Uniswap")) return "uniswap_v3";
  if (q.includes("aave")) return "aave";
  if (raw.includes("Aave") || raw.includes("爱")) return "aave";
  if (q.includes("compound")) return "compound";
  if (raw.includes("Compound") || raw.includes("康宝") || raw.includes("复合")) return "compound";
  if (q.includes("tvl") || raw.includes("锁仓") || raw.includes("总锁仓") || raw.includes("锁定")) return "tvl";
  if (q.includes("volume") || raw.includes("成交量") || raw.includes("交易量") || raw.includes("交易额")) return "volume";
  return "overview";
}

/**
 * Fallback "edge LLM" implementation: deterministic, structured analysis.
 * Use this when you cannot run a real model in the ESA edge runtime.
 */
export function generateInsightMarkdown(question: string, data: ProtocolsData) {
  const topic = pickTopic(question);
  const p = data.protocols;

  const lines: string[] = [];
  lines.push(`# EdgeWave Nexus：链上洞察`);
  lines.push(``);
  lines.push(`**问题**：${question}`);
  lines.push(`**更新时间**：${data.updatedAt}`);
  if (data.blockNumber) lines.push(`**区块**：${data.blockNumber}`);
  lines.push(``);

  const sorted = Object.entries(p).sort((a, b) => b[1].tvlUsdApprox - a[1].tvlUsdApprox);
  const leader = sorted[0]?.[0] ?? "unknown";
  const healthLabel = (h: string) => (h === "ok" ? "正常" : h === "degraded" ? "降级" : h);

  lines.push(`## 快照`);
  for (const [id, m] of sorted) {
    lines.push(
      `- **${id}**：TVL≈$${m.tvlUsdApprox.toFixed(2)} | 成交量(24h)≈$${m.volumeUsdApprox24h.toFixed(2)} | ${healthLabel(m.health)}`,
    );
  }
  lines.push(``);

  lines.push(`## 解读`);
  if (topic === "overview") {
    lines.push(`- 当前 TVL 领先：**${leader}**（代理指标，仅用于趋势对比）。`);
    lines.push(`- 成交量(24h)≈ 为演示用合成指标：基于 30 秒采样的相邻差分，主要用于展示动量。`);
  } else if (topic === "tvl") {
    lines.push(`- TVL≈ 为代理指标：由少量链上只读信号推导；建议对比趋势，而非绝对美元值。`);
  } else if (topic === "volume") {
    lines.push(`- 成交量(24h)≈ 为合成指标：由短间隔差分计算，用于展示相对活跃度。`);
  } else {
    lines.push(`- 你关注的是 **${topic}**：`);
    const m = (p as Record<string, { tvlUsdApprox: number; volumeUsdApprox24h: number; health: string }>)[topic];
    if (m) {
      lines.push(`  - TVL≈$${m.tvlUsdApprox.toFixed(2)}`);
      lines.push(`  - 成交量(24h)≈$${m.volumeUsdApprox24h.toFixed(2)}`);
      lines.push(`  - 健康度：${m.health}`);
    } else {
      lines.push(`  - 当前数据集中未找到匹配协议。`);
    }
  }
  lines.push(``);

  lines.push(`## 建议继续提问`);
  lines.push(`- “对比 Uniswap 和 Compound 最近一分钟的动量”`);
  lines.push(`- “哪些协议处于降级状态？原因可能是什么？”`);
  lines.push(``);

  return lines.join("\n");
}


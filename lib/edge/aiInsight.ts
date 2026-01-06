import type { ProtocolsData } from "@/contracts/defi";

function pickTopic(question: string) {
  const q = question.toLowerCase();
  if (q.includes("uniswap")) return "uniswap_v3";
  if (q.includes("aave")) return "aave";
  if (q.includes("compound")) return "compound";
  if (q.includes("tvl")) return "tvl";
  if (q.includes("volume")) return "volume";
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
  lines.push(`# EdgeWave Nexus — On-chain Insight`);
  lines.push(``);
  lines.push(`**Question**: ${question}`);
  lines.push(`**UpdatedAt**: ${data.updatedAt}`);
  if (data.blockNumber) lines.push(`**Block**: ${data.blockNumber}`);
  lines.push(``);

  const sorted = Object.entries(p).sort((a, b) => b[1].tvlUsdApprox - a[1].tvlUsdApprox);
  const leader = sorted[0]?.[0] ?? "unknown";

  lines.push(`## Snapshot`);
  for (const [id, m] of sorted) {
    lines.push(
      `- **${id}** — TVL≈$${m.tvlUsdApprox.toFixed(2)} | Vol(24h)≈$${m.volumeUsdApprox24h.toFixed(2)} | ${m.health}`,
    );
  }
  lines.push(``);

  lines.push(`## Interpretation`);
  if (topic === "overview") {
    lines.push(`- Current TVL leader: **${leader}** (proxy metric).`);
    lines.push(`- Volume proxy is derived from consecutive samples (30s cadence) to visualize momentum.`);
  } else if (topic === "tvl") {
    lines.push(`- TVL≈ is a proxy derived from minimal on-chain signals; compare trends, not absolute USD value.`);
  } else if (topic === "volume") {
    lines.push(`- Volume(24h)≈ is a synthetic metric computed from short-interval deltas to show relative activity.`);
  } else {
    lines.push(`- You asked about **${topic}**:`);
    const m = (p as Record<string, { tvlUsdApprox: number; volumeUsdApprox24h: number; health: string }>)[topic];
    if (m) {
      lines.push(`  - TVL≈$${m.tvlUsdApprox.toFixed(2)}`);
      lines.push(`  - Vol(24h)≈$${m.volumeUsdApprox24h.toFixed(2)}`);
      lines.push(`  - Health: ${m.health}`);
    } else {
      lines.push(`  - No matching protocol found in the current dataset.`);
    }
  }
  lines.push(``);

  lines.push(`## Suggested Next Query`);
  lines.push(`- "Compare Uniswap vs Compound momentum in the last minute"`);
  lines.push(`- "Which protocol is degraded and why?"`);
  lines.push(``);

  return lines.join("\n");
}


/**
 * ESA Edge Function: edgeAIInsight
 * - Parses user questions, calls edgeDefiAggregator (or direct RPC), and generates insights.
 * - Two modes:
 *   1) Transformers.js / ONNX on-edge (best-effort; often not feasible in ESA environments)
 *   2) Deterministic structured analysis fallback (always works) ✅
 * - Returns a streamed plaintext response for Vercel AI SDK `useChat` streaming UI.
 */

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  // For contest demo purposes, allow any Origin (read-only insights).
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "content-type": "text/plain; charset=utf-8",
  };
}

function pickTopic(question) {
  const q = String(question || "").toLowerCase();
  const raw = String(question || "");
  if (q.includes("uniswap")) return "uniswap_v3";
  if (q.includes("uni") || raw.includes("优尼") || raw.includes("Uniswap")) return "uniswap_v3";
  if (q.includes("aave")) return "aave";
  if (raw.includes("Aave") || raw.includes("爱")) return "aave";
  if (q.includes("compound")) return "compound";
  if (raw.includes("Compound") || raw.includes("复合")) return "compound";
  if (q.includes("tvl") || raw.includes("锁仓") || raw.includes("总锁仓") || raw.includes("锁定")) return "tvl";
  if (q.includes("volume") || raw.includes("成交量") || raw.includes("交易量") || raw.includes("交易额")) return "volume";
  return "overview";
}

function generateInsightMarkdown(question, data) {
  const topic = pickTopic(question);
  const p = data?.protocols || {};
  const entries = Object.entries(p).sort((a, b) => (b[1]?.tvlUsdApprox || 0) - (a[1]?.tvlUsdApprox || 0));
  const leader = entries[0]?.[0] || "unknown";
  const healthLabel = (h) => (h === "ok" ? "正常" : h === "degraded" ? "降级" : String(h || ""));

  const lines = [];
  lines.push(`# EdgeWave Nexus：链上洞察`);
  lines.push(``);
  lines.push(`**问题**：${String(question || "").slice(0, 2000)}`);
  lines.push(`**更新时间**：${data?.updatedAt || new Date().toISOString()}`);
  if (data?.blockNumber) lines.push(`**区块**：${data.blockNumber}`);
  lines.push(``);
  lines.push(`## 快照`);
  for (const [id, m] of entries) {
    lines.push(
      `- **${id}**：TVL≈$${Number(m?.tvlUsdApprox || 0).toFixed(2)} | 成交量(24h)≈$${Number(m?.volumeUsdApprox24h || 0).toFixed(2)} | ${healthLabel(m?.health || "degraded")}`,
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
    const m = p[topic];
    lines.push(`- 你关注的是 **${topic}**：`);
    if (m) {
      lines.push(`  - TVL≈$${Number(m.tvlUsdApprox || 0).toFixed(2)}`);
      lines.push(`  - 成交量(24h)≈$${Number(m.volumeUsdApprox24h || 0).toFixed(2)}`);
      lines.push(`  - 健康度：${m.health || "degraded"}`);
    } else {
      lines.push(`  - 当前数据集中未找到匹配协议。`);
    }
  }
  lines.push(``);
  lines.push(`## 建议继续提问`);
  lines.push(`- “哪些协议处于降级状态？原因可能是什么？”`);
  lines.push(`- “对比 Uniswap 和 Compound 最近一分钟的动量”`);
  lines.push(``);
  return lines.join("\n");
}

function streamText(text) {
  const encoder = new TextEncoder();
  const chunks = String(text).split(/(\n)/);
  let i = 0;
  return new ReadableStream({
    async pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i] || ""));
      i += 1;
      await new Promise((r) => setTimeout(r, 20));
    },
  });
}

function extractUserText(maybeMessage) {
  if (!maybeMessage || typeof maybeMessage !== "object") return "";
  if (typeof maybeMessage.content === "string") return maybeMessage.content;
  const parts = Array.isArray(maybeMessage.parts) ? maybeMessage.parts : [];
  return parts
    .filter((p) => p && typeof p === "object" && p.type === "text")
    .map((p) => String(p.text || ""))
    .join("");
}

async function getDefiData(env) {
  const url = env?.EDGE_DEFI_AGGREGATOR_URL;
  if (!url) {
    // If the aggregator is not wired, return a safe placeholder.
    return {
      updatedAt: new Date().toISOString(),
      chainId: 1,
      source: "edge",
      protocols: {
        uniswap_v3: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "请配置 EDGE_DEFI_AGGREGATOR_URL" },
        aave: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "请配置 EDGE_DEFI_AGGREGATOR_URL" },
        compound: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "请配置 EDGE_DEFI_AGGREGATOR_URL" },
      },
    };
  }
  const res = await fetch(url, { headers: { accept: "application/json" }, cache: "no-store" });
  const json = await res.json();
  return json;
}

async function tryTransformerModel(env, question, data) {
  // Best-effort placeholder:
  // In many edge runtimes, bundling Transformer.js + a medium model (e.g. Phi-2) is not feasible due to size/memory/time.
  // If your ESA environment supports it, you can:
  // - bundle transformers.js and a quantized model artifact
  // - run local inference here and return a streamed answer
  // For now we return null to force fallback.
  console.log("[edgeAIInsight] AI_MODE=transformers requested, but Transformer.js is not bundled; falling back.");
  void env;
  void question;
  void data;
  return null;
}

export async function edgeAIInsight(request, env) {
  const headers = corsHeaders(request);
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response("METHOD_NOT_ALLOWED", { status: 405, headers });

    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m?.role === "user");
    const question = extractUserText(lastUser).slice(0, 2000);

    const defi = await getDefiData(env);

    if (env?.AI_MODE === "transformers") {
      const modelOut = await tryTransformerModel(env, question, defi);
      if (typeof modelOut === "string" && modelOut.length > 0) {
        return new Response(streamText(modelOut), { status: 200, headers: { ...headers, "cache-control": "no-store" } });
      }
    }

    const md = generateInsightMarkdown(question || "给我一个总览", defi);
    return new Response(streamText(md), { status: 200, headers: { ...headers, "cache-control": "no-store" } });
  } catch (err) {
    console.log("[edgeAIInsight] fatal", String(err));
    return new Response("AI_INSIGHT_FAILED", { status: 500, headers });
  }
}

const edgeAIInsightModule = {
  fetch: edgeAIInsight,
};

export default edgeAIInsightModule;

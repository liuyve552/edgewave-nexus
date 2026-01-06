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
  if (q.includes("uniswap")) return "uniswap_v3";
  if (q.includes("aave")) return "aave";
  if (q.includes("compound")) return "compound";
  if (q.includes("tvl")) return "tvl";
  if (q.includes("volume")) return "volume";
  return "overview";
}

function generateInsightMarkdown(question, data) {
  const topic = pickTopic(question);
  const p = data?.protocols || {};
  const entries = Object.entries(p).sort((a, b) => (b[1]?.tvlUsdApprox || 0) - (a[1]?.tvlUsdApprox || 0));
  const leader = entries[0]?.[0] || "unknown";

  const lines = [];
  lines.push(`# EdgeWave Nexus — On-chain Insight`);
  lines.push(``);
  lines.push(`**Question**: ${String(question || "").slice(0, 2000)}`);
  lines.push(`**UpdatedAt**: ${data?.updatedAt || new Date().toISOString()}`);
  if (data?.blockNumber) lines.push(`**Block**: ${data.blockNumber}`);
  lines.push(``);
  lines.push(`## Snapshot`);
  for (const [id, m] of entries) {
    lines.push(
      `- **${id}** — TVL≈$${Number(m?.tvlUsdApprox || 0).toFixed(2)} | Vol(24h)≈$${Number(m?.volumeUsdApprox24h || 0).toFixed(2)} | ${m?.health || "degraded"}`,
    );
  }
  lines.push(``);
  lines.push(`## Interpretation`);
  if (topic === "overview") {
    lines.push(`- Current TVL leader: **${leader}** (proxy metric).`);
    lines.push(`- Volume proxy is derived from consecutive 30s samples to visualize momentum.`);
  } else if (topic === "tvl") {
    lines.push(`- TVL≈ is a proxy derived from minimal on-chain signals; compare trends, not absolute USD value.`);
  } else if (topic === "volume") {
    lines.push(`- Volume(24h)≈ is synthetic from short-interval deltas to show relative activity.`);
  } else {
    const m = p[topic];
    lines.push(`- You asked about **${topic}**:`);
    if (m) {
      lines.push(`  - TVL≈$${Number(m.tvlUsdApprox || 0).toFixed(2)}`);
      lines.push(`  - Vol(24h)≈$${Number(m.volumeUsdApprox24h || 0).toFixed(2)}`);
      lines.push(`  - Health: ${m.health || "degraded"}`);
    } else {
      lines.push(`  - No matching protocol found in the current dataset.`);
    }
  }
  lines.push(``);
  lines.push(`## Next`);
  lines.push(`- "Which protocol is degraded and why?"`);
  lines.push(`- "Compare Uniswap vs Compound momentum in the last minute"`);
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
        uniswap_v3: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "Set EDGE_DEFI_AGGREGATOR_URL" },
        aave: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "Set EDGE_DEFI_AGGREGATOR_URL" },
        compound: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "Set EDGE_DEFI_AGGREGATOR_URL" },
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

    const md = generateInsightMarkdown(question || "Give me an overview", defi);
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

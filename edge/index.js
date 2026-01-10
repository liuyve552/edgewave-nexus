/**
 * EdgeWave Nexus — ESA Pages Functions entry
 *
 * Routes:
 * - POST /edge/rpc  : Fastest-success JSON-RPC router (Promise.race + Promise.any)
 * - GET  /edge/defi : DeFi signals aggregator with multi-level cache (L1 memory → L2 EdgeKV → L3 live)
 * - POST /edge/ai   : Streamed insight report (deterministic; powered by /edge/defi snapshot)
 *
 * EdgeKV:
 * - Enable ESA EdgeKV and create namespace: "edgewave-nexus"
 */

const KV_NAMESPACE = "edgewave-nexus";
const DEFI_TTL_MS = 30 * 1000;

const SELECTORS = {
  totalSupply: "0x18160ddd",
  exchangeRateStored: "0x182df0f5",
  liquidity: "0x1a686502"
};

const DEFAULTS = {
  chainId: 1,
  // Uniswap V3 USDC/WETH 0.05% pool
  uniswapV3Pool: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  // Compound v2 cUSDC
  compoundCUSDC: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
  // Aave v3 aUSDC (aEthUSDC)
  aaveAUSDC: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c"
};

function corsHeaders(request, contentType) {
  const origin = request.headers.get("origin") || "";
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type, x-edgewave-uid",
    "access-control-max-age": "86400",
    "content-type": contentType || "application/json; charset=utf-8"
  };
}

function jsonResponse(request, data, init = {}) {
  const headers = new Headers(init.headers || {});
  const cors = corsHeaders(request, "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { ...init, headers });
}

function textResponse(request, text, init = {}) {
  const headers = new Headers(init.headers || {});
  const cors = corsHeaders(request, "text/plain; charset=utf-8");
  for (const [k, v] of Object.entries(cors)) headers.set(k, v);
  if (!headers.has("cache-control")) headers.set("cache-control", "no-store");
  return new Response(text, { ...init, headers });
}

function jsonRpcError(id, message) {
  return JSON.stringify({ jsonrpc: "2.0", id: id ?? null, error: { code: -32000, message } });
}

function withTimeout(ms, parentSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  const onAbort = () => controller.abort();
  if (parentSignal) parentSignal.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      if (parentSignal) parentSignal.removeEventListener("abort", onAbort);
    }
  };
}

function getRpcUrls(env) {
  const infuraKey = env?.INFURA_API_KEY || "";
  const alchemyKey = env?.ALCHEMY_API_KEY || "";
  // Keep to 3 endpoints to stay within typical edge subrequest limits.
  return [
    infuraKey ? `https://mainnet.infura.io/v3/${infuraKey}` : "https://cloudflare-eth.com",
    alchemyKey ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}` : "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth"
  ];
}

async function tryRpc(url, payloadText, parentSignal) {
  const started = Date.now();
  const t = withTimeout(4000, parentSignal);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payloadText,
      signal: t.signal
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error("Invalid JSON");
    }
    const hasJsonRpcError = Array.isArray(json)
      ? json.some((x) => x && typeof x === "object" && "error" in x)
      : json && typeof json === "object" && "error" in json;
    if (hasJsonRpcError) throw new Error("JSON-RPC error");
    return { url, text, elapsedMs: Date.now() - started };
  } finally {
    t.dispose();
  }
}

async function raceRpc(rpcUrls, payloadText, parentSignal) {
  const attempts = rpcUrls.map((u) => tryRpc(u, payloadText, parentSignal));
  try {
    const fastestSettled = await Promise.race(attempts);
    return fastestSettled;
  } catch (err) {
    console.log("[edgeRpcRouter] fastestSettled failed -> downgrade", String(err));
  }
  const firstSuccess = await Promise.any(attempts);
  return firstSuccess;
}

function getMem() {
  const g = globalThis;
  if (!g.__EDGEWAVE_MEM_CACHE) g.__EDGEWAVE_MEM_CACHE = new Map();
  return g.__EDGEWAVE_MEM_CACHE;
}

function memGet(key) {
  const mem = getMem();
  const entry = mem.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    mem.delete(key);
    return null;
  }
  return entry.payload ?? null;
}

function memPut(key, payload, ttlMs) {
  getMem().set(key, { expiresAt: Date.now() + ttlMs, payload });
}

function getKv(env) {
  // Workers-style KV binding (optional): bind a KV namespace to env.EDGEWAVE_KV.
  try {
    const kv = env?.EDGEWAVE_KV;
    if (kv && typeof kv.get === "function" && typeof kv.put === "function") return kv;
  } catch {
    // ignore
  }

  // ESA EdgeKV style: EdgeKV is a global constructor (no env binding required).
  try {
    if (typeof EdgeKV === "undefined") return null;
    return new EdgeKV({ namespace: KV_NAMESPACE });
  } catch {
    return null;
  }
}

async function kvGetJson(kv, key) {
  try {
    const v = await kv.get(key, { type: "json" });
    return v ?? null;
  } catch {
    // ignore
  }
  try {
    const text = await kv.get(key);
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function kvPutJson(kv, key, obj, ttlSeconds) {
  const body = JSON.stringify(obj);
  try {
    await kv.put(key, body, { expirationTtl: ttlSeconds });
    return true;
  } catch {
    // ignore
  }
  try {
    await kv.put(key, body);
    return true;
  } catch {
    return false;
  }
}

async function kvGetValidPayload(kv, key) {
  const envelope = await kvGetJson(kv, key);
  if (!envelope || typeof envelope !== "object") return null;
  if (typeof envelope.expiresAt === "number" && Date.now() > envelope.expiresAt) return null;
  return envelope.payload ?? null;
}

async function kvPutPayload(kv, key, payload, ttlMs) {
  const ttlSeconds = Math.max(1, Math.round(ttlMs / 1000));
  const envelope = { expiresAt: Date.now() + ttlMs, payload };
  return kvPutJson(kv, key, envelope, ttlSeconds);
}

function hexToBigInt(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) throw new Error("Invalid hex");
  return BigInt(hex);
}

function bigIntToNumberSafe(value, scale) {
  try {
    const n = Number(value / scale);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function buildEmpty() {
  return {
    updatedAt: new Date().toISOString(),
    source: "edge",
    chainId: DEFAULTS.chainId,
    protocols: {
      uniswap_v3: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "暂无数据" },
      aave: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "暂无数据" },
      compound: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "暂无数据" }
    }
  };
}

function getBatchResult(map, id) {
  const item = map.get(id);
  if (!item || typeof item !== "object") throw new Error(`Missing batch result id=${id}`);
  if ("error" in item) throw new Error(`Batch JSON-RPC error id=${id}`);
  return item.result;
}

function defiCacheKey({ uniswapV3Pool, aaveAUSDC, compoundCUSDC }) {
  // Keep key deterministic & readable (short enough for common KV limits).
  return `defi_v1_${uniswapV3Pool}_${aaveAUSDC}_${compoundCUSDC}`;
}

async function computeDefi({ request, env, prev }) {
  const rpcUrls = getRpcUrls(env);
  const uniswapV3Pool = env?.UNISWAP_V3_POOL_ADDRESS || DEFAULTS.uniswapV3Pool;
  const compoundCUSDC = env?.COMPOUND_CUSDC_ADDRESS || DEFAULTS.compoundCUSDC;
  const aaveAUSDC = env?.AAVE_AUSDC_ADDRESS || DEFAULTS.aaveAUSDC;

  const base = prev || buildEmpty();
  const next = {
    ...base,
    updatedAt: new Date().toISOString(),
    source: "edge",
    chainId: DEFAULTS.chainId,
    protocols: { ...base.protocols }
  };

  const batch = [
    { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] },
    { jsonrpc: "2.0", id: 2, method: "eth_call", params: [{ to: uniswapV3Pool, data: SELECTORS.liquidity }, "latest"] },
    { jsonrpc: "2.0", id: 3, method: "eth_call", params: [{ to: aaveAUSDC, data: SELECTORS.totalSupply }, "latest"] },
    { jsonrpc: "2.0", id: 4, method: "eth_call", params: [{ to: compoundCUSDC, data: SELECTORS.totalSupply }, "latest"] },
    { jsonrpc: "2.0", id: 5, method: "eth_call", params: [{ to: compoundCUSDC, data: SELECTORS.exchangeRateStored }, "latest"] }
  ];

  let fastest;
  try {
    fastest = await raceRpc(rpcUrls, JSON.stringify(batch), request.signal);
  } catch (err) {
    console.log("[edgeDefiAggregator] batch failed", String(err));
    next.protocols.uniswap_v3 = { ...next.protocols.uniswap_v3, health: "degraded", notes: "RPC 批量请求失败" };
    next.protocols.aave = { ...next.protocols.aave, health: "degraded", notes: "RPC 批量请求失败" };
    next.protocols.compound = { ...next.protocols.compound, health: "degraded", notes: "RPC 批量请求失败" };
    return { next, rpc: null };
  }

  let results;
  try {
    results = JSON.parse(fastest.text);
    if (!Array.isArray(results)) throw new Error("Batch response is not an array");
  } catch (err) {
    console.log("[edgeDefiAggregator] invalid batch JSON", String(err));
    return { next, rpc: null };
  }

  const map = new Map(results.map((r) => [r?.id, r]));

  try {
    next.blockNumber = Number(hexToBigInt(getBatchResult(map, 1)));
  } catch (err) {
    console.log("[edgeDefiAggregator] blockNumber failed", String(err));
  }

  try {
    const liq = hexToBigInt(getBatchResult(map, 2));
    const tvl = bigIntToNumberSafe(liq, 10n ** 12n);
    const prevTvl = base.protocols.uniswap_v3.tvlUsdApprox || 0;
    next.protocols.uniswap_v3 = {
      tvlUsdApprox: tvl,
      volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.25,
      health: "ok",
      notes: "tvlUsdApprox 由 pool.liquidity() 推导（代理信号）"
    };
  } catch (err) {
    console.log("[edgeDefiAggregator] uniswap failed", String(err));
    next.protocols.uniswap_v3 = { ...next.protocols.uniswap_v3, health: "degraded", notes: "Uniswap V3 信号获取失败" };
  }

  try {
    const supply = hexToBigInt(getBatchResult(map, 3));
    const tvl = bigIntToNumberSafe(supply, 10n ** 6n);
    const prevTvl = base.protocols.aave.tvlUsdApprox || 0;
    next.protocols.aave = {
      tvlUsdApprox: tvl,
      volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.2,
      health: "ok",
      notes: "tvlUsdApprox 由 aUSDC.totalSupply() 推导（代理信号）"
    };
  } catch (err) {
    console.log("[edgeDefiAggregator] aave failed", String(err));
    next.protocols.aave = { ...next.protocols.aave, health: "degraded", notes: "Aave 信号获取失败（检查 aUSDC 地址）" };
  }

  try {
    const totalSupply = hexToBigInt(getBatchResult(map, 4));
    const exchangeRate = hexToBigInt(getBatchResult(map, 5));
    const underlying = (totalSupply * exchangeRate) / 10n ** 18n;
    const tvl = bigIntToNumberSafe(underlying, 10n ** 6n);
    const prevTvl = base.protocols.compound.tvlUsdApprox || 0;
    next.protocols.compound = {
      tvlUsdApprox: tvl,
      volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.15,
      health: "ok",
      notes: "tvlUsdApprox 由 cUSDC.totalSupply()*exchangeRateStored() 推导（代理信号）"
    };
  } catch (err) {
    console.log("[edgeDefiAggregator] compound failed", String(err));
    next.protocols.compound = { ...next.protocols.compound, health: "degraded", notes: "Compound 信号获取失败" };
  }

  return { next, rpc: fastest };
}

async function handleEdgeRpcRouter(request, env) {
  const headers = corsHeaders(request, "application/json; charset=utf-8");
  let id = null;
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return new Response(jsonRpcError(id, "METHOD_NOT_ALLOWED"), { status: 405, headers });

    const body = await request.text();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return new Response(jsonRpcError(id, "INVALID_JSON"), { status: 400, headers });
    }
    id = Array.isArray(parsed) ? parsed[0]?.id : parsed?.id;

    const rpcUrls = getRpcUrls(env);
    const fastest = await raceRpc(rpcUrls, JSON.stringify(parsed), request.signal);
    return new Response(fastest.text, {
      status: 200,
      headers: {
        ...headers,
        "cache-control": "no-store",
        "x-edgewave-fastest": fastest.url,
        "x-edgewave-elapsed-ms": String(fastest.elapsedMs)
      }
    });
  } catch (err) {
    console.log("[edgeRpcRouter] fatal", String(err));
    return new Response(jsonRpcError(id, "RPC_ROUTING_FAILED"), { status: 500, headers });
  }
}

async function handleEdgeDefiAggregator(request, env) {
  const headers = corsHeaders(request, "application/json; charset=utf-8");
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET") return jsonResponse(request, { ok: false, error: "METHOD_NOT_ALLOWED" }, { status: 405 });

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";

    const uniswapV3Pool = env?.UNISWAP_V3_POOL_ADDRESS || DEFAULTS.uniswapV3Pool;
    const compoundCUSDC = env?.COMPOUND_CUSDC_ADDRESS || DEFAULTS.compoundCUSDC;
    const aaveAUSDC = env?.AAVE_AUSDC_ADDRESS || DEFAULTS.aaveAUSDC;
    const key = defiCacheKey({ uniswapV3Pool, aaveAUSDC, compoundCUSDC });

    const kv = getKv(env);

    if (!force) {
      const memHit = memGet(key);
      if (memHit) {
        const value = { ...memHit, cache: { hit: true, layer: "memory", ttlMs: DEFI_TTL_MS } };
        return new Response(JSON.stringify(value), {
          status: 200,
          headers: { ...headers, "cache-control": "no-store", "x-edgewave-defi-cache": "memory" }
        });
      }

      if (kv) {
        const kvHit = await kvGetValidPayload(kv, key);
        if (kvHit) {
          memPut(key, kvHit, DEFI_TTL_MS);
          const value = { ...kvHit, cache: { hit: true, layer: "kv", ttlMs: DEFI_TTL_MS } };
          return new Response(JSON.stringify(value), {
            status: 200,
            headers: { ...headers, "cache-control": "no-store", "x-edgewave-defi-cache": "kv" }
          });
        }
      }
    }

    const prev = memGet(key) || (kv ? await kvGetValidPayload(kv, key) : null);
    const { next, rpc } = await computeDefi({ request, env, prev });

    const final = { ...next, cache: { hit: false, layer: "live", ttlMs: DEFI_TTL_MS } };
    memPut(key, final, DEFI_TTL_MS);
    if (kv) await kvPutPayload(kv, key, final, DEFI_TTL_MS);

    const extraHeaders = {
      ...headers,
      "cache-control": "no-store",
      "x-edgewave-defi-cache": "live"
    };
    if (rpc) {
      extraHeaders["x-edgewave-fastest"] = rpc.url;
      extraHeaders["x-edgewave-elapsed-ms"] = String(rpc.elapsedMs);
    }

    return new Response(JSON.stringify(final), { status: 200, headers: extraHeaders });
  } catch (err) {
    console.log("[edgeDefiAggregator] fatal", String(err));
    return jsonResponse(request, { ok: false, error: "DEFI_AGGREGATION_FAILED" }, { status: 500 });
  }
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
  if (data?.cache?.layer) lines.push(`**数据缓存**：${String(data.cache.layer)}`);
  lines.push(``);
  lines.push(`## 快照`);
  for (const [id, m] of entries) {
    lines.push(
      `- **${id}**：TVL≈$${Number(m?.tvlUsdApprox || 0).toFixed(2)} | 成交量(24h)≈$${Number(m?.volumeUsdApprox24h || 0).toFixed(2)} | ${healthLabel(m?.health || "degraded")}`
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
    }
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

async function handleEdgeAiInsight(request, env) {
  const headers = corsHeaders(request, "text/plain; charset=utf-8");
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") return textResponse(request, "METHOD_NOT_ALLOWED", { status: 405 });

    const body = await request.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const lastUser = [...messages].reverse().find((m) => m?.role === "user");
    const question = extractUserText(lastUser).slice(0, 2000);

    // Use the same snapshot source as the 3D galaxy (cached).
    const fakeUrl = new URL(request.url);
    fakeUrl.pathname = "/edge/defi";
    const defiRes = await handleEdgeDefiAggregator(new Request(fakeUrl.toString(), { method: "GET" }), env);
    const defi = await defiRes.json().catch(() => buildEmpty());

    const md = generateInsightMarkdown(question || "给我一个总览", defi);
    return new Response(streamText(md), { status: 200, headers: { ...headers, "cache-control": "no-store" } });
  } catch (err) {
    console.log("[edgeAIInsight] fatal", String(err));
    return new Response("AI_INSIGHT_FAILED", { status: 500, headers });
  }
}

async function routeFetch(request, env) {
  const url = new URL(request.url);

  // If ESA ever routes non-edge requests here, only handle /edge/*.
  if (!url.pathname.startsWith("/edge/")) {
    return jsonResponse(request, { error: "Not found" }, { status: 404 });
  }

  if (url.pathname === "/edge/rpc") return handleEdgeRpcRouter(request, env);
  if (url.pathname === "/edge/defi") return handleEdgeDefiAggregator(request, env);
  if (url.pathname === "/edge/ai") return handleEdgeAiInsight(request, env);

  return jsonResponse(request, { error: "Not found" }, { status: 404 });
}

export default {
  async fetch(request, env, ctx) {
    void ctx;
    return routeFetch(request, env);
  }
};

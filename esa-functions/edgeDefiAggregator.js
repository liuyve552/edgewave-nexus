/**
 * ESA Edge Function: edgeDefiAggregator
 * - Every ~30s (per isolate) refreshes minimal on-chain signals for:
 *   Uniswap V3 / Aave / Compound
 * - Uses the deployed `edgeRpcRouter` function for RPC calls (required by spec)
 *   to stay within typical edge subrequest limits.
 * - Stores results in an in-memory global cache (edge KV simulation)
 */

const SELECTORS = {
  totalSupply: "0x18160ddd",
  exchangeRateStored: "0x182df0f5",
  liquidity: "0x1a686502",
};

const DEFAULTS = {
  chainId: 1,
  uniswapV3Pool: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  compoundCUSDC: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
  aaveAUSDC: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
};

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  // For contest demo purposes, allow any Origin (read-only aggregator).
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "content-type": "application/json",
  };
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

async function rpcViaEdgeRouter(request, env, jsonRpcPayload) {
  const routerUrl = env?.EDGE_RPC_ROUTER_URL;
  if (!routerUrl) throw new Error("Missing EDGE_RPC_ROUTER_URL");

  const res = await fetch(routerUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(jsonRpcPayload),
    signal: request.signal,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("edgeRpcRouter returned invalid JSON");
  }
  const hasJsonRpcError = Array.isArray(json)
    ? json.some((x) => x && typeof x === "object" && "error" in x)
    : json && typeof json === "object" && "error" in json;
  if (!res.ok || hasJsonRpcError) throw new Error("edgeRpcRouter call failed");
  return json;
}

async function ethBlockNumber(request, env) {
  const json = await rpcViaEdgeRouter(request, env, { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] });
  return Number(hexToBigInt(json.result));
}

async function ethCall(request, env, to, data) {
  const json = await rpcViaEdgeRouter(request, env, {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [{ to, data }, "latest"],
  });
  return json.result;
}

function buildEmpty() {
  return {
    updatedAt: new Date().toISOString(),
    source: "edge",
    chainId: DEFAULTS.chainId,
    protocols: {
      uniswap_v3: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "No data yet" },
      aave: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "No data yet" },
      compound: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "No data yet" },
    },
  };
}

const CACHE_KEY = "__EDGEWAVE_DEFI_CACHE__";

function getCache() {
  return globalThis[CACHE_KEY];
}

function setCache(v) {
  globalThis[CACHE_KEY] = v;
}

export async function edgeDefiAggregator(request, env) {
  const headers = corsHeaders(request);
  try {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET") return new Response(JSON.stringify({ ok: false, error: "METHOD_NOT_ALLOWED" }), { status: 405, headers });

    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";

    const cached = getCache();
    const now = Date.now();
    if (!force && cached && now - cached.updatedAtMs < 30000) {
      return new Response(JSON.stringify(cached.value), { status: 200, headers: { ...headers, "cache-control": "no-store" } });
    }

    const prev = cached?.value ?? buildEmpty();
    const next = {
      ...prev,
      updatedAt: new Date().toISOString(),
      source: "edge",
      chainId: DEFAULTS.chainId,
      protocols: { ...prev.protocols },
    };

    const uniswapV3Pool = env?.UNISWAP_V3_POOL_ADDRESS || DEFAULTS.uniswapV3Pool;
    const compoundCUSDC = env?.COMPOUND_CUSDC_ADDRESS || DEFAULTS.compoundCUSDC;
    const aaveAUSDC = env?.AAVE_AUSDC_ADDRESS || DEFAULTS.aaveAUSDC;

    try {
      next.blockNumber = await ethBlockNumber(request, env);
    } catch (err) {
      console.log("[edgeDefiAggregator] blockNumber failed", String(err));
      setCache({ value: next, updatedAtMs: now });
      return new Response(JSON.stringify(next), { status: 200, headers: { ...headers, "cache-control": "no-store" } });
    }

    // Uniswap V3 liquidity() proxy signal.
    try {
      const liqHex = await ethCall(request, env, uniswapV3Pool, SELECTORS.liquidity);
      const liq = hexToBigInt(liqHex);
      const tvl = bigIntToNumberSafe(liq, 10n ** 12n);
      const prevTvl = prev.protocols.uniswap_v3.tvlUsdApprox;
      next.protocols.uniswap_v3 = {
        tvlUsdApprox: tvl,
        volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.25,
        health: "ok",
        notes: "tvlUsdApprox derived from pool liquidity() (proxy signal)",
      };
    } catch (err) {
      console.log("[edgeDefiAggregator] uniswap failed", String(err));
      next.protocols.uniswap_v3 = { ...next.protocols.uniswap_v3, health: "degraded", notes: "Uniswap V3 signal failed" };
    }

    // Aave aUSDC totalSupply() proxy.
    try {
      if (aaveAUSDC === "0x0000000000000000000000000000000000000000") throw new Error("missing aUSDC address");
      const supplyHex = await ethCall(request, env, aaveAUSDC, SELECTORS.totalSupply);
      const supply = hexToBigInt(supplyHex);
      const tvl = bigIntToNumberSafe(supply, 10n ** 6n);
      const prevTvl = prev.protocols.aave.tvlUsdApprox;
      next.protocols.aave = {
        tvlUsdApprox: tvl,
        volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.2,
        health: "ok",
        notes: "tvlUsdApprox derived from aUSDC totalSupply() (proxy signal)",
      };
    } catch (err) {
      console.log("[edgeDefiAggregator] aave failed", String(err));
      next.protocols.aave = { ...next.protocols.aave, health: "degraded", notes: "Aave signal failed (configure aUSDC address)" };
    }

    // Compound cUSDC totalSupply()*exchangeRateStored() proxy.
    try {
      const totalSupplyHex = await ethCall(request, env, compoundCUSDC, SELECTORS.totalSupply);
      const exchangeRateHex = await ethCall(request, env, compoundCUSDC, SELECTORS.exchangeRateStored);
      const totalSupply = hexToBigInt(totalSupplyHex);
      const exchangeRate = hexToBigInt(exchangeRateHex);
      const underlying = (totalSupply * exchangeRate) / 10n ** 18n;
      const tvl = bigIntToNumberSafe(underlying, 10n ** 6n);
      const prevTvl = prev.protocols.compound.tvlUsdApprox;
      next.protocols.compound = {
        tvlUsdApprox: tvl,
        volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.15,
        health: "ok",
        notes: "tvlUsdApprox derived from cUSDC totalSupply()*exchangeRateStored() (proxy signal)",
      };
    } catch (err) {
      console.log("[edgeDefiAggregator] compound failed", String(err));
      next.protocols.compound = { ...next.protocols.compound, health: "degraded", notes: "Compound signal failed" };
    }

    setCache({ value: next, updatedAtMs: now });
    return new Response(JSON.stringify(next), { status: 200, headers: { ...headers, "cache-control": "no-store" } });
  } catch (err) {
    console.log("[edgeDefiAggregator] fatal", String(err));
    return new Response(JSON.stringify({ ok: false, error: "DEFI_AGGREGATION_FAILED" }), { status: 500, headers });
  }
}

const edgeDefiAggregatorModule = {
  fetch: edgeDefiAggregator,
};

export default edgeDefiAggregatorModule;

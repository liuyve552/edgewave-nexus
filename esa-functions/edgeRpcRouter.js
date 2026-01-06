/**
 * ESA Edge Function: edgeRpcRouter
 * - Races multiple Ethereum RPC endpoints and returns the fastest successful response.
 * - Uses Promise.race (fastest settled) + Promise.any (downgrade to first success).
 * - Adds CORS (reflects Origin; safe for read-only JSON-RPC proxy)
 *
 * NOTE: Do NOT hardcode real API keys. Configure via ESA env vars.
 */

function corsHeaders(request) {
  const origin = request.headers.get("origin") || "";
  // For contest demo purposes, allow any Origin (read-only proxy).
  // If you need stricter control, gate by env allowlist here.
  return {
    "access-control-allow-origin": origin || "*",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "content-type": "application/json",
  };
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
    },
  };
}

async function tryRpc(url, payload, parentSignal) {
  const started = Date.now();
  const t = withTimeout(4000, parentSignal);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      signal: t.signal,
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

async function raceRpc(rpcUrls, payload, parentSignal) {
  const attempts = rpcUrls.map((u) => tryRpc(u, payload, parentSignal));

  // 1) Prefer fastest settled if it is a success (race).
  try {
    const fastestSettled = await Promise.race(attempts);
    return fastestSettled;
  } catch (err) {
    console.log("[edgeRpcRouter] fastestSettled failed -> downgrade", String(err));
  }

  // 2) Downgrade to first successful among all (any).
  const firstSuccess = await Promise.any(attempts);
  return firstSuccess;
}

export async function edgeRpcRouter(request, env) {
  const headers = corsHeaders(request);
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
    const infuraKey = env?.INFURA_API_KEY || "";
    const alchemyKey = env?.ALCHEMY_API_KEY || "";

    // ESA edge runtimes often limit outbound subrequests per execution.
    // Keep to 3 endpoints while still meeting the “>=3 RPC endpoints” requirement.
    const rpcUrls = [
      infuraKey ? `https://mainnet.infura.io/v3/${infuraKey}` : "https://cloudflare-eth.com",
      alchemyKey ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}` : "https://eth.llamarpc.com",
      "https://rpc.ankr.com/eth",
    ];

    console.log("[edgeRpcRouter] start", { endpoints: rpcUrls.length });
    const fastest = await raceRpc(rpcUrls, JSON.stringify(parsed), request.signal);
    console.log("[edgeRpcRouter] success", { fastest: fastest.url, elapsedMs: fastest.elapsedMs });

    return new Response(fastest.text, {
      status: 200,
      headers: { ...headers, "x-edgewave-fastest": fastest.url, "x-edgewave-elapsed-ms": String(fastest.elapsedMs) },
    });
  } catch (err) {
    console.log("[edgeRpcRouter] fatal", String(err));
    return new Response(jsonRpcError(id, "RPC_ROUTING_FAILED"), { status: 500, headers });
  }
}

const edgeRpcRouterModule = {
  fetch: edgeRpcRouter,
};

export default edgeRpcRouterModule;

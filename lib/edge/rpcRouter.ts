type JsonRpcRequest =
  | { jsonrpc: "2.0"; id: string | number | null; method: string; params?: unknown[] }
  | Array<{ jsonrpc: "2.0"; id: string | number | null; method: string; params?: unknown[] }>;

type JsonRpcResponse =
  | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
  | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } }
  | Array<
      | { jsonrpc: "2.0"; id: string | number | null; result: unknown }
      | { jsonrpc: "2.0"; id: string | number | null; error: { code: number; message: string; data?: unknown } }
    >;

function withTimeout(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

async function tryRpc(url: string, payload: JsonRpcRequest, signal?: AbortSignal) {
  const started = performance.now();
  const t = withTimeout(signal, 4_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: t.signal,
    });
    const json = (await res.json()) as JsonRpcResponse;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Consider JSON-RPC error responses as failures for "fastest successful" selection.
    const hasJsonRpcError = Array.isArray(json)
      ? json.some((x) => "error" in x)
      : "error" in json;
    if (hasJsonRpcError) throw new Error("JSON-RPC error");
    return { url, json, elapsedMs: performance.now() - started };
  } finally {
    t.dispose();
  }
}

/**
 * Edge-style RPC router: race multiple public RPC endpoints and return the fastest success.
 * - Uses Promise.race for the "first settled" attempt.
 * - Uses Promise.any to downgrade to "first successful" across remaining endpoints.
 */
export async function raceRpc(
  rpcUrls: string[],
  payload: JsonRpcRequest,
  signal?: AbortSignal,
): Promise<{ json: JsonRpcResponse; fastestUrl: string; elapsedMs: number }> {
  if (rpcUrls.length < 1) throw new Error("No RPC URLs configured");

  const attempts = rpcUrls.map((url) => tryRpc(url, payload, signal));
  try {
    const fastestSettled = await Promise.race(attempts);
    return { json: fastestSettled.json, fastestUrl: fastestSettled.url, elapsedMs: fastestSettled.elapsedMs };
  } catch {
    const firstSuccess = await Promise.any(attempts);
    return { json: firstSuccess.json, fastestUrl: firstSuccess.url, elapsedMs: firstSuccess.elapsedMs };
  }
}


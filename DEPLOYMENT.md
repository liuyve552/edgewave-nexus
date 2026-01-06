# EdgeWave Nexus — Deployment

## 1) Local Development (Next.js 15)

From `D:\EdgeWeave\edgewave-nexus`:

- Install: `npm install`
- Run dev (Turbopack): `npm run dev`
- Open:
  - Home: `http://localhost:3000`
  - Sniper demo: `http://localhost:3000/demo`

Notes:
- This project is configured for **static export** (`next.config.ts` uses `output: "export"`), to match ESA Pages capabilities.
- The UI can run without ESA functions (browser uses public RPCs as fallback), but the “EdgeWave accelerated” path is best when ESA functions are configured.

## 2) ESA Edge Functions (Aliyun ESA Console)

Create 3 edge functions (copy-paste JS files) and bind them to routes (example routes below).

### Function A — `edgeRpcRouter` (RPC Sniper)

- File: `esa-functions/edgeRpcRouter.js`
- Suggested route: `/edge/rpc`
- Env vars (recommended):
  - `INFURA_API_KEY` (optional)
  - `ALCHEMY_API_KEY` (optional)

Notes:
- CORS allows `http://localhost:3000` and `https://*.vercel.app`.
- Logs are printed with `console.log`, but responses never expose internal errors.

### Function B — `edgeDefiAggregator` (Chain Data Storm)

- File: `esa-functions/edgeDefiAggregator.js`
- Suggested route: `/edge/defi`
- Env vars (optional overrides):
  - `EDGE_RPC_ROUTER_URL` = the public URL of your deployed `edgeRpcRouter` route
  - `UNISWAP_V3_POOL_ADDRESS` (optional override)
  - `AAVE_AUSDC_ADDRESS` (optional override)
  - `COMPOUND_CUSDC_ADDRESS` (optional override)

Behavior:
- Refreshes data if cache is older than 30 seconds per edge isolate.
- `GET /edge/defi?force=1` forces refresh.

### Function C — `edgeAIInsight` (AI Agent)

- File: `esa-functions/edgeAIInsight.js`
- Suggested route: `/edge/ai`
- Env vars:
  - `EDGE_DEFI_AGGREGATOR_URL` = the public URL of your deployed `edgeDefiAggregator` route
  - `AI_MODE` = `transformers` (optional; will attempt and then fallback)

Behavior:
- Accepts `{ messages: [...] }` (Vercel AI SDK `useChat` compatible payload).
- Streams a plaintext answer.

## 3) Deploy Frontend to ESA Pages

ESA Pages supports **static site** deployment for Next.js. Use:
- Build command: `npm run build`
- Static assets directory: `out`

## 4) Wire Frontend → ESA Functions

Set these **ESA Pages build env** variables so the static frontend can call your functions:

```
NEXT_PUBLIC_EDGE_RPC_ROUTER_URL=https://<your-esa-domain>/edge/rpc
NEXT_PUBLIC_EDGE_DEFI_AGGREGATOR_URL=https://<your-esa-domain>/edge/defi
NEXT_PUBLIC_EDGE_AI_INSIGHT_URL=https://<your-esa-domain>/edge/ai
```

Optional: override public RPC list for browser fallback:
```
NEXT_PUBLIC_RPC_URLS=https://cloudflare-eth.com,https://rpc.ankr.com/eth,https://eth.llamarpc.com
```

Then:
- Open `/demo` and confirm the “EdgeWave API latency” panel is faster and shows `x-edgewave-fastest` in the EdgeWave iframe.

## 5) Security Notes

- Never commit real API keys.
- ESA edge functions in this repo only reference env vars (no hardcoded secrets).

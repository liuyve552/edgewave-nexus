export const config = {
  // If set, Next.js API routes will proxy to these ESA endpoints.
  esaRpcRouterUrl: process.env.ESA_EDGE_RPC_ROUTER_URL,
  esaDefiAggregatorUrl: process.env.ESA_EDGE_DEFI_AGGREGATOR_URL,
  esaAiInsightUrl: process.env.ESA_EDGE_AI_INSIGHT_URL,
  // Static-export friendly public endpoints (embedded at build time in the client bundle).
  nextPublicEdgeRpcRouterUrl: process.env.NEXT_PUBLIC_EDGE_RPC_ROUTER_URL,
  nextPublicEdgeDefiAggregatorUrl: process.env.NEXT_PUBLIC_EDGE_DEFI_AGGREGATOR_URL,
  nextPublicEdgeAiInsightUrl: process.env.NEXT_PUBLIC_EDGE_AI_INSIGHT_URL,
  // Public RPC list used for local fallback (no keys).
  publicRpcUrls: (
    process.env.NEXT_PUBLIC_RPC_URLS ??
    "https://cloudflare-eth.com,https://rpc.ankr.com/eth,https://eth.llamarpc.com"
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

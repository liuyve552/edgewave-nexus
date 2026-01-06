export type ProtocolId = "uniswap_v3" | "aave" | "compound";

export type ProtocolMetrics = {
  tvlUsdApprox: number;
  volumeUsdApprox24h: number;
  health: "ok" | "degraded";
  notes?: string;
};

export type ProtocolsData = {
  updatedAt: string;
  source: "edge" | "local";
  chainId: number;
  blockNumber?: number;
  protocols: Record<ProtocolId, ProtocolMetrics>;
};

// Default addresses are best-effort examples for Ethereum mainnet.
// Always override via env/config for a production demo.
export const DEFAULT_CONTRACTS = {
  chainId: 1,
  // Uniswap V3 USDC/WETH 0.05% pool (commonly used for demos).
  uniswapV3Pool: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
  // Compound v2 cUSDC.
  compoundCUSDC: "0x39AA39c021dfbaE8faC545936693aC917d5E7563",
  // Aave v3 aUSDC on Ethereum (aEthUSDC).
  aaveAUSDC: "0x98C23E9d8f34FEFb1B7BD6a91B7FF122F4e16F5c",
  // USDC token (Ethereum mainnet).
  usdc: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
} as const;

// 4-byte selectors precomputed (keccak256(signature).slice(0, 4)).
// Keep these constants in sync with `esa-functions/*` when updating.
export const SELECTORS = {
  totalSupply: "0x18160ddd",
  exchangeRateStored: "0x182df0f5",
  liquidity: "0x1a686502",
} as const;

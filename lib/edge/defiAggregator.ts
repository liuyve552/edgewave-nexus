import { DEFAULT_CONTRACTS, ProtocolsData, SELECTORS } from "@/contracts/defi";
import { raceRpc } from "@/lib/edge/rpcRouter";

type Hex = `0x${string}`;

function hexToBigInt(hex: string): bigint {
  if (typeof hex !== "string" || !hex.startsWith("0x")) throw new Error("Invalid hex");
  return BigInt(hex);
}

function bigIntToNumberSafe(value: bigint, scale: bigint = 1n): number {
  const n = Number(value / scale);
  return Number.isFinite(n) ? n : 0;
}

async function ethBlockNumber(rpcUrls: string[], signal?: AbortSignal): Promise<number> {
  const { json } = await raceRpc(rpcUrls, { jsonrpc: "2.0", id: 1, method: "eth_blockNumber", params: [] }, signal);
  const result = (json as { result: string }).result;
  return Number(hexToBigInt(result));
}

async function ethCall(
  rpcUrls: string[],
  to: string,
  data: Hex,
  signal?: AbortSignal,
): Promise<Hex> {
  const { json } = await raceRpc(
    rpcUrls,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    },
    signal,
  );
  return (json as { result: Hex }).result;
}

function decodeUint256(hex: Hex): bigint {
  // eth_call returns 32-byte, left-padded values.
  return hexToBigInt(hex);
}

type Cache = { value: ProtocolsData; updatedAtMs: number };
const CACHE_KEY = "__EDGEWAVE_DEFI_CACHE__";

function getCache(): Cache | undefined {
  return (globalThis as unknown as Record<string, Cache | undefined>)[CACHE_KEY];
}

function setCache(cache: Cache) {
  (globalThis as unknown as Record<string, Cache>)[CACHE_KEY] = cache;
}

function buildEmpty(chainId: number): ProtocolsData {
  return {
    updatedAt: new Date().toISOString(),
    source: "local",
    chainId,
    protocols: {
      uniswap_v3: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "暂无数据" },
      aave: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "暂无数据" },
      compound: { tvlUsdApprox: 0, volumeUsdApprox24h: 0, health: "degraded", notes: "暂无数据" },
    },
  };
}

/**
 * Local edge-like aggregator (mirrors `/esa-functions/edgeDefiAggregator.js`).
 * Fetches minimal on-chain signals from three "protocol representatives" and turns them into demo-friendly metrics.
 */
export async function getDefiStorm(rpcUrls: string[], opts?: { force?: boolean; signal?: AbortSignal }) {
  const cached = getCache();
  const now = Date.now();
  if (!opts?.force && cached && now - cached.updatedAtMs < 30_000) return cached.value;

  const prev = cached?.value ?? buildEmpty(DEFAULT_CONTRACTS.chainId);
  const next: ProtocolsData = {
    ...prev,
    updatedAt: new Date().toISOString(),
    source: "local",
    chainId: DEFAULT_CONTRACTS.chainId,
    protocols: { ...prev.protocols },
  };

  try {
    next.blockNumber = await ethBlockNumber(rpcUrls, opts?.signal);
  } catch (err) {
    console.log("getDefiStorm blockNumber failed", err);
    next.protocols.uniswap_v3 = { ...next.protocols.uniswap_v3, health: "degraded", notes: "区块高度获取失败" };
    next.protocols.aave = { ...next.protocols.aave, health: "degraded", notes: "区块高度获取失败" };
    next.protocols.compound = { ...next.protocols.compound, health: "degraded", notes: "区块高度获取失败" };
    setCache({ value: next, updatedAtMs: now });
    return next;
  }

  // Uniswap V3: pool liquidity() as a high-frequency on-chain signal (demo proxy for "tvl").
  try {
    const liqHex = await ethCall(
      rpcUrls,
      DEFAULT_CONTRACTS.uniswapV3Pool,
      SELECTORS.liquidity as Hex,
      opts?.signal,
    );
    const liq = decodeUint256(liqHex);
    const tvl = bigIntToNumberSafe(liq, 10n ** 12n); // heuristic scaling for visualization.
    const prevTvl = prev.protocols.uniswap_v3.tvlUsdApprox;
    next.protocols.uniswap_v3 = {
      tvlUsdApprox: tvl,
      volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.25,
      health: "ok",
      notes: "tvlUsdApprox 由 pool.liquidity() 推导（代理信号）",
    };
  } catch {
    next.protocols.uniswap_v3 = { ...next.protocols.uniswap_v3, health: "degraded", notes: "Uniswap V3 信号获取失败" };
  }

  // Aave: aUSDC totalSupply() as a proxy for deposits / TVL.
  try {
    const supplyHex = await ethCall(
      rpcUrls,
      DEFAULT_CONTRACTS.aaveAUSDC,
      SELECTORS.totalSupply as Hex,
      opts?.signal,
    );
    const supply = decodeUint256(supplyHex);
    const tvl = bigIntToNumberSafe(supply, 10n ** 6n); // assume 6 decimals for USDC-like.
    const prevTvl = prev.protocols.aave.tvlUsdApprox;
    next.protocols.aave = {
      tvlUsdApprox: tvl,
      volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.2,
      health: "ok",
      notes: "tvlUsdApprox 由 aUSDC.totalSupply() 推导（代理信号）",
    };
  } catch {
    next.protocols.aave = { ...next.protocols.aave, health: "degraded", notes: "Aave 信号获取失败（检查 aUSDC 地址配置）" };
  }

  // Compound: cUSDC totalSupply() and exchangeRateStored() to approximate underlying.
  try {
    const totalSupplyHex = await ethCall(
      rpcUrls,
      DEFAULT_CONTRACTS.compoundCUSDC,
      SELECTORS.totalSupply as Hex,
      opts?.signal,
    );
    const exchangeRateHex = await ethCall(
      rpcUrls,
      DEFAULT_CONTRACTS.compoundCUSDC,
      SELECTORS.exchangeRateStored as Hex,
      opts?.signal,
    );
    const totalSupply = decodeUint256(totalSupplyHex);
    const exchangeRate = decodeUint256(exchangeRateHex);
    // Heuristic: underlying ~= totalSupply * exchangeRate / 1e18, then scale down for demo.
    const underlying = (totalSupply * exchangeRate) / 10n ** 18n;
    const tvl = bigIntToNumberSafe(underlying, 10n ** 6n);
    const prevTvl = prev.protocols.compound.tvlUsdApprox;
    next.protocols.compound = {
      tvlUsdApprox: tvl,
      volumeUsdApprox24h: Math.abs(tvl - prevTvl) * 0.15,
      health: "ok",
      notes: "tvlUsdApprox 由 cUSDC.totalSupply()*exchangeRateStored() 推导（代理信号）",
    };
  } catch {
    next.protocols.compound = { ...next.protocols.compound, health: "degraded", notes: "Compound 信号获取失败" };
  }

  setCache({ value: next, updatedAtMs: now });
  return next;
}

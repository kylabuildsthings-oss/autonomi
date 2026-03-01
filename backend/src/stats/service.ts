/**
 * Dashboard stats: TVL, active users, yield, Arc settlement.
 * Uses monitored addresses (WATCH_ADDRESSES) and contract data.
 */
import "dotenv/config.js";
import type { Address } from "viem";
import { getDashboardData } from "../dashboard-api.js";

const WATCH_ADDRESSES: Address[] = process.env["WATCH_ADDRESSES"]
  ? (process.env["WATCH_ADDRESSES"].split(",").map((a) => a.trim()).filter(Boolean) as Address[])
  : [];

const DEFAULT_YIELD = Number(process.env["USYC_YIELD_APY"]) || 5.02;
const YIELD_SOURCE = process.env["USYC_YIELD_SOURCE"] || "Circle Treasury";

export interface StatsPayload {
  tvl: { valueUsd: number; changePct: number | null; formatted: string };
  users: { total: number; monitored: number };
  yield: { value: number; formatted: string; source: string };
  arc: { settlement: string; blockTime: string; finality: string };
}

/**
 * Compute stats from monitored positions and config.
 * TVL = sum of (usycDeposited * price) for active positions (USD).
 * Active users = count of monitored addresses with an active position.
 */
export async function getStats(): Promise<StatsPayload> {
  const results = await Promise.all(WATCH_ADDRESSES.map((addr) => getDashboardData(addr)));
  const priceNum = results[0] ? Number(results[0].usycPrice) : 0;
  let valueUsd = 0;
  let activeCount = 0;
  for (const r of results) {
    if (!r?.position?.active) continue;
    const usyc = Number(r.position.usycDeposited) || 0;
    valueUsd += usyc * priceNum;
    activeCount += 1;
  }
  const formatted =
    valueUsd >= 1_000_000 ? `$${(valueUsd / 1_000_000).toFixed(2)}M` : valueUsd >= 1_000 ? `$${(valueUsd / 1_000).toFixed(2)}K` : `$${valueUsd.toFixed(2)}`;

  return {
    tvl: {
      valueUsd,
      changePct: null,
      formatted,
    },
    users: {
      total: activeCount,
      monitored: WATCH_ADDRESSES.length,
    },
    yield: {
      value: DEFAULT_YIELD,
      formatted: `${DEFAULT_YIELD.toFixed(2)}%`,
      source: YIELD_SOURCE,
    },
    arc: {
      settlement: "<1s",
      blockTime: "0.9s",
      finality: "847ms",
    },
  };
}

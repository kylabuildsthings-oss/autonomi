/**
 * Monitoring: deep health and readiness checks (DB, RPC).
 */
import { getDb } from "../db/index.js";

export interface HealthCheckResult {
  name: string;
  status: "ok" | "error";
  message?: string;
  durationMs?: number;
}

export interface MonitoringHealth {
  status: "ok" | "degraded";
  checks: Record<string, HealthCheckResult>;
  timestamp: string;
}

/** Run DB check: open DB and run a simple query. */
export async function checkDb(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const db = getDb();
    db.prepare("SELECT 1").get();
    return {
      name: "db",
      status: "ok",
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      name: "db",
      status: "error",
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
}

/** Run RPC check: fetch latest block number. */
export async function checkRpc(): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    const { createPublicClient, http } = await import("viem");
    const rpcUrl = process.env["ARC_RPC_URL"] ?? "https://rpc.testnet.arc.network";
    const chainId = Number(process.env["ARC_CHAIN_ID"] ?? 5042002);
    const client = createPublicClient({
      chain: { id: chainId, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 }, rpcUrls: { default: { http: [rpcUrl] } } },
      transport: http(rpcUrl),
    });
    await client.getBlockNumber();
    return {
      name: "rpc",
      status: "ok",
      durationMs: Date.now() - start,
    };
  } catch (e) {
    return {
      name: "rpc",
      status: "error",
      message: e instanceof Error ? e.message : String(e),
      durationMs: Date.now() - start,
    };
  }
}

/** Run all checks and return aggregated status. */
export async function runHealthChecks(): Promise<MonitoringHealth> {
  const [dbResult, rpcResult] = await Promise.all([checkDb(), checkRpc()]);
  const checks = { db: dbResult, rpc: rpcResult };
  const allOk = Object.values(checks).every((c) => c.status === "ok");
  return {
    status: allOk ? "ok" : "degraded",
    checks,
    timestamp: new Date().toISOString(),
  };
}

/** True if all checks are ok (for readiness probe). */
export async function isReady(): Promise<boolean> {
  const health = await runHealthChecks();
  return health.status === "ok";
}

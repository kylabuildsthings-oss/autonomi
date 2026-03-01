/**
 * Simple test script: verify the agent can read from the Autonomi contract.
 * Run: npm run test:agent
 * If no terminal output appears, check backend/test-agent-out.txt (when run from backend/).
 */
import "dotenv/config.js";
import { writeFileSync } from "fs";
import { createPublicClient, http } from "viem";
import { autonomiAbi } from "./abi/autonomi.js";

const OUT = "test-agent-out.txt";
try { writeFileSync(OUT, "module loaded " + new Date().toISOString() + "\n", "utf8"); } catch (_) {}
process.stderr.write("test-agent: cwd=" + process.cwd() + " out=" + OUT + "\n");
const ARC_RPC_URL = process.env["ARC_RPC_URL"] ?? process.env["ARC_TESTNET_RPC_URL"] ?? "https://rpc.testnet.arc.network";
const AUTONOMI_ADDRESS = (process.env["AUTONOMI_ADDRESS"] ?? "0x4b7f00672B96B489F227469f9c106623d5de5779") as `0x${string}`;
const TEST_ADDRESS = "0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515" as `0x${string}`; // deployer

const chain = {
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
  rpcUrls: { default: { http: [ARC_RPC_URL] } },
};

async function main() {
  try { writeFileSync(OUT, "started " + new Date().toISOString() + "\n", "utf8"); } catch (_) {}
  console.log("Autonomi contract read test\n");
  console.log("RPC:", ARC_RPC_URL);
  console.log("Contract:", AUTONOMI_ADDRESS);
  console.log("Test user:", TEST_ADDRESS);
  console.log("Fetching from chain...");

  const client = createPublicClient({
    chain,
    transport: http(ARC_RPC_URL, { timeout: 15_000 }),
  });

  const [usycPrice, position, ltv] = await Promise.all([
    client.readContract({
      address: AUTONOMI_ADDRESS,
      abi: autonomiAbi,
      functionName: "getUSYCPrice",
    }),
    client.readContract({
      address: AUTONOMI_ADDRESS,
      abi: autonomiAbi,
      functionName: "positions",
      args: [TEST_ADDRESS],
    }),
    client.readContract({
      address: AUTONOMI_ADDRESS,
      abi: autonomiAbi,
      functionName: "getCurrentLTV",
      args: [TEST_ADDRESS],
    }),
  ]);

  const [usycDeposited, usdcBorrowed, liquidationThreshold, lastRebalance, active] = position;

  console.log("\n--- Results ---");
  console.log("USYC price (18 decimals):", usycPrice.toString());
  console.log("Position (test user):");
  console.log("  active:", active);
  console.log("  usycDeposited:", usycDeposited.toString());
  console.log("  usdcBorrowed:", usdcBorrowed.toString());
  console.log("  liquidationThreshold:", liquidationThreshold.toString());
  console.log("  lastRebalance:", lastRebalance.toString());
  console.log("Current LTV (bps):", ltv.toString());
  console.log("\nRead test OK.");
  const out = ["USYC price: " + usycPrice.toString(), "active: " + active, "usycDeposited: " + usycDeposited.toString(), "usdcBorrowed: " + usdcBorrowed.toString(), "LTV: " + ltv.toString(), "Read test OK."].join("\n");
  writeFileSync(OUT, out, "utf8");
}

main().catch((e) => {
  try { writeFileSync(OUT, "Error: " + String(e) + "\n", "utf8"); } catch (_) {}
  console.error(e);
  process.exit(1);
});

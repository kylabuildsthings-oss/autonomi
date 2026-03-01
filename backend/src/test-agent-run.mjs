#!/usr/bin/env node
/**
 * Standalone test — no tsc. Run from backend/: node src/test-agent-run.mjs
 */
import dotenv from "dotenv";
dotenv.config();
import { writeFileSync } from "fs";
import { createPublicClient, http } from "viem";

const OUT = "test-agent-out.txt";
const autonomiAbi = [
  { inputs: [{ name: "", internalType: "address", type: "address" }], name: "positions", outputs: [
    { name: "usycDeposited", internalType: "uint256", type: "uint256" },
    { name: "usdcBorrowed", internalType: "uint256", type: "uint256" },
    { name: "liquidationThreshold", internalType: "uint256", type: "uint256" },
    { name: "lastRebalance", internalType: "uint256", type: "uint256" },
    { name: "active", internalType: "bool", type: "bool" },
  ], stateMutability: "view", type: "function" },
  { inputs: [{ name: "user", internalType: "address", type: "address" }], name: "getCurrentLTV", outputs: [{ name: "", internalType: "uint256", type: "uint256" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "getUSYCPrice", outputs: [{ name: "", internalType: "uint256", type: "uint256" }], stateMutability: "view", type: "function" },
];

try { writeFileSync(OUT, "started " + new Date().toISOString() + "\n", "utf8"); } catch (_) {}
process.stderr.write("test-agent-run: cwd=" + process.cwd() + " out=" + OUT + "\n");

const ARC_RPC_URL = process.env.ARC_RPC_URL ?? process.env.ARC_TESTNET_RPC_URL ?? "https://rpc.testnet.arc.network";
const AUTONOMI_ADDRESS = (process.env.AUTONOMI_ADDRESS ?? "0x4b7f00672B96B489F227469f9c106623d5de5779");
const TEST_ADDRESS = "0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515";

const chain = { id: 5042002, name: "Arc Testnet", nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 }, rpcUrls: { default: { http: [ARC_RPC_URL] } } };
const client = createPublicClient({ chain, transport: http(ARC_RPC_URL, { timeout: 15000 }) });

const [usycPrice, position, ltv] = await Promise.all([
  client.readContract({ address: AUTONOMI_ADDRESS, abi: autonomiAbi, functionName: "getUSYCPrice" }),
  client.readContract({ address: AUTONOMI_ADDRESS, abi: autonomiAbi, functionName: "positions", args: [TEST_ADDRESS] }),
  client.readContract({ address: AUTONOMI_ADDRESS, abi: autonomiAbi, functionName: "getCurrentLTV", args: [TEST_ADDRESS] }),
]);

const [usycDeposited, usdcBorrowed, liquidationThreshold, lastRebalance, active] = position;
const result = ["USYC price: " + usycPrice.toString(), "active: " + active, "usycDeposited: " + usycDeposited.toString(), "usdcBorrowed: " + usdcBorrowed.toString(), "LTV: " + ltv.toString(), "Read test OK."].join("\n");
writeFileSync(OUT, result, "utf8");
console.log(result);
process.stderr.write("Done.\n");

import "dotenv/config.js";
import { createPublicClient, http, type Address } from "viem";
import { autonomiAbi } from "./abi/autonomi.js";

const ARC_CHAIN_ID = Number(process.env["ARC_CHAIN_ID"] ?? 5042002);
const AUTONOMI_ADDRESS = (process.env["AUTONOMI_ADDRESS"] ?? "0x4b7f00672B96B489F227469f9c106623d5de5779") as Address;

function getPublicClient() {
  const rpcUrl = process.env["ARC_RPC_URL"] ?? "https://rpc.testnet.arc.network";
  return createPublicClient({
    chain: {
      id: ARC_CHAIN_ID,
      name: "Arc Testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
      rpcUrls: { default: { http: [rpcUrl] } },
    },
    transport: http(rpcUrl),
  });
}

/** USYC/USDC use 6 decimals; price is 18 decimals. LTV is in basis points. */
export interface DashboardData {
  usycPrice: string;
  position: {
    usycDeposited: string;
    usdcBorrowed: string;
    ltvBps: number;
    active: boolean;
  } | null;
}

export async function getDashboardData(userAddress: Address): Promise<DashboardData> {
  const client = getPublicClient();
  const [priceRaw, positionRaw] = await Promise.all([
    client.readContract({
      address: AUTONOMI_ADDRESS,
      abi: autonomiAbi,
      functionName: "getUSYCPrice",
    }),
    client.readContract({
      address: AUTONOMI_ADDRESS,
      abi: autonomiAbi,
      functionName: "positions",
      args: [userAddress],
    }),
  ]);

  const usycDeposited = positionRaw[0];
  const usdcBorrowed = positionRaw[1];
  const active = positionRaw[4];

  let ltvBps = 0;
  if (active && usycDeposited > 0n) {
    const ltv = await client.readContract({
      address: AUTONOMI_ADDRESS,
      abi: autonomiAbi,
      functionName: "getCurrentLTV",
      args: [userAddress],
    });
    ltvBps = Number(ltv);
  }

  const priceFormatted = (Number(priceRaw) / 1e18).toFixed(2);
  const decimals = 6;

  return {
    usycPrice: priceFormatted,
    position: active
      ? {
          usycDeposited: (Number(usycDeposited) / 10 ** decimals).toFixed(0),
          usdcBorrowed: (Number(usdcBorrowed) / 10 ** decimals).toFixed(0),
          ltvBps,
          active,
        }
      : null,
  };
}

/** Fetch USYC price only (no user address required). Used for /api/v1/market and when no wallet is connected. */
export async function getUsycPrice(): Promise<string> {
  const client = getPublicClient();
  const priceRaw = await client.readContract({
    address: AUTONOMI_ADDRESS,
    abi: autonomiAbi,
    functionName: "getUSYCPrice",
  });
  return (Number(priceRaw) / 1e18).toFixed(2);
}

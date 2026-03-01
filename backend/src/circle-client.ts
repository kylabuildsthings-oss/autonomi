import "dotenv/config.js";
import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import type { Address } from "viem";

const CIRCLE_API_KEY = process.env["CIRCLE_API_KEY"];
const CIRCLE_ENTITY_SECRET = process.env["CIRCLE_ENTITY_SECRET"];

const ARC_CHAIN_ID = Number(process.env["ARC_CHAIN_ID"] ?? 5042002);

function log(level: string, msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${ts}] [circle] [${level}] ${msg}${payload}`);
}

export interface CircleWalletInfo {
  walletId: string;
  address: Address;
  blockchain: string;
}

/**
 * Initialize Circle Developer-Controlled Wallets client.
 * Requires CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET in env.
 */
export function getCircleClient() {
  if (!CIRCLE_API_KEY || !CIRCLE_ENTITY_SECRET) {
    log("warn", "CIRCLE_API_KEY or CIRCLE_ENTITY_SECRET not set; Circle client unavailable");
    return null;
  }
  return initiateDeveloperControlledWalletsClient({
    apiKey: CIRCLE_API_KEY,
    entitySecret: CIRCLE_ENTITY_SECRET,
  });
}

/**
 * Create or reuse an agent wallet on Arc Testnet.
 * Returns wallet id and on-chain address if Circle is configured.
 */
export async function ensureAgentWallet(): Promise<CircleWalletInfo | null> {
  const client = getCircleClient();
  if (!client) return null;

  try {
    const walletSetRes = await client.createWalletSet({ name: "Autonomi Agent Set" });
    const walletSetId = walletSetRes.data?.walletSet?.id;
    if (!walletSetId) {
      log("error", "Failed to create wallet set");
      return null;
    }

    const walletsRes = await client.createWallets({
      walletSetId,
      blockchains: ["ARC-TESTNET"],
      count: 1,
      accountType: "SCA",
      metadata: [{ name: "Autonomi Agent", refId: "autonomi-agent-1" }],
    });

    const wallet = walletsRes.data?.wallets?.[0];
    const walletId = wallet?.id;
    const address = (wallet as { address?: { address?: string } })?.address?.address;
    if (!walletId || !address) {
      log("error", "Failed to create wallet");
      return null;
    }

    const info: CircleWalletInfo = {
      walletId,
      address: address as Address,
      blockchain: (wallet as { blockchain?: string })?.blockchain ?? "ARC-TESTNET",
    };
    log("info", "Agent wallet ready", { ...info } as Record<string, unknown>);
    return info;
  } catch (e) {
    log("error", "Circle wallet creation failed", { error: String(e) });
    return null;
  }
}

/**
 * Fund wallet with USDC for gas on Arc Testnet.
 * Arc uses USDC as native gas; use Circle faucet or transfer from another wallet.
 * This is a placeholder — actual funding is via https://faucet.circle.com (Arc Testnet).
 */
export async function fundWalletWithUSDC(_address: Address): Promise<boolean> {
  log("info", "Fund wallet via https://faucet.circle.com (Arc Testnet)", { address: _address });
  return true;
}

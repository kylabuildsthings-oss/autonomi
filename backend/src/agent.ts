import "dotenv/config.js";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import cron from "node-cron";
import { autonomiAbi } from "./abi/autonomi.js";

const ARC_CHAIN_ID = Number(process.env["ARC_CHAIN_ID"] ?? 5042002);
const AUTONOMI_ADDRESS = (process.env["AUTONOMI_ADDRESS"] ?? "0x4b7f00672B96B489F227469f9c106623d5de5779") as Address;
const LTV_REBALANCE_THRESHOLD_BPS = 6500; // 65% — rebalance when LTV exceeds this
const TARGET_LTV_BPS = 6000; // 60% target when calling autoRebalance

// Optional: simulate a price drop for testing (e.g. "0.95" = $0.95). Agent uses this for LTV check so rebalance triggers.
const SIMULATE_USYC_PRICE = process.env["SIMULATE_USYC_PRICE"]
  ? Number(process.env["SIMULATE_USYC_PRICE"])
  : null;

// Addresses to monitor. Your address is the default; set WATCH_ADDRESSES in .env (comma-separated) to override.
const YOUR_ADDRESS = "0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515" as Address;
const TEST_ADDRESSES: Address[] = process.env["WATCH_ADDRESSES"]
  ? (process.env["WATCH_ADDRESSES"].split(",").map((a) => a.trim()).filter(Boolean) as Address[])
  : [YOUR_ADDRESS];

function log(level: string, msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString();
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[${ts}] [agent] [${level}] ${msg}${payload}`);
}

/** Normalize env private key to 0x + 64 hex chars. Strips quotes, spaces, newlines. */
function normalizePrivateKey(raw: string): `0x${string}` | null {
  const hexOnly = raw.replace(/^0x/i, "").replace(/[^0-9a-fA-F]/g, "");
  if (hexOnly.length !== 64) return null;
  return (`0x${hexOnly.toLowerCase()}` as `0x${string}`);
}

export class AutonomiAgent {
  private publicClient;
  private walletClient;
  private account;
  private contractAddress: Address;

  constructor(contractAddress: Address, agentPrivateKey: `0x${string}`) {
    const rpcUrl = process.env["ARC_RPC_URL"] ?? "https://rpc.testnet.arc.network";
    const chain = {
      id: ARC_CHAIN_ID,
      name: "Arc Testnet",
      nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
      rpcUrls: { default: { http: [rpcUrl] } },
    };

    this.contractAddress = contractAddress;
    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
    this.account = privateKeyToAccount(agentPrivateKey as `0x${string}`);
    this.walletClient = createWalletClient({
      account: this.account,
      chain,
      transport: http(rpcUrl),
    });

    log("info", "AutonomiAgent initialized", {
      contract: contractAddress,
      agentAddress: this.account.address,
    });
  }

  async getUSYCPrice(): Promise<bigint> {
    if (SIMULATE_USYC_PRICE != null && !Number.isNaN(SIMULATE_USYC_PRICE)) {
      const simulated = BigInt(Math.round(SIMULATE_USYC_PRICE * 1e18));
      log("info", "Using simulated USYC price (SIMULATE_USYC_PRICE)", {
        price: simulated.toString(),
        raw: SIMULATE_USYC_PRICE,
      });
      return simulated;
    }
    const price = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: autonomiAbi,
      functionName: "getUSYCPrice",
    });
    return price;
  }

  async getPosition(user: Address) {
    return this.publicClient.readContract({
      address: this.contractAddress,
      abi: autonomiAbi,
      functionName: "positions",
      args: [user],
    });
  }

  async getCurrentLTV(user: Address): Promise<bigint> {
    const ltv = await this.publicClient.readContract({
      address: this.contractAddress,
      abi: autonomiAbi,
      functionName: "getCurrentLTV",
      args: [user],
    });
    return ltv;
  }

  async monitorAndRebalance(): Promise<void> {
    log("info", "Starting monitor cycle");
    const price = await this.getUSYCPrice();
    log("info", "USYC price from contract", { price: price.toString() });

    for (const user of TEST_ADDRESSES) {
      try {
        const [usycDeposited, usdcBorrowed, , , active] = await this.getPosition(user);
        if (!active || usycDeposited === 0n) {
          log("debug", "Skipping user (no active position)", { user });
          continue;
        }

        const ltv = await this.getCurrentLTV(user);
        const ltvBps = Number(ltv); // contract returns LTV in basis points (e.g. 7500 = 75%)

        // When simulating a price drop, recompute LTV with simulated price so the agent can trigger
        let ltvForThreshold = ltvBps;
        if (SIMULATE_USYC_PRICE != null && !Number.isNaN(SIMULATE_USYC_PRICE) && usycDeposited > 0n && price > 0n) {
          const simulatedLtv =
            (usdcBorrowed * 10000n * 10n ** 18n) / (usycDeposited * price);
          ltvForThreshold = Number(simulatedLtv);
          log("info", "Simulated LTV (for threshold check)", {
            user,
            contractLtvBps: ltvBps,
            simulatedLtvBps: ltvForThreshold,
          });
        }

        log("info", "Position checked", {
          user,
          usycDeposited: usycDeposited.toString(),
          usdcBorrowed: usdcBorrowed.toString(),
          ltvBps,
        });

        if (ltvForThreshold >= LTV_REBALANCE_THRESHOLD_BPS) {
          log("info", "LTV above threshold, calling autoRebalance", {
            user,
            ltvBps: ltvForThreshold,
            threshold: LTV_REBALANCE_THRESHOLD_BPS,
          });
          await this.callAutoRebalance(user, BigInt(TARGET_LTV_BPS));
        }
      } catch (e) {
        log("error", "Error processing user", { user, error: String(e) });
      }
    }
    log("info", "Monitor cycle finished");
  }

  async callAutoRebalance(user: Address, targetLTV: bigint): Promise<void> {
    if (!this.walletClient?.account) {
      log("error", "No wallet client for sending tx");
      return;
    }
    const hash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: autonomiAbi,
      functionName: "autoRebalance",
      args: [user, targetLTV],
      account: this.account,
    });
    log("info", "autoRebalance tx sent", { user, txHash: hash });
  }

  startCron(): void {
    // Every 5 minutes
    cron.schedule("*/5 * * * *", () => {
      this.monitorAndRebalance().catch((e) => log("error", "Cron failed", { error: String(e) }));
    });
    log("info", "Cron scheduled: every 5 minutes");
  }
}

export function runAgent(): AutonomiAgent | null {
  const contractAddress = process.env["AUTONOMI_ADDRESS"] as Address | undefined;
  const raw = process.env["AGENT_PRIVATE_KEY"] ?? process.env["PRIVATE_KEY"];
  if (!contractAddress || !raw) {
    log("error", "Missing AUTONOMI_ADDRESS and either AGENT_PRIVATE_KEY or PRIVATE_KEY");
    return null;
  }
  const key = normalizePrivateKey(raw);
  if (!key) {
    log("error", "Private key must be 64 hex characters (optional 0x prefix). Set AGENT_PRIVATE_KEY or PRIVATE_KEY.");
    return null;
  }
  const agent = new AutonomiAgent(contractAddress as Address, key);
  agent.startCron();
  return agent;
}

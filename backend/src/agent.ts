import "dotenv/config.js";
import { createPublicClient, createWalletClient, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import cron from "node-cron";
import { autonomiAbi } from "./abi/autonomi.js";
import { getEntry, recordAlertSent } from "./sms/registry.js";
import { sendAlert } from "./sms/twilio-client.js";
import { getRebalanceMessage, getWarningMessage, getDailySummaryMessage, getPriceAlertMessage } from "./sms/templates.js";
import { dispatchWebhooks } from "./webhooks/dispatch.js";
import { buildRebalancePayload, buildWarningPayload, buildPricePayload } from "./webhooks/payloads.js";

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
  private lastPrice: bigint | null = null;

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

    // Large price move (>10%): notify users with largePriceMoves preference
    if (this.lastPrice !== null && this.lastPrice > 0n) {
      const pPrev = Number(this.lastPrice);
      const pCur = Number(price);
      const pct = Math.abs(pCur - pPrev) / pPrev;
        if (pct >= 0.1) {
        const prevF = (pPrev / 1e18).toFixed(2);
        const curF = (pCur / 1e18).toFixed(2);
        const changePct = (pct * 100).toFixed(1);
        const pricePayload = buildPricePayload({
          oldPrice: prevF,
          newPrice: curF,
          changePct,
          direction: pCur >= pPrev ? "up" : "down",
          contractAddress: this.contractAddress,
          chainId: ARC_CHAIN_ID,
        });
        dispatchWebhooks("price", pricePayload).catch((e) =>
          log("error", "Webhook dispatch (price) failed", { error: String(e) })
        );
        for (const user of TEST_ADDRESSES) {
          const entry = await getEntry(user);
          if (entry?.preferences.largePriceMoves && entry.phone) {
            const direction = pCur >= pPrev ? "up" : "down";
            const msg = getPriceAlertMessage({
              oldPrice: prevF,
              newPrice: curF,
              change: changePct,
              price: curF,
              direction,
              hourChange: changePct,
              low: prevF,
              high: curF,
              ltvImpact: changePct,
              volume: "—",
              spread: "—",
              reserves: "—",
              nextCheck: "300",
              yield: "—",
              oldLTV: "—",
              newLTV: "—",
            });
            const result = await sendAlert(entry.phone, msg);
            if (result.ok) await recordAlertSent(user);
          }
        }
      }
    }
    this.lastPrice = price;

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
          const warningPayload = buildWarningPayload({
            user,
            ltvBps: ltvForThreshold,
            price: (Number(price) / 1e18).toFixed(2),
            contractAddress: this.contractAddress,
            chainId: ARC_CHAIN_ID,
          });
          dispatchWebhooks("warning", warningPayload).catch((e) =>
            log("error", "Webhook dispatch (warning) failed", { error: String(e) })
          );
          const entry = await getEntry(user);
          if (entry?.preferences.warnings && entry.phone) {
            const msg = getWarningMessage({
              ltv: String(ltvForThreshold / 100),
              txHash: "pending",
              price: (Number(price) / 1e18).toFixed(2),
            });
            const result = await sendAlert(entry.phone, msg);
            if (result.ok) await recordAlertSent(user);
          }
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
    const [usycDeposited, usdcBorrowed] = await this.getPosition(user);
    const price = await this.getUSYCPrice();
    const priceFormatted = (Number(price) / 1e18).toFixed(2);
    const collateral = (Number(usycDeposited) / 1e6).toFixed(0);
    const borrowed = (Number(usdcBorrowed) / 1e6).toFixed(0);
    const ltvBefore = await this.getCurrentLTV(user);

    const hash = await this.walletClient.writeContract({
      address: this.contractAddress,
      abi: autonomiAbi,
      functionName: "autoRebalance",
      args: [user, targetLTV],
      account: this.account,
    });
    log("info", "autoRebalance tx sent", { user, txHash: hash });

    const rebalancePayload = buildRebalancePayload({
      user,
      txHash: hash,
      oldLTVBps: Number(ltvBefore),
      newLTVBps: Number(targetLTV),
      collateral,
      borrowed,
      price: priceFormatted,
      contractAddress: this.contractAddress,
      chainId: ARC_CHAIN_ID,
    });
    dispatchWebhooks("rebalance", rebalancePayload).catch((e) =>
      log("error", "Webhook dispatch (rebalance) failed", { error: String(e) })
    );

    const entry = await getEntry(user);
    if (entry?.preferences.rebalances && entry.phone) {
      const msg = getRebalanceMessage({
        txHash: hash,
        newLTV: String(Number(targetLTV) / 100),
        oldLTV: String(Number(ltvBefore) / 100),
        collateral,
        borrowed,
        price: priceFormatted,
        amount: "—",
        gas: "—",
      });
      const result = await sendAlert(entry.phone, msg);
      if (result.ok) await recordAlertSent(user);
    }
  }

  startCron(): void {
    // Every 5 minutes: monitor and rebalance
    cron.schedule("*/5 * * * *", () => {
      this.monitorAndRebalance().catch((e) => log("error", "Cron failed", { error: String(e) }));
    });
    // Daily summary at 9am
    cron.schedule("0 9 * * *", () => {
      this.sendDailySummaries().catch((e) => log("error", "Daily summary failed", { error: String(e) }));
    });
    log("info", "Cron scheduled: every 5 min (monitor), 9am (daily summary)");
  }

  async sendDailySummaries(): Promise<void> {
    const price = await this.getUSYCPrice();
    const priceFormatted = (Number(price) / 1e18).toFixed(2);
    const date = new Date().toISOString().slice(0, 10);
    for (const user of TEST_ADDRESSES) {
      const entry = await getEntry(user);
      if (!entry?.preferences.dailySummary || !entry.phone) continue;
      try {
        const [usycDeposited, usdcBorrowed, , , active] = await this.getPosition(user);
        const ltv = active ? await this.getCurrentLTV(user) : 0n;
        const ltvPct = (Number(ltv) / 100).toFixed(1);
        const usyc = (Number(usycDeposited) / 1e6).toFixed(0);
        const usdc = (Number(usdcBorrowed) / 1e6).toFixed(0);
        const msg = getDailySummaryMessage({
          date,
          position: usyc,
          borrowed: usdc,
          ltv: ltvPct,
          price: priceFormatted,
          avgLTV: ltvPct,
          rebalances: "0",
          avgAmount: "—",
          volatility: "—",
          efficiency: "—",
          protected: "—",
          startLTV: ltvPct,
          endLTV: ltvPct,
          highLTV: ltvPct,
          lowLTV: ltvPct,
          gasSpent: "—",
          yieldEarned: "—",
        });
        const result = await sendAlert(entry.phone, msg);
        if (result.ok) await recordAlertSent(user);
      } catch (e) {
        log("error", "Daily summary for user failed", { user, error: String(e) });
      }
    }
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

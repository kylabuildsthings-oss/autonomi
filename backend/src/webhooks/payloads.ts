/**
 * Webhook payload shapes. Autonomi POSTs these to registered URLs when events occur.
 * All payloads use a common envelope: { event, timestamp, data }.
 */

export interface WebhookEnvelope<T = unknown> {
  event: string;
  timestamp: string; // ISO 8601
  data: T;
}

/** rebalance — agent called autoRebalance for a user */
export interface RebalanceData {
  user: string;
  txHash: string;
  oldLTVBps: number;
  newLTVBps: number;
  collateral: string;
  borrowed: string;
  price: string;
  contractAddress: string;
  chainId: number;
}

/** warning — LTV exceeded threshold (e.g. ≥65%) before rebalance */
export interface WarningData {
  user: string;
  ltvBps: number;
  price: string;
  contractAddress: string;
  chainId: number;
}

/** price — significant USYC price move (e.g. >10%) */
export interface PriceData {
  oldPrice: string;
  newPrice: string;
  changePct: string;
  direction: "up" | "down";
  contractAddress: string;
  chainId: number;
}

export function buildRebalancePayload(data: RebalanceData): WebhookEnvelope<RebalanceData> {
  return {
    event: "rebalance",
    timestamp: new Date().toISOString(),
    data,
  };
}

export function buildWarningPayload(data: WarningData): WebhookEnvelope<WarningData> {
  return {
    event: "warning",
    timestamp: new Date().toISOString(),
    data,
  };
}

export function buildPricePayload(data: PriceData): WebhookEnvelope<PriceData> {
  return {
    event: "price",
    timestamp: new Date().toISOString(),
    data,
  };
}

import { createHmac } from "node:crypto";

/** HMAC-SHA256 signature of body for X-Webhook-Signature (optional verification). */
export function signPayload(body: string, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body, "utf8");
  return "sha256=" + hmac.digest("hex");
}

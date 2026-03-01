/**
 * Dispatch webhook events to registered URLs. POSTs JSON payload with retries and records each delivery attempt.
 * Axios is loaded dynamically to avoid pulling in form-data at agent startup (fixes GetIntrinsic error on Node 24+).
 */
import type { WebhookEvent } from "./service.js";
import { getActiveWebhooksForEvent, recordDelivery } from "./service.js";
import { getDb } from "../db/index.js";
import { signPayload } from "./payloads.js";

const POST_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [1000, 2000]; // after 1st and 2nd failure

export type WebhookPayload = { event: string; timestamp: string; data: unknown };

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Send payload to one webhook with retries. Records each attempt.
 */
async function deliverOne(
  db: ReturnType<typeof getDb>,
  wh: { id: string; url: string; secret: string },
  event: WebhookEvent,
  body: string
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Autonomi-Webhook/1.0",
    "X-Webhook-Event": event,
    "X-Webhook-ID": wh.id,
  };
  if (wh.secret) {
    headers["X-Webhook-Signature"] = signPayload(body, wh.secret);
  }

  const axios = (await import("axios")).default;

  let lastCode: number | null = null;
  let lastSuccess = false;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await axios.post(wh.url, body, {
        headers,
        timeout: POST_TIMEOUT_MS,
        validateStatus: () => true,
      });
      lastCode = res.status;
      lastSuccess = res.status >= 200 && res.status < 300;
      recordDelivery(db, wh.id, event, body, lastCode, lastSuccess);
      if (lastSuccess) return;
    } catch (e) {
      lastCode = null;
      lastSuccess = false;
      recordDelivery(db, wh.id, event, body, null, false);
      console.error("[webhook] Delivery failed", {
        webhookId: wh.id,
        url: wh.url,
        event,
        attempt: attempt + 1,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    if (attempt < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS_MS[attempt] ?? 2000;
      await sleep(delay);
    }
  }
}

/**
 * Send payload to all active webhooks subscribed to this event.
 * Runs asynchronously; logs errors but does not throw.
 */
export async function dispatchWebhooks(event: WebhookEvent, payload: WebhookPayload): Promise<void> {
  const db = getDb();
  const webhooks = getActiveWebhooksForEvent(db, event);
  if (webhooks.length === 0) return;

  const body = JSON.stringify(payload);

  await Promise.all(webhooks.map((wh) => deliverOne(db, wh, event, body)));
}

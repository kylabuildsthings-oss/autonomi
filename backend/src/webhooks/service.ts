/**
 * Webhook management: CRUD and delivery log.
 * Webhooks are scoped to an API key (api_key_id).
 */
import { randomBytes } from "node:crypto";
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";

export const WEBHOOK_EVENTS = ["rebalance", "warning", "price"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

function isValidEvents(events: unknown): events is WebhookEvent[] {
  return Array.isArray(events) && events.length > 0 && events.every((e) => typeof e === "string" && WEBHOOK_EVENTS.includes(e as WebhookEvent));
}

export interface CreateWebhookParams {
  api_key_id: string;
  url: string;
  events: WebhookEvent[];
  secret?: string;
}

/** Create a webhook. Secret is generated if not provided and returned once. */
export function createWebhook(db: Database, params: CreateWebhookParams): { id: string; url: string; events: WebhookEvent[]; secret: string; active: boolean; created_at: string } {
  const id = randomBytes(16).toString("hex");
  const url = params.url.trim();
  if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
    throw new Error("Invalid webhook URL");
  }
  if (!isValidEvents(params.events)) {
    throw new Error("Invalid events: must be a non-empty array of: " + WEBHOOK_EVENTS.join(", "));
  }
  const eventsJson = JSON.stringify(params.events);
  const secret = (params.secret && params.secret.trim()) ? params.secret.trim() : randomBytes(24).toString("hex");

  db.prepare(
    `INSERT INTO webhooks (id, api_key_id, url, events, secret, active) VALUES (?, ?, ?, ?, ?, 1)`
  ).run(id, params.api_key_id.trim(), url, eventsJson, secret);

  const row = db.prepare("SELECT created_at FROM webhooks WHERE id = ?").get(id) as { created_at: string };
  return {
    id,
    url,
    events: params.events,
    secret,
    active: true,
    created_at: row.created_at,
  };
}

/** List webhooks for an API key (secret not returned). */
export function listWebhooks(db: Database, api_key_id: string): Array<{ id: string; url: string; events: WebhookEvent[]; active: boolean; created_at: string }> {
  const rows = db.prepare(
    "SELECT id, url, events, active, created_at FROM webhooks WHERE api_key_id = ? ORDER BY created_at DESC"
  ).all(api_key_id.trim()) as Array<{ id: string; url: string; events: string; active: number; created_at: string }>;
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    events: JSON.parse(r.events) as WebhookEvent[],
    active: r.active === 1,
    created_at: r.created_at,
  }));
}

/** Get one webhook by id; returns null if not found or not owned by api_key_id. */
export function getWebhook(db: Database, id: string, api_key_id: string): { id: string; url: string; events: WebhookEvent[]; active: boolean; created_at: string } | null {
  const row = db.prepare(
    "SELECT id, url, events, active, created_at FROM webhooks WHERE id = ? AND api_key_id = ?"
  ).get(id.trim(), api_key_id.trim()) as { id: string; url: string; events: string; active: number; created_at: string } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    url: row.url,
    events: JSON.parse(row.events) as WebhookEvent[],
    active: row.active === 1,
    created_at: row.created_at,
  };
}

/** Update webhook (url, events, active). Returns true if updated. */
export function updateWebhook(
  db: Database,
  id: string,
  api_key_id: string,
  updates: { url?: string; events?: WebhookEvent[]; active?: boolean }
): boolean {
  const existing = db.prepare("SELECT id FROM webhooks WHERE id = ? AND api_key_id = ?").get(id.trim(), api_key_id.trim());
  if (!existing) return false;

  const setClauses: string[] = [];
  const values: unknown[] = [];
  if (updates.url !== undefined) {
    const u = updates.url.trim();
    if (!u || (!u.startsWith("http://") && !u.startsWith("https://"))) return false;
    setClauses.push("url = ?");
    values.push(u);
  }
  if (updates.events !== undefined) {
    if (!isValidEvents(updates.events)) return false;
    setClauses.push("events = ?");
    values.push(JSON.stringify(updates.events));
  }
  if (updates.active !== undefined) {
    setClauses.push("active = ?");
    values.push(updates.active ? 1 : 0);
  }
  if (setClauses.length === 0) return true;
  values.push(id.trim(), api_key_id.trim());
  db.prepare(`UPDATE webhooks SET ${setClauses.join(", ")} WHERE id = ? AND api_key_id = ?`).run(...values);
  return true;
}

/** Delete webhook. Returns true if deleted. */
export function deleteWebhook(db: Database, id: string, api_key_id: string): boolean {
  const result = db.prepare("DELETE FROM webhooks WHERE id = ? AND api_key_id = ?").run(id.trim(), api_key_id.trim());
  return result.changes > 0;
}

/** List recent deliveries for a webhook (owned by api_key_id). Default limit 50. */
export function listDeliveries(
  db: Database,
  webhook_id: string,
  api_key_id: string,
  limit = 50
): Array<{ id: string; event: string; response_code: number | null; success: boolean; attempted_at: string }> {
  const exists = db.prepare("SELECT id FROM webhooks WHERE id = ? AND api_key_id = ?").get(webhook_id.trim(), api_key_id.trim());
  if (!exists) return [];
  const rows = db.prepare(
    "SELECT id, event, response_code, success, attempted_at FROM webhook_deliveries WHERE webhook_id = ? ORDER BY attempted_at DESC LIMIT ?"
  ).all(webhook_id.trim(), Math.min(100, Math.max(1, limit))) as Array<{ id: string; event: string; response_code: number | null; success: number; attempted_at: string }>;
  return rows.map((r) => ({
    id: r.id,
    event: r.event,
    response_code: r.response_code,
    success: r.success === 1,
    attempted_at: r.attempted_at,
  }));
}

/** Record a delivery attempt (called when we POST to a webhook URL). */
export function recordDelivery(
  db: Database,
  webhook_id: string,
  event: string,
  payload: string,
  response_code: number | null,
  success: boolean
): void {
  const id = randomBytes(16).toString("hex");
  db.prepare(
    "INSERT INTO webhook_deliveries (id, webhook_id, event, payload, response_code, success) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, webhook_id, event, payload, response_code, success ? 1 : 0);
}

/** Get active webhooks that subscribe to an event (for dispatching). */
export function getActiveWebhooksForEvent(db: Database, event: WebhookEvent): Array<{ id: string; url: string; secret: string }> {
  const rows = db.prepare(
    "SELECT id, url, secret FROM webhooks WHERE active = 1"
  ).all() as Array<{ id: string; url: string; secret: string }>;
  return rows.filter((r) => {
    try {
      const ev = db.prepare("SELECT events FROM webhooks WHERE id = ?").get(r.id) as { events: string };
      const events = JSON.parse(ev.events) as string[];
      return events.includes(event);
    } catch {
      return false;
    }
  });
}

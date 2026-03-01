/**
 * Analytics: aggregate stats from DB and SMS registry.
 */
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";

export interface AnalyticsOverview {
  apiKeys: { total: number };
  webhooks: { total: number; active: number };
  webhookDeliveries: { total: number; success: number; failed: number };
  smsRegistrations: number;
  timestamp: string;
}

export async function getOverview(db: Database, smsRegistrationCount: number): Promise<AnalyticsOverview> {
  const apiKeysRow = db.prepare("SELECT COUNT(*) as c FROM api_keys").get() as { c: number };
  const webhooksAll = db.prepare("SELECT COUNT(*) as c FROM webhooks").get() as { c: number };
  const webhooksActive = db.prepare("SELECT COUNT(*) as c FROM webhooks WHERE active = 1").get() as { c: number };
  const deliveriesTotal = db.prepare("SELECT COUNT(*) as c FROM webhook_deliveries").get() as { c: number };
  const deliveriesSuccess = db.prepare("SELECT COUNT(*) as c FROM webhook_deliveries WHERE success = 1").get() as { c: number };

  return {
    apiKeys: { total: apiKeysRow?.c ?? 0 },
    webhooks: { total: webhooksAll?.c ?? 0, active: webhooksActive?.c ?? 0 },
    webhookDeliveries: {
      total: deliveriesTotal?.c ?? 0,
      success: deliveriesSuccess?.c ?? 0,
      failed: (deliveriesTotal?.c ?? 0) - (deliveriesSuccess?.c ?? 0),
    },
    smsRegistrations: smsRegistrationCount,
    timestamp: new Date().toISOString(),
  };
}

export interface WebhookDeliveryStats {
  byEvent: Record<string, { total: number; success: number; failed: number }>;
  recent: { total: number; success: number; failed: number };
  timestamp: string;
}

export function getWebhookDeliveryStats(db: Database, recentHours = 24): WebhookDeliveryStats {
  const byEvent: Record<string, { total: number; success: number; failed: number }> = {};
  const rows = db.prepare(
    "SELECT event, success, COUNT(*) as c FROM webhook_deliveries GROUP BY event, success"
  ).all() as Array<{ event: string; success: number; c: number }>;
  for (const r of rows) {
    if (!byEvent[r.event]) byEvent[r.event] = { total: 0, success: 0, failed: 0 };
    byEvent[r.event].total += r.c;
    if (r.success === 1) byEvent[r.event].success += r.c;
    else byEvent[r.event].failed += r.c;
  }

  const since = new Date(Date.now() - recentHours * 60 * 60 * 1000).toISOString();
  const recentRows = db.prepare(
    "SELECT success, COUNT(*) as c FROM webhook_deliveries WHERE attempted_at >= ? GROUP BY success"
  ).all(since) as Array<{ success: number; c: number }>;
  let recentTotal = 0;
  let recentSuccess = 0;
  for (const r of recentRows) {
    recentTotal += r.c;
    if (r.success === 1) recentSuccess += r.c;
  }

  return {
    byEvent,
    recent: { total: recentTotal, success: recentSuccess, failed: recentTotal - recentSuccess },
    timestamp: new Date().toISOString(),
  };
}

export interface ApiKeyUsageStats {
  total: number;
  withRecentUse: number;
  timestamp: string;
}

export function getApiKeyUsageStats(db: Database, recentDays = 7): ApiKeyUsageStats {
  const totalRow = db.prepare("SELECT COUNT(*) as c FROM api_keys").get() as { c: number };
  const since = new Date(Date.now() - recentDays * 24 * 60 * 60 * 1000).toISOString();
  const usedRow = db.prepare(
    "SELECT COUNT(*) as c FROM api_keys WHERE last_used IS NOT NULL AND last_used >= ?"
  ).get(since) as { c: number };
  return {
    total: totalRow?.c ?? 0,
    withRecentUse: usedRow?.c ?? 0,
    timestamp: new Date().toISOString(),
  };
}

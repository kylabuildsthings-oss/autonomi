/**
 * API key management: create, list, revoke, validate.
 * Keys are stored by SHA-256 hash; raw key is returned only on create.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Database } from "better-sqlite3";
import { getDb } from "../db/index.js";

const KEY_PREFIX = "ak_";
const KEY_BYTES = 32;

function hashKey(plain: string): string {
  return createHash("sha256").update(plain, "utf8").digest("hex");
}

/** Generate a new API key (raw) and its hash. */
export function generateKey(): { raw: string; hash: string } {
  const raw = KEY_PREFIX + randomBytes(KEY_BYTES).toString("hex");
  return { raw, hash: hashKey(raw) };
}

/** Create an API key. Returns the raw key once; store it securely. */
export function createKey(
  db: Database,
  params: {
    name: string;
    user_address: string;
    permissions?: string;
    rate_limit?: number;
    expires_at?: string | null;
  }
): { id: string; rawKey: string; name: string; user_address: string; permissions: string; rate_limit: number; created_at: string } {
  const id = randomBytes(16).toString("hex");
  const { raw, hash } = generateKey();
  const name = (params.name || "API Key").trim();
  const user_address = params.user_address.trim();
  const permissions = (params.permissions || "read").trim();
  const rate_limit = Math.max(0, Math.min(10000, params.rate_limit ?? 100));
  const expires_at = params.expires_at?.trim() || null;

  db.prepare(
    `INSERT INTO api_keys (id, name, key_hash, user_address, permissions, rate_limit, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, name, hash, user_address, permissions, rate_limit, expires_at);

  const row = db.prepare("SELECT created_at FROM api_keys WHERE id = ?").get(id) as { created_at: string };
  return {
    id,
    rawKey: raw,
    name,
    user_address,
    permissions,
    rate_limit,
    created_at: row.created_at,
  };
}

/** List API keys for a user (no raw key or hash returned). */
export function listKeys(
  db: Database,
  user_address: string
): Array<{ id: string; name: string; user_address: string; permissions: string; rate_limit: number; created_at: string; last_used: string | null; expires_at: string | null }> {
  const stmt = db.prepare(
    `SELECT id, name, user_address, permissions, rate_limit, created_at, last_used, expires_at
     FROM api_keys WHERE user_address = ? ORDER BY created_at DESC`
  );
  const rows = stmt.all(user_address.trim()) as Array<{
    id: string;
    name: string;
    user_address: string;
    permissions: string;
    rate_limit: number;
    created_at: string;
    last_used: string | null;
    expires_at: string | null;
  }>;
  return rows;
}

/** Revoke an API key; returns true if deleted (and owned by user_address). */
export function revokeKey(db: Database, id: string, user_address: string): boolean {
  const result = db.prepare("DELETE FROM api_keys WHERE id = ? AND user_address = ?").run(id.trim(), user_address.trim());
  return result.changes > 0;
}

/** Validate API key and optionally update last_used. Returns key metadata or null. */
export function validateKey(
  db: Database,
  rawKey: string,
  updateLastUsed = true
): { id: string; name: string; user_address: string; permissions: string; rate_limit: number } | null {
  if (!rawKey || !rawKey.startsWith(KEY_PREFIX)) return null;
  const hash = hashKey(rawKey);
  const row = db.prepare(
    "SELECT id, name, user_address, permissions, rate_limit FROM api_keys WHERE key_hash = ?"
  ).get(hash) as { id: string; name: string; user_address: string; permissions: string; rate_limit: number } | undefined;
  if (!row) return null;

  const withExpiry = db.prepare("SELECT expires_at FROM api_keys WHERE id = ?").get(row.id) as { expires_at: string | null };
  if (withExpiry?.expires_at && new Date(withExpiry.expires_at) < new Date()) return null;

  if (updateLastUsed) {
    db.prepare("UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?").run(row.id);
  }
  return row;
}

/** Extract Bearer token from Authorization header. */
export function getBearerToken(req: import("node:http").IncomingMessage): string | null {
  const auth = req.headers["authorization"];
  if (!auth || typeof auth !== "string") return null;
  const m = /^\s*Bearer\s+(.+)$/i.exec(auth);
  return m ? m[1].trim() : null;
}

/**
 * SMS registry — one wallet (address) ↔ one phone number.
 * Persists to data/sms-registry.json (created if missing).
 * Only the wallet owner can register or change the number (enforced by API via signature).
 * A phone number can be linked to at most one wallet.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const REGISTRY_PATH = join(process.cwd(), "data", "sms-registry.json");

export interface SmsPreferences {
  rebalances: boolean;      // when agent rebalances
  warnings: boolean;        // LTV > 65%
  largePriceMoves: boolean; // >10% move
  dailySummary: boolean;   // 9am summary
  testAlerts: boolean;     // allow test button to send
}

export const DEFAULT_PREFERENCES: SmsPreferences = {
  rebalances: true,
  warnings: true,
  largePriceMoves: true,
  dailySummary: true,
  testAlerts: true,
};

export interface RegistryEntry {
  phone: string;
  enabled: boolean;
  preferences: SmsPreferences;
  lastAlertAt: string | null; // ISO timestamp
}

let cache: Record<string, RegistryEntry> | null = null;

async function load(): Promise<Record<string, RegistryEntry>> {
  if (cache !== null) return cache;
  try {
    const raw = await readFile(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    cache = {};
    for (const [addr, v] of Object.entries(parsed)) {
      const e = v as Record<string, unknown>;
      const prefs = (e.preferences as Partial<SmsPreferences>) || {};
      cache[addr] = {
        phone: String(e.phone ?? ""),
        enabled: e.enabled !== false,
        preferences: { ...DEFAULT_PREFERENCES, ...prefs },
        lastAlertAt: typeof e.lastAlertAt === "string" ? e.lastAlertAt : null,
      };
    }
    return cache;
  } catch {
    cache = {};
    return cache;
  }
}

async function save(data: Record<string, RegistryEntry>): Promise<void> {
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(REGISTRY_PATH, JSON.stringify(data, null, 2), "utf-8");
  cache = data;
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

/** E.164-ish: digits and optional leading + */
export function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, "");
  return cleaned.length >= 10 && cleaned.length <= 15;
}

/** Register or update phone and optional preferences. Only the wallet owner can set/change the number (enforced by API with signature). */
export async function register(
  address: string,
  phone: string,
  preferences?: Partial<SmsPreferences>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const addr = normalizeAddress(address);
  const data = await load();
  const phoneTrimmed = phone.trim();
  // One number per wallet: ensure this phone isn't already registered to a different wallet
  for (const [existingAddr, entry] of Object.entries(data)) {
    if (existingAddr === addr) continue;
    if (entry.enabled && normalizePhone(entry.phone) === normalizePhone(phoneTrimmed)) {
      return { ok: false, error: "This number is already linked to another wallet. Use that wallet to change it." };
    }
  }
  const existing = data[addr];
  const prefs: SmsPreferences = existing
    ? { ...existing.preferences, ...preferences }
    : { ...DEFAULT_PREFERENCES, ...preferences };
  data[addr] = {
    phone: phoneTrimmed,
    enabled: true,
    preferences: prefs,
    lastAlertAt: existing?.lastAlertAt ?? null,
  };
  await save(data);
  return { ok: true };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

/** Update only preferences for an address. */
export async function updatePreferences(
  address: string,
  preferences: Partial<SmsPreferences>
): Promise<boolean> {
  const addr = normalizeAddress(address);
  const data = await load();
  const entry = data[addr];
  if (!entry || !entry.enabled) return false;
  entry.preferences = { ...entry.preferences, ...preferences };
  await save(data);
  return true;
}

/** Record that an alert was sent (updates lastAlertAt). */
export async function recordAlertSent(address: string): Promise<void> {
  const addr = normalizeAddress(address);
  const data = await load();
  const entry = data[addr];
  if (!entry) return;
  entry.lastAlertAt = new Date().toISOString();
  await save(data);
}

/** Get phone for address, or null if not registered. */
export async function getPhone(address: string): Promise<string | null> {
  const addr = normalizeAddress(address);
  const data = await load();
  const entry = data[addr];
  if (!entry || !entry.enabled) return null;
  return entry.phone;
}

/** Get full entry for address (for agent preference checks). */
export async function getEntry(address: string): Promise<RegistryEntry | null> {
  const addr = normalizeAddress(address);
  const data = await load();
  const entry = data[addr];
  if (!entry || !entry.enabled) return null;
  return entry;
}

/** Get masked phone for display (e.g. +***-1234). */
export async function getMaskedPhone(address: string): Promise<string | null> {
  const phone = await getPhone(address);
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "+***";
  return "+***-" + digits.slice(-4);
}

/** Check if address has SMS registered. */
export async function isRegistered(address: string): Promise<boolean> {
  const phone = await getPhone(address);
  return phone !== null;
}

/** Number of addresses registered for SMS alerts (for analytics). */
export async function getRegistrationCount(): Promise<number> {
  const data = await load();
  return Object.keys(data).length;
}

/** Get preferences and lastAlertAt for status API. */
export async function getStatus(address: string): Promise<{
  registered: boolean;
  maskedPhone: string | null;
  preferences: SmsPreferences;
  lastAlertAt: string | null;
}> {
  const entry = await getEntry(address);
  if (!entry) {
    return {
      registered: false,
      maskedPhone: null,
      preferences: { ...DEFAULT_PREFERENCES },
      lastAlertAt: null,
    };
  }
  const digits = entry.phone.replace(/\D/g, "");
  const maskedPhone = digits.length < 4 ? "+***" : "+***-" + digits.slice(-4);
  return {
    registered: true,
    maskedPhone,
    preferences: entry.preferences,
    lastAlertAt: entry.lastAlertAt,
  };
}

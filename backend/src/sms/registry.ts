/**
 * SMS registry — store wallet address → phone number for rebalance alerts.
 * Persists to data/sms-registry.json (created if missing).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const REGISTRY_PATH = join(process.cwd(), "data", "sms-registry.json");

export interface RegistryEntry {
  phone: string;
  enabled: boolean;
}

let cache: Record<string, RegistryEntry> | null = null;

async function load(): Promise<Record<string, RegistryEntry>> {
  if (cache !== null) return cache;
  try {
    const raw = await readFile(REGISTRY_PATH, "utf-8");
    cache = JSON.parse(raw) as Record<string, RegistryEntry>;
    return cache ?? {};
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

/** Register or update phone for a wallet address. */
export async function register(address: string, phone: string): Promise<void> {
  const addr = normalizeAddress(address);
  const data = await load();
  data[addr] = { phone: phone.trim(), enabled: true };
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

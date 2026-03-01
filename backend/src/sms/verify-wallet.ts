/**
 * Verify that a request to change SMS settings or send a test was signed by the wallet.
 * Uses EIP-191 personal_sign; message must match action and be recent (5 min).
 */

import { recoverMessageAddress } from "viem";

const MESSAGE_PREFIX = "Autonomi SMS: ";
const ACTIONS = ["register", "preferences", "test"] as const;
const TTL_MS = 5 * 60 * 1000; // 5 minutes

export type SmsAction = (typeof ACTIONS)[number];

const MESSAGE_REGEX = new RegExp(
  `^${MESSAGE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(register|preferences|test) (0x[a-fA-F0-9]{40}) at (\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z)$`
);

/**
 * Build the message the client should sign for an action.
 * Used by frontend; server only validates.
 */
export function buildMessage(action: SmsAction, address: string): string {
  const addr = address.trim().toLowerCase();
  if (!/^0x[a-fa-f0-9]{40}$/.test(addr)) throw new Error("Invalid address");
  if (!ACTIONS.includes(action)) throw new Error("Invalid action");
  return `${MESSAGE_PREFIX}${action} ${addr} at ${new Date().toISOString()}`;
}

/**
 * Validate message format and that timestamp is within TTL.
 * Returns { action, address } if valid; null otherwise.
 */
export function parseAndValidateMessage(message: string): { action: SmsAction; address: string } | null {
  const m = String(message).trim().match(MESSAGE_REGEX);
  if (!m) return null;
  const [, action, address, iso] = m;
  if (!ACTIONS.includes(action as SmsAction)) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  if (Math.abs(now - t) > TTL_MS) return null;
  return { action: action as SmsAction, address: address.toLowerCase() };
}

/**
 * Recover signer from message + signature and check it matches expected address.
 * Signature must be hex (0x-prefixed).
 */
export async function verifyWalletSignature(
  message: string,
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  const expected = expectedAddress.trim().toLowerCase();
  if (!/^0x[a-fa-f0-9]{40}$/.test(expected)) return false;
  if (!signature || typeof signature !== "string") return false;
  const sig = signature.startsWith("0x") ? signature : `0x${signature}`;
  try {
    const recovered = await recoverMessageAddress({
      message,
      signature: sig as `0x${string}`,
    });
    return recovered.toLowerCase() === expected;
  } catch {
    return false;
  }
}

/**
 * Full check: message is valid, recent, matches action and address; signature recovers to address.
 */
export async function requireSignedRequest(
  message: string,
  signature: string,
  action: SmsAction,
  address: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseAndValidateMessage(message);
  if (!parsed) {
    return { ok: false, error: "Invalid or expired message. Sign again from the Alerts page." };
  }
  if (parsed.action !== action) {
    return { ok: false, error: "Message does not match this action." };
  }
  if (parsed.address !== address.trim().toLowerCase()) {
    return { ok: false, error: "Message address does not match request." };
  }
  const valid = await verifyWalletSignature(message, signature, address);
  if (!valid) {
    return { ok: false, error: "Invalid signature. Connect the wallet that owns this address and try again." };
  }
  return { ok: true };
}

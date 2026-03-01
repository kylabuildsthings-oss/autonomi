/**
 * Verify community actions (set username, create post, add reply) with wallet signature.
 */

import { recoverMessageAddress } from "viem";

const PREFIX = "Autonomi Community: ";
const ACTIONS = ["community_username", "community_post", "community_reply"] as const;
const TTL_MS = 5 * 60 * 1000;

export type CommunityAction = (typeof ACTIONS)[number];

const REGEX = new RegExp(
  `^${PREFIX.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(community_username|community_post|community_reply) (0x[a-fA-F0-9]{40}) at (\\d{4}-\\d{2}-\\d{2}T[\\d:.]+Z)$`
);

export function buildMessage(action: CommunityAction, address: string): string {
  const addr = address.trim().toLowerCase();
  if (!/^0x[a-fa-f0-9]{40}$/.test(addr)) throw new Error("Invalid address");
  if (!ACTIONS.includes(action)) throw new Error("Invalid action");
  return `${PREFIX}${action} ${addr} at ${new Date().toISOString()}`;
}

function parseAndValidate(message: string): { action: CommunityAction; address: string } | null {
  const m = String(message).trim().match(REGEX);
  if (!m) return null;
  const [, action, address, iso] = m;
  if (!ACTIONS.includes(action as CommunityAction)) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  if (Math.abs(Date.now() - t) > TTL_MS) return null;
  return { action: action as CommunityAction, address: address.toLowerCase() };
}

async function verifySig(message: string, signature: string, expectedAddress: string): Promise<boolean> {
  const expected = expectedAddress.trim().toLowerCase();
  if (!/^0x[a-fa-f0-9]{40}$/.test(expected) || !signature) return false;
  const sig = signature.startsWith("0x") ? signature : `0x${signature}`;
  try {
    const recovered = await recoverMessageAddress({ message, signature: sig as `0x${string}` });
    return recovered.toLowerCase() === expected;
  } catch {
    return false;
  }
}

export async function requireSignedRequest(
  message: string,
  signature: string,
  action: CommunityAction,
  address: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parseAndValidate(message);
  if (!parsed) return { ok: false, error: "Invalid or expired message. Sign again in your wallet." };
  if (parsed.action !== action) return { ok: false, error: "Message does not match this action." };
  if (parsed.address !== address.trim().toLowerCase()) return { ok: false, error: "Address does not match." };
  const valid = await verifySig(message, signature, address);
  if (!valid) return { ok: false, error: "Invalid signature." };
  return { ok: true };
}

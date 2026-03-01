/**
 * Community forum: anon usernames (wallet → username), posts (threads), replies.
 * Persists to data/community.json.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const DATA_PATH = join(process.cwd(), "data", "community.json");

export interface CommunityData {
  users: Record<string, string>;   // address (lowercase) → username
  posts: CommunityPost[];
  replies: CommunityReply[];
}

export interface CommunityPost {
  id: string;
  authorWallet: string;
  authorUsername: string;
  title: string;
  body: string;
  createdAt: string; // ISO
}

export interface CommunityReply {
  id: string;
  postId: string;
  authorWallet: string;
  authorUsername: string;
  body: string;
  createdAt: string;
}

const defaultData: CommunityData = { users: {}, posts: [], replies: [] };

let cache: CommunityData | null = null;

async function load(): Promise<CommunityData> {
  if (cache) return cache;
  try {
    const raw = await readFile(DATA_PATH, "utf-8");
    const parsed = JSON.parse(raw) as CommunityData;
    cache = {
      users: parsed.users ?? {},
      posts: Array.isArray(parsed.posts) ? parsed.posts : [],
      replies: Array.isArray(parsed.replies) ? parsed.replies : [],
    };
    return cache;
  } catch {
    cache = { ...defaultData };
    return cache;
  }
}

async function save(data: CommunityData): Promise<void> {
  await mkdir(join(process.cwd(), "data"), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf-8");
  cache = data;
}

function normalizeAddress(addr: string): string {
  return addr.trim().toLowerCase();
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

const USERNAME_MAX = 32;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export function isValidUsername(username: string): boolean {
  const s = username.trim();
  return s.length >= 2 && s.length <= USERNAME_MAX && USERNAME_REGEX.test(s);
}

/** Get anon username for address (or null). */
export async function getUsername(address: string): Promise<string | null> {
  const data = await load();
  const u = data.users[normalizeAddress(address)];
  return u ?? null;
}

/** Set or update anon username. Returns error if username taken by another wallet. */
export async function setUsername(address: string, username: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const addr = normalizeAddress(address);
  const name = username.trim();
  if (!isValidUsername(name)) {
    return { ok: false, error: "Username must be 2–32 characters, letters, numbers, _ or -" };
  }
  const data = await load();
  for (const [a, u] of Object.entries(data.users)) {
    if (a !== addr && u.toLowerCase() === name.toLowerCase()) {
      return { ok: false, error: "Username already taken" };
    }
  }
  data.users[addr] = name;
  await save(data);
  return { ok: true };
}

/** List posts (newest first). */
export async function listPosts(limit = 50): Promise<CommunityPost[]> {
  const data = await load();
  return [...data.posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, limit);
}

/** Get one post by id. */
export async function getPost(id: string): Promise<CommunityPost | null> {
  const data = await load();
  return data.posts.find((p) => p.id === id) ?? null;
}

/** Get replies for a post (oldest first). */
export async function getReplies(postId: string): Promise<CommunityReply[]> {
  const data = await load();
  return data.replies.filter((r) => r.postId === postId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

/** Create a new post. authorUsername can be anon name or fallback to short address. */
export async function createPost(
  authorWallet: string,
  authorUsername: string,
  title: string,
  body: string
): Promise<CommunityPost> {
  const data = await load();
  const post: CommunityPost = {
    id: genId(),
    authorWallet: normalizeAddress(authorWallet),
    authorUsername: authorUsername.trim() || authorWallet.slice(0, 8) + "…",
    title: title.trim().slice(0, 200),
    body: body.trim().slice(0, 5000),
    createdAt: new Date().toISOString(),
  };
  data.posts.push(post);
  await save(data);
  return post;
}

/** Add reply to a post. */
export async function addReply(
  postId: string,
  authorWallet: string,
  authorUsername: string,
  body: string
): Promise<CommunityReply | null> {
  const data = await load();
  const post = data.posts.find((p) => p.id === postId);
  if (!post) return null;
  const reply: CommunityReply = {
    id: genId(),
    postId,
    authorWallet: normalizeAddress(authorWallet),
    authorUsername: authorUsername.trim() || authorWallet.slice(0, 8) + "…",
    body: body.trim().slice(0, 2000),
    createdAt: new Date().toISOString(),
  };
  data.replies.push(reply);
  await save(data);
  return reply;
}

import "dotenv/config.js";
import { createServer } from "node:http";
console.log("[server] Index loaded, creating HTTP server...");

const PORT = Number(process.env["PORT"] ?? 3000);
const API_VERSION = "1.0";
const CONTRACT_ADDRESS = process.env["AUTONOMI_ADDRESS"] ?? "";
const CHAIN_ID = Number(process.env["ARC_CHAIN_ID"] ?? 5042002);
const CHAIN_NAME = "Arc Testnet";
const WATCHED_COUNT = process.env["WATCH_ADDRESSES"]
  ? process.env["WATCH_ADDRESSES"].split(",").filter((s) => s.trim()).length
  : 0;

/** No default wallet: address must come from client (connect wallet). Optional env for server-side use only. */
const DEFAULT_DASHBOARD_ADDRESS = (process.env["WATCH_ADDRESSES"]?.split(",")[0]?.trim() ||
  process.env["AUTONOMI_DEFAULT_VIEWER"]) as `0x${string}` | undefined;

/** Response envelope for API v1 */
function apiV1Json(
  res: import("node:http").ServerResponse,
  status: number,
  data: unknown,
  errorMessage?: string
) {
  setCors(res);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  const success = status >= 200 && status < 300;
  const err =
    errorMessage ??
    (status >= 400 && data && typeof data === "object" && "error" in data
      ? (data as { error: string }).error
      : undefined);
  const body = {
    success,
    data: success ? data : data,
    error: err,
    meta: { version: API_VERSION, timestamp: new Date().toISOString() },
  };
  res.end(JSON.stringify(body));
}

/** Track agent state for GET /api/v1/agent */
let agentRunning = false;

function sendJson(res: import("node:http").ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function setCors(res: import("node:http").ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE, PATCH");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function getClientIp(req: import("node:http").IncomingMessage): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0];
    if (first) return first.trim();
  }
  return req.socket?.remoteAddress ?? "";
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";
  const parsed = new URL(url, `http://localhost:${PORT}`);

  const sendError = (status: number, message: string) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: message }));
  };

  try {
  if (req.method === "OPTIONS" && (parsed.pathname === "/api/dashboard" || parsed.pathname.startsWith("/api/sms") || parsed.pathname.startsWith("/api/community") || parsed.pathname.startsWith("/api/v1"))) {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/dashboard") {
    setCors(res);
    const address = (parsed.searchParams.get("address") || DEFAULT_DASHBOARD_ADDRESS || "").trim() as `0x${string}`;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      sendJson(res, 400, { error: "Address required. Connect your wallet to use the app." });
      return;
    }
    try {
      const { getDashboardData } = await import("./dashboard-api.js");
      const data = await getDashboardData(address);
      sendJson(res, 200, { ...data, address });
    } catch (e) {
      console.error("[server] Dashboard API error", e);
      sendJson(res, 500, { error: "Failed to fetch contract data" });
    }
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/dashboard/stats") {
    setCors(res);
    try {
      const { getStats } = await import("./stats/service.js");
      const stats = await getStats();
      (stats as { agent?: { running: boolean; positionsWatched: number } }).agent = {
        running: agentRunning,
        positionsWatched: WATCHED_COUNT,
      };
      sendJson(res, 200, stats);
    } catch (e) {
      console.error("[server] Dashboard stats error", e);
      sendJson(res, 500, { error: "Failed to fetch stats" });
    }
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/sms/status") {
    const address = parsed.searchParams.get("address")?.trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setCors(res);
      sendJson(res, 400, { error: "Invalid or missing address" });
      return;
    }
    setCors(res);
    try {
      const { getStatus } = await import("./sms/registry.js");
      const status = await getStatus(address);
      sendJson(res, 200, status);
    } catch (e) {
      console.error("[server] SMS status error", e);
      sendJson(res, 500, { error: "Failed to get SMS status" });
    }
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/sms/register") {
    setCors(res);
    try {
      const { register: registerSms, isValidPhone } = await import("./sms/registry.js");
      const { requireSignedRequest } = await import("./sms/verify-wallet.js");
      const { checkSmsRateLimit } = await import("./sms/rate-limit.js");
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        address?: string;
        phone?: string;
        preferences?: Record<string, boolean>;
        message?: string;
        signature?: string;
      };
      const address = body.address?.trim();
      const phone = body.phone?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        sendJson(res, 400, { error: "Invalid or missing address" });
        return;
      }
      if (!phone || !isValidPhone(phone)) {
        sendJson(res, 400, { error: "Invalid or missing phone (use E.164, e.g. +15551234567)" });
        return;
      }
      const message = body.message?.trim();
      const signature = body.signature;
      if (!message || !signature) {
        sendJson(res, 400, { error: "Wallet signature required. Sign the message in your wallet to register." });
        return;
      }
      const ip = getClientIp(req);
      const rate = checkSmsRateLimit("register", address, ip);
      if (!rate.allowed) {
        sendJson(res, 429, {
          error: "Too many registration attempts. Try again later.",
          retryAfterSec: rate.retryAfterSec,
        });
        return;
      }
      const auth = await requireSignedRequest(message, signature, "register", address);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error });
        return;
      }
      const prefs = body.preferences
        ? {
            rebalances: !!body.preferences.rebalances,
            warnings: !!body.preferences.warnings,
            largePriceMoves: !!body.preferences.largePriceMoves,
            dailySummary: !!body.preferences.dailySummary,
            testAlerts: !!body.preferences.testAlerts,
          }
        : undefined;
      const result = await registerSms(address, phone, prefs);
      if (!result.ok) {
        sendJson(res, 409, { error: result.error });
        return;
      }
      sendJson(res, 200, { success: true, message: "Phone registered for SMS alerts" });
    } catch (e) {
      if (e instanceof SyntaxError) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      console.error("[server] SMS register error", e);
      sendJson(res, 500, { error: "Failed to register phone" });
    }
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/sms/preferences") {
    setCors(res);
    try {
      const { updatePreferences } = await import("./sms/registry.js");
      const { requireSignedRequest } = await import("./sms/verify-wallet.js");
      const { checkSmsRateLimit } = await import("./sms/rate-limit.js");
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as {
        address?: string;
        preferences?: Record<string, boolean>;
        message?: string;
        signature?: string;
      };
      const address = body.address?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        sendJson(res, 400, { error: "Invalid or missing address" });
        return;
      }
      const message = body.message?.trim();
      const signature = body.signature;
      if (!message || !signature) {
        sendJson(res, 400, { error: "Wallet signature required. Sign the message in your wallet to update preferences." });
        return;
      }
      const ip = getClientIp(req);
      const rate = checkSmsRateLimit("preferences", address, ip);
      if (!rate.allowed) {
        sendJson(res, 429, {
          error: "Too many requests. Try again later.",
          retryAfterSec: rate.retryAfterSec,
        });
        return;
      }
      const auth = await requireSignedRequest(message, signature, "preferences", address);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error });
        return;
      }
      const p = body.preferences || {};
      const prefs: Record<string, boolean> = {};
      if (typeof p.rebalances === "boolean") prefs.rebalances = p.rebalances;
      if (typeof p.warnings === "boolean") prefs.warnings = p.warnings;
      if (typeof p.largePriceMoves === "boolean") prefs.largePriceMoves = p.largePriceMoves;
      if (typeof p.dailySummary === "boolean") prefs.dailySummary = p.dailySummary;
      if (typeof p.testAlerts === "boolean") prefs.testAlerts = p.testAlerts;
      const updated = await updatePreferences(address, prefs);
      if (!updated) {
        sendJson(res, 404, { error: "Address not registered for SMS" });
        return;
      }
      sendJson(res, 200, { success: true });
    } catch (e) {
      if (e instanceof SyntaxError) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      console.error("[server] SMS preferences error", e);
      sendJson(res, 500, { error: "Failed to update preferences" });
    }
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/sms/test") {
    setCors(res);
    try {
      const { getEntry, recordAlertSent } = await import("./sms/registry.js");
      const { sendAlert } = await import("./sms/twilio-client.js");
      const { getTestMessage } = await import("./sms/templates.js");
      const { requireSignedRequest } = await import("./sms/verify-wallet.js");
      const { checkSmsRateLimit } = await import("./sms/rate-limit.js");
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { address?: string; message?: string; signature?: string };
      const address = body.address?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        sendJson(res, 400, { error: "Invalid or missing address" });
        return;
      }
      const message = body.message?.trim();
      const signature = body.signature;
      if (!message || !signature) {
        sendJson(res, 400, { error: "Wallet signature required. Sign the message in your wallet to send a test SMS." });
        return;
      }
      const ip = getClientIp(req);
      const rate = checkSmsRateLimit("test", address, ip);
      if (!rate.allowed) {
        sendJson(res, 429, {
          error: "Too many test SMS requests. Try again later.",
          retryAfterSec: rate.retryAfterSec,
        });
        return;
      }
      const auth = await requireSignedRequest(message, signature, "test", address);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error });
        return;
      }
      const entry = await getEntry(address);
      if (!entry) {
        sendJson(res, 404, { error: "Address not registered for SMS" });
        return;
      }
      if (!entry.preferences.testAlerts) {
        sendJson(res, 400, { error: "Test alerts are disabled in preferences" });
        return;
      }
      const result = await sendAlert(entry.phone, getTestMessage());
      if (result.ok) await recordAlertSent(address);
      sendJson(res, 200, { success: true, sent: result.ok, error: result.ok ? undefined : result.error });
    } catch (e) {
      if (e instanceof SyntaxError) {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      console.error("[server] SMS test error", e);
      sendJson(res, 500, { error: "Failed to send test SMS" });
    }
    return;
  }

  // ---------- Community (anon forum) ----------
  if (req.method === "GET" && parsed.pathname === "/api/community/me") {
    const address = parsed.searchParams.get("address")?.trim();
    setCors(res);
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      sendJson(res, 400, { error: "Invalid or missing address" });
      return;
    }
    try {
      const { getUsername } = await import("./community/store.js");
      const username = await getUsername(address);
      sendJson(res, 200, { username });
    } catch (e) {
      console.error("[server] Community me error", e);
      sendJson(res, 500, { error: "Failed to get username" });
    }
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/community/username") {
    setCors(res);
    try {
      const { setUsername: setCommunityUsername, isValidUsername } = await import("./community/store.js");
      const { requireSignedRequest } = await import("./community/verify.js");
      const { checkCommunityRateLimit } = await import("./community/rate-limit.js");
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { address?: string; username?: string; message?: string; signature?: string };
      const address = body.address?.trim();
      const username = body.username?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        sendJson(res, 400, { error: "Invalid or missing address" });
        return;
      }
      if (!username || !isValidUsername(username)) {
        sendJson(res, 400, { error: "Username must be 2–32 characters, letters, numbers, _ or -" });
        return;
      }
      const message = body.message?.trim();
      const signature = body.signature;
      if (!message || !signature) {
        sendJson(res, 400, { error: "Wallet signature required" });
        return;
      }
      const ip = getClientIp(req);
      const rate = checkCommunityRateLimit("community_username", address, ip);
      if (!rate.allowed) {
        sendJson(res, 429, { error: "Too many attempts", retryAfterSec: rate.retryAfterSec });
        return;
      }
      const auth = await requireSignedRequest(message, signature, "community_username", address);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error });
        return;
      }
      const result = await setCommunityUsername(address, username);
      if (!result.ok) {
        sendJson(res, 409, { error: result.error });
        return;
      }
      sendJson(res, 200, { success: true, username });
    } catch (e) {
      if (e instanceof SyntaxError) sendJson(res, 400, { error: "Invalid JSON" });
      else {
        const errMsg = e instanceof Error ? e.message : "Failed to set username";
        console.error("[server] Community username error", e);
        sendJson(res, 500, { error: errMsg });
      }
    }
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/community/posts") {
    setCors(res);
    try {
      const { listPosts } = await import("./community/store.js");
      const posts = await listPosts();
      sendJson(res, 200, { posts });
    } catch (e) {
      console.error("[server] Community posts list error", e);
      sendJson(res, 500, { error: "Failed to list posts" });
    }
    return;
  }

  const communityPostIdMatch = parsed.pathname.match(/^\/api\/community\/posts\/([^/]+)$/);
  if (req.method === "GET" && communityPostIdMatch) {
    const postId = communityPostIdMatch[1];
    setCors(res);
    try {
      const { getPost, getReplies } = await import("./community/store.js");
      const post = await getPost(postId);
      if (!post) {
        sendJson(res, 404, { error: "Post not found" });
        return;
      }
      const replies = await getReplies(postId);
      sendJson(res, 200, { post, replies });
    } catch (e) {
      console.error("[server] Community post get error", e);
      sendJson(res, 500, { error: "Failed to load post" });
    }
    return;
  }

  if (req.method === "POST" && parsed.pathname === "/api/community/posts") {
    setCors(res);
    try {
      const { createPost, getUsername } = await import("./community/store.js");
      const { requireSignedRequest } = await import("./community/verify.js");
      const { checkCommunityRateLimit } = await import("./community/rate-limit.js");
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { address?: string; title?: string; body?: string; message?: string; signature?: string };
      const address = body.address?.trim();
      const title = body.title?.trim();
      const bodyText = body.body?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        sendJson(res, 400, { error: "Invalid or missing address" });
        return;
      }
      if (!title || title.length < 1 || title.length > 200) {
        sendJson(res, 400, { error: "Title required (max 200 characters)" });
        return;
      }
      const message = body.message?.trim();
      const signature = body.signature;
      if (!message || !signature) {
        sendJson(res, 400, { error: "Wallet signature required" });
        return;
      }
      const ip = getClientIp(req);
      const rate = checkCommunityRateLimit("community_post", address, ip);
      if (!rate.allowed) {
        sendJson(res, 429, { error: "Too many posts", retryAfterSec: rate.retryAfterSec });
        return;
      }
      const auth = await requireSignedRequest(message, signature, "community_post", address);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error });
        return;
      }
      const authorUsername = (await getUsername(address)) || address.slice(0, 8) + "…";
      const post = await createPost(address, authorUsername, title, bodyText || "");
      sendJson(res, 200, { success: true, post });
    } catch (e) {
      if (e instanceof SyntaxError) sendJson(res, 400, { error: "Invalid JSON" });
      else {
        const errMsg = e instanceof Error ? e.message : "Failed to create post";
        console.error("[server] Community post create error", e);
        sendJson(res, 500, { error: errMsg });
      }
    }
    return;
  }

  const communityReplyPostMatch = parsed.pathname.match(/^\/api\/community\/posts\/([^/]+)\/replies$/);
  if (req.method === "POST" && communityReplyPostMatch) {
    const postId = communityReplyPostMatch[1];
    setCors(res);
    try {
      const { addReply, getPost, getUsername } = await import("./community/store.js");
      const { requireSignedRequest } = await import("./community/verify.js");
      const { checkCommunityRateLimit } = await import("./community/rate-limit.js");
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { address?: string; body?: string; message?: string; signature?: string };
      const address = body.address?.trim();
      const bodyText = body.body?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        sendJson(res, 400, { error: "Invalid or missing address" });
        return;
      }
      if (!bodyText || bodyText.length < 1) {
        sendJson(res, 400, { error: "Reply body required" });
        return;
      }
      const message = body.message?.trim();
      const signature = body.signature;
      if (!message || !signature) {
        sendJson(res, 400, { error: "Wallet signature required" });
        return;
      }
      const post = await getPost(postId);
      if (!post) {
        sendJson(res, 404, { error: "Post not found" });
        return;
      }
      const ip = getClientIp(req);
      const rate = checkCommunityRateLimit("community_reply", address, ip);
      if (!rate.allowed) {
        sendJson(res, 429, { error: "Too many replies", retryAfterSec: rate.retryAfterSec });
        return;
      }
      const auth = await requireSignedRequest(message, signature, "community_reply", address);
      if (!auth.ok) {
        sendJson(res, 401, { error: auth.error });
        return;
      }
      const authorUsername = (await getUsername(address)) || address.slice(0, 8) + "…";
      const reply = await addReply(postId, address, authorUsername, bodyText);
      sendJson(res, 200, { success: true, reply });
    } catch (e) {
      if (e instanceof SyntaxError) sendJson(res, 400, { error: "Invalid JSON" });
      else {
        const errMsg = e instanceof Error ? e.message : "Failed to add reply";
        console.error("[server] Community reply error", e);
        sendJson(res, 500, { error: errMsg });
      }
    }
    return;
  }

  // ---------- API v1 (REST for external integrations) ----------
  if (parsed.pathname.startsWith("/api/v1")) {
    const p = parsed.pathname;

    if (req.method === "GET" && p === "/api/v1/health") {
      apiV1Json(res, 200, {
        status: "ok",
        version: API_VERSION,
        service: "autonomi-backend",
        contractAddress: CONTRACT_ADDRESS || null,
        chainId: CHAIN_ID,
        chainName: CHAIN_NAME,
      });
      return;
    }

    if (req.method === "GET" && p === "/api/v1/monitoring/health") {
      try {
        const { runHealthChecks } = await import("./monitoring/health.js");
        const health = await runHealthChecks();
        const statusCode = health.status === "ok" ? 200 : 503;
        apiV1Json(res, statusCode, health);
      } catch (e) {
        console.error("[server] Monitoring health error", e);
        apiV1Json(res, 503, { status: "error", checks: {}, timestamp: new Date().toISOString() }, "Health check failed");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/monitoring/ready") {
      try {
        const { isReady } = await import("./monitoring/health.js");
        const ready = await isReady();
        if (ready) {
          apiV1Json(res, 200, { ready: true, timestamp: new Date().toISOString() });
        } else {
          const { runHealthChecks } = await import("./monitoring/health.js");
          const health = await runHealthChecks();
          apiV1Json(res, 503, { ready: false, checks: health.checks, timestamp: health.timestamp }, "Not ready");
        }
      } catch (e) {
        console.error("[server] Monitoring ready error", e);
        apiV1Json(res, 503, { ready: false, timestamp: new Date().toISOString() }, "Readiness check failed");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/monitoring/status") {
      try {
        const { runHealthChecks } = await import("./monitoring/health.js");
        const health = await runHealthChecks();
        apiV1Json(res, 200, {
          status: health.status,
          checks: health.checks,
          timestamp: health.timestamp,
          version: API_VERSION,
          service: "autonomi-backend",
          agent: { running: agentRunning, watchedAddressesCount: agentRunning ? WATCHED_COUNT : null },
          contractAddress: CONTRACT_ADDRESS || null,
          chainId: CHAIN_ID,
          chainName: CHAIN_NAME,
        });
      } catch (e) {
        console.error("[server] Monitoring status error", e);
        apiV1Json(res, 500, null, "Status check failed");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/market") {
      try {
        const { getUsycPrice } = await import("./dashboard-api.js");
        const usycPrice = await getUsycPrice();
        apiV1Json(res, 200, {
          usycPrice,
          contractAddress: CONTRACT_ADDRESS || null,
          chainId: CHAIN_ID,
          chainName: CHAIN_NAME,
        });
      } catch (e) {
        console.error("[server] Market API error", e);
        apiV1Json(res, 500, null, "Failed to fetch market data");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/positions") {
      const addressesParam = parsed.searchParams.get("addresses")?.trim();
      if (!addressesParam) {
        apiV1Json(res, 400, { error: "Missing query: addresses (comma-separated, e.g. addresses=0x...,0x...)" }, "Missing addresses");
        return;
      }
      const rawAddresses = addressesParam.split(",").map((s) => s.trim()).filter(Boolean);
      const MAX_POSITIONS = 20;
      if (rawAddresses.length > MAX_POSITIONS) {
        apiV1Json(res, 400, { error: `At most ${MAX_POSITIONS} addresses allowed` }, `At most ${MAX_POSITIONS} addresses allowed`);
        return;
      }
      const addresses = rawAddresses.filter((a) => /^0x[a-fA-F0-9]{40}$/.test(a)) as `0x${string}`[];
      if (addresses.length === 0) {
        apiV1Json(res, 400, { error: "No valid addresses" }, "No valid addresses");
        return;
      }
      try {
        const { getDashboardData } = await import("./dashboard-api.js");
        const results = await Promise.all(addresses.map((addr) => getDashboardData(addr)));
        const usycPrice = results[0]?.usycPrice ?? "0";
        const positions = results.map((r, i) => ({ address: addresses[i], position: r.position }));
        apiV1Json(res, 200, { usycPrice, positions });
      } catch (e) {
        console.error("[server] Positions batch API error", e);
        apiV1Json(res, 500, null, "Failed to fetch positions");
      }
      return;
    }

    if (req.method === "GET" && p.startsWith("/api/v1/positions/")) {
      const address = decodeURIComponent(p.slice("/api/v1/positions/".length)).trim() as `0x${string}`;
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        apiV1Json(res, 400, { error: "Invalid or missing address" }, "Invalid or missing address");
        return;
      }
      try {
        const { getDashboardData } = await import("./dashboard-api.js");
        const data = await getDashboardData(address);
        apiV1Json(res, 200, { ...data, address });
      } catch (e) {
        console.error("[server] Positions API error", e);
        apiV1Json(res, 500, null, "Failed to fetch position");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/agent") {
      apiV1Json(res, 200, {
        running: agentRunning,
        contractAddress: CONTRACT_ADDRESS || null,
        watchedAddressesCount: agentRunning ? WATCHED_COUNT : null,
      });
      return;
    }

    if (req.method === "GET" && p === "/api/v1/stats") {
      try {
        const { getStats } = await import("./stats/service.js");
        const stats = await getStats();
        (stats as { agent?: { running: boolean; positionsWatched: number } }).agent = {
          running: agentRunning,
          positionsWatched: WATCHED_COUNT,
        };
        apiV1Json(res, 200, stats);
      } catch (e) {
        console.error("[server] Stats API error", e);
        apiV1Json(res, 500, null, "Failed to fetch stats");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/analytics/overview") {
      try {
        const { getDb } = await import("./db/index.js");
        const { getOverview } = await import("./analytics/service.js");
        const { getRegistrationCount } = await import("./sms/registry.js");
        const database = getDb();
        const smsCount = await getRegistrationCount();
        const overview = await getOverview(database, smsCount);
        apiV1Json(res, 200, {
          ...overview,
          agent: { running: agentRunning, watchedAddressesCount: agentRunning ? WATCHED_COUNT : null },
        });
      } catch (e) {
        console.error("[server] Analytics overview error", e);
        apiV1Json(res, 500, null, "Failed to get analytics");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/analytics/webhooks") {
      try {
        const { getDb } = await import("./db/index.js");
        const { getWebhookDeliveryStats } = await import("./analytics/service.js");
        const database = getDb();
        const recentHours = Math.min(168, Math.max(1, parseInt(parsed.searchParams.get("hours") ?? "24", 10) || 24));
        const stats = getWebhookDeliveryStats(database, recentHours);
        apiV1Json(res, 200, stats);
      } catch (e) {
        console.error("[server] Analytics webhooks error", e);
        apiV1Json(res, 500, null, "Failed to get webhook stats");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/analytics/usage") {
      try {
        const { getDb } = await import("./db/index.js");
        const { getApiKeyUsageStats } = await import("./analytics/service.js");
        const database = getDb();
        const recentDays = Math.min(90, Math.max(1, parseInt(parsed.searchParams.get("days") ?? "7", 10) || 7));
        const stats = getApiKeyUsageStats(database, recentDays);
        apiV1Json(res, 200, stats);
      } catch (e) {
        console.error("[server] Analytics usage error", e);
        apiV1Json(res, 500, null, "Failed to get usage stats");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/openapi.json") {
      const { openApiV1 } = await import("./api/openapi.js");
      setCors(res);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(openApiV1));
      return;
    }

    if (req.method === "GET" && (p === "/api/v1/docs" || p === "/api/v1/docs/")) {
      const host = req.headers["host"] ?? `localhost:${PORT}`;
      const proto = req.headers["x-forwarded-proto"] === "https" ? "https" : "http";
      const specUrl = `${proto}://${host}/api/v1/openapi.json`;
      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Autonomi API — OpenAPI 3.0</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js" crossorigin></script>
  <script>
    window.onload = () => {
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: "#swagger-ui",
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIBundle.SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
      setCors(res);
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(html);
      return;
    }
    if (req.method === "GET" && p === "/api/v1/alerts/status") {
      const address = parsed.searchParams.get("address")?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        apiV1Json(res, 400, { error: "Invalid or missing address" }, "Invalid or missing address");
        return;
      }
      try {
        const { getStatus } = await import("./sms/registry.js");
        const status = await getStatus(address);
        apiV1Json(res, 200, status);
      } catch (e) {
        console.error("[server] SMS status error", e);
        apiV1Json(res, 500, null, "Failed to get SMS status");
      }
      return;
    }

    // ---------- Auth (API keys) ----------
    if (req.method === "GET" && p === "/api/v1/auth/me") {
      const { getDb } = await import("./db/index.js");
      const { validateKey, getBearerToken } = await import("./auth/api-keys.js");
      const token = getBearerToken(req);
      if (!token) {
        apiV1Json(res, 401, { error: "Missing or invalid Authorization header" }, "Missing or invalid Authorization header");
        return;
      }
      const database = getDb();
      const key = validateKey(database, token);
      if (!key) {
        apiV1Json(res, 401, { error: "Invalid or expired API key" }, "Invalid or expired API key");
        return;
      }
      const { checkAndConsume, RATE_LIMIT_RETRY_AFTER_SECONDS } = await import("./auth/rate-limit.js");
      if (!checkAndConsume(key.id, key.rate_limit)) {
        res.setHeader("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
        apiV1Json(res, 429, { error: "Rate limit exceeded" }, "Rate limit exceeded");
        return;
      }
      apiV1Json(res, 200, { user_address: key.user_address, permissions: key.permissions, rate_limit: key.rate_limit, name: key.name });
      return;
    }

    if (req.method === "POST" && p === "/api/v1/auth/keys") {
      try {
        const { getDb } = await import("./db/index.js");
        const { createKey } = await import("./auth/api-keys.js");
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as {
          name?: string;
          user_address?: string;
          permissions?: string;
          rate_limit?: number;
          expires_at?: string | null;
        };
        const user_address = body.user_address?.trim();
        if (!user_address || !/^0x[a-fA-F0-9]{40}$/.test(user_address)) {
          apiV1Json(res, 400, { error: "Invalid or missing user_address" }, "Invalid or missing user_address");
          return;
        }
        const database = getDb();
        const created = createKey(database, {
          name: body.name ?? "API Key",
          user_address,
          permissions: body.permissions,
          rate_limit: body.rate_limit,
          expires_at: body.expires_at,
        });
        apiV1Json(res, 201, {
          id: created.id,
          rawKey: created.rawKey,
          name: created.name,
          user_address: created.user_address,
          permissions: created.permissions,
          rate_limit: created.rate_limit,
          created_at: created.created_at,
        });
      } catch (e) {
        if (e instanceof SyntaxError) {
          apiV1Json(res, 400, { error: "Invalid JSON" }, "Invalid JSON body");
          return;
        }
        console.error("[server] Auth create key error", e);
        apiV1Json(res, 500, null, "Failed to create API key");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/auth/keys") {
      const address = parsed.searchParams.get("address")?.trim();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        apiV1Json(res, 400, { error: "Invalid or missing address" }, "Invalid or missing address");
        return;
      }
      try {
        const { getDb } = await import("./db/index.js");
        const { listKeys } = await import("./auth/api-keys.js");
        const database = getDb();
        const keys = listKeys(database, address);
        apiV1Json(res, 200, { keys });
      } catch (e) {
        console.error("[server] Auth list keys error", e);
        apiV1Json(res, 500, null, "Failed to list API keys");
      }
      return;
    }

    if (req.method === "DELETE" && p.startsWith("/api/v1/auth/keys/")) {
      const id = p.slice("/api/v1/auth/keys/".length).trim();
      const address = parsed.searchParams.get("address")?.trim();
      if (!id) {
        apiV1Json(res, 404, null, "Not found");
        return;
      }
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        apiV1Json(res, 400, { error: "Invalid or missing address" }, "Invalid or missing address");
        return;
      }
      try {
        const { getDb } = await import("./db/index.js");
        const { revokeKey } = await import("./auth/api-keys.js");
        const database = getDb();
        const revoked = revokeKey(database, id, address);
        if (!revoked) {
          apiV1Json(res, 404, { error: "Key not found or not owned by address" }, "Key not found or not owned by address");
          return;
        }
        apiV1Json(res, 200, { success: true });
      } catch (e) {
        console.error("[server] Auth revoke key error", e);
        apiV1Json(res, 500, null, "Failed to revoke API key");
      }
      return;
    }

    // ---------- Webhooks (require Bearer API key) ----------
    if (req.method === "POST" && p === "/api/v1/webhooks") {
      const { getDb } = await import("./db/index.js");
      const { validateKey, getBearerToken } = await import("./auth/api-keys.js");
      const token = getBearerToken(req);
      if (!token) {
        apiV1Json(res, 401, { error: "Missing or invalid Authorization header" }, "Missing or invalid Authorization header");
        return;
      }
      const database = getDb();
      const key = validateKey(database, token);
      if (!key) {
        apiV1Json(res, 401, { error: "Invalid or expired API key" }, "Invalid or expired API key");
        return;
      }
      const { checkAndConsume, RATE_LIMIT_RETRY_AFTER_SECONDS } = await import("./auth/rate-limit.js");
      if (!checkAndConsume(key.id, key.rate_limit)) {
        res.setHeader("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
        apiV1Json(res, 429, { error: "Rate limit exceeded" }, "Rate limit exceeded");
        return;
      }
      try {
        const { createWebhook, WEBHOOK_EVENTS } = await import("./webhooks/service.js");
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as { url?: string; events?: string[]; secret?: string };
        const url = body.url?.trim();
        if (!url || (!url.startsWith("http://") && !url.startsWith("https://"))) {
          apiV1Json(res, 400, { error: "Invalid or missing url" }, "Invalid or missing url");
          return;
        }
        const events = body.events;
        if (!Array.isArray(events) || events.length === 0 || !events.every((e) => typeof e === "string" && WEBHOOK_EVENTS.includes(e as "rebalance" | "warning" | "price"))) {
          apiV1Json(res, 400, { error: "Invalid or missing events (array of: " + WEBHOOK_EVENTS.join(", ") + ")" }, "Invalid or missing events");
          return;
        }
        const created = createWebhook(database, { api_key_id: key.id, url, events: events as ("rebalance" | "warning" | "price")[], secret: body.secret });
        apiV1Json(res, 201, {
          id: created.id,
          url: created.url,
          events: created.events,
          secret: created.secret,
          active: created.active,
          created_at: created.created_at,
        });
      } catch (e) {
        if (e instanceof SyntaxError) {
          apiV1Json(res, 400, { error: "Invalid JSON" }, "Invalid JSON body");
          return;
        }
        apiV1Json(res, 400, { error: e instanceof Error ? e.message : "Invalid input" }, e instanceof Error ? e.message : "Invalid input");
      }
      return;
    }

    if (req.method === "GET" && p === "/api/v1/webhooks") {
      const { getDb } = await import("./db/index.js");
      const { validateKey, getBearerToken } = await import("./auth/api-keys.js");
      const token = getBearerToken(req);
      if (!token) {
        apiV1Json(res, 401, { error: "Missing or invalid Authorization header" }, "Missing or invalid Authorization header");
        return;
      }
      const database = getDb();
      const key = validateKey(database, token);
      if (!key) {
        apiV1Json(res, 401, { error: "Invalid or expired API key" }, "Invalid or expired API key");
        return;
      }
      const { checkAndConsume, RATE_LIMIT_RETRY_AFTER_SECONDS } = await import("./auth/rate-limit.js");
      if (!checkAndConsume(key.id, key.rate_limit)) {
        res.setHeader("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
        apiV1Json(res, 429, { error: "Rate limit exceeded" }, "Rate limit exceeded");
        return;
      }
      try {
        const { listWebhooks } = await import("./webhooks/service.js");
        const webhooks = listWebhooks(database, key.id);
        apiV1Json(res, 200, { webhooks });
      } catch (e) {
        console.error("[server] Webhooks list error", e);
        apiV1Json(res, 500, null, "Failed to list webhooks");
      }
      return;
    }

    if (req.method === "GET" && p.startsWith("/api/v1/webhooks/") && !p.includes("/deliveries")) {
      const webhookId = p.slice("/api/v1/webhooks/".length).trim();
      if (!webhookId) {
        apiV1Json(res, 404, null, "Not found");
        return;
      }
      const { getDb } = await import("./db/index.js");
      const { validateKey, getBearerToken } = await import("./auth/api-keys.js");
      const token = getBearerToken(req);
      if (!token) {
        apiV1Json(res, 401, { error: "Missing or invalid Authorization header" }, "Missing or invalid Authorization header");
        return;
      }
      const database = getDb();
      const key = validateKey(database, token);
      if (!key) {
        apiV1Json(res, 401, { error: "Invalid or expired API key" }, "Invalid or expired API key");
        return;
      }
      const { checkAndConsume, RATE_LIMIT_RETRY_AFTER_SECONDS } = await import("./auth/rate-limit.js");
      if (!checkAndConsume(key.id, key.rate_limit)) {
        res.setHeader("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
        apiV1Json(res, 429, { error: "Rate limit exceeded" }, "Rate limit exceeded");
        return;
      }
      const { getWebhook } = await import("./webhooks/service.js");
      const webhook = getWebhook(database, webhookId, key.id);
      if (!webhook) {
        apiV1Json(res, 404, { error: "Webhook not found" }, "Webhook not found");
        return;
      }
      apiV1Json(res, 200, webhook);
      return;
    }

    if (req.method === "PATCH" && p.startsWith("/api/v1/webhooks/") && !p.includes("/deliveries")) {
      const webhookId = p.slice("/api/v1/webhooks/".length).trim();
      if (!webhookId) {
        apiV1Json(res, 404, null, "Not found");
        return;
      }
      const { getDb } = await import("./db/index.js");
      const { validateKey, getBearerToken } = await import("./auth/api-keys.js");
      const token = getBearerToken(req);
      if (!token) {
        apiV1Json(res, 401, { error: "Missing or invalid Authorization header" }, "Missing or invalid Authorization header");
        return;
      }
      const database = getDb();
      const key = validateKey(database, token);
      if (!key) {
        apiV1Json(res, 401, { error: "Invalid or expired API key" }, "Invalid or expired API key");
        return;
      }
      const { checkAndConsume, RATE_LIMIT_RETRY_AFTER_SECONDS } = await import("./auth/rate-limit.js");
      if (!checkAndConsume(key.id, key.rate_limit)) {
        res.setHeader("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
        apiV1Json(res, 429, { error: "Rate limit exceeded" }, "Rate limit exceeded");
        return;
      }
      try {
        const { updateWebhook, getWebhook, WEBHOOK_EVENTS } = await import("./webhooks/service.js");
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as { url?: string; events?: string[]; active?: boolean };
        const updates: { url?: string; events?: ("rebalance" | "warning" | "price")[]; active?: boolean } = {};
        if (body.url !== undefined) {
          const u = body.url?.trim();
          if (!u || (!u.startsWith("http://") && !u.startsWith("https://"))) {
            apiV1Json(res, 400, { error: "Invalid url" }, "Invalid url");
            return;
          }
          updates.url = u;
        }
        if (body.events !== undefined) {
          if (!Array.isArray(body.events) || body.events.length === 0 || !body.events.every((e) => typeof e === "string" && WEBHOOK_EVENTS.includes(e as "rebalance" | "warning" | "price"))) {
            apiV1Json(res, 400, { error: "Invalid events" }, "Invalid events");
            return;
          }
          updates.events = body.events as ("rebalance" | "warning" | "price")[];
        }
        if (typeof body.active === "boolean") updates.active = body.active;
        const updated = updateWebhook(database, webhookId, key.id, updates);
        if (!updated) {
          apiV1Json(res, 404, { error: "Webhook not found" }, "Webhook not found");
          return;
        }
        const webhook = getWebhook(database, webhookId, key.id);
        apiV1Json(res, 200, webhook ?? {});
      } catch (e) {
        if (e instanceof SyntaxError) {
          apiV1Json(res, 400, { error: "Invalid JSON" }, "Invalid JSON body");
          return;
        }
        console.error("[server] Webhook update error", e);
        apiV1Json(res, 500, null, "Failed to update webhook");
      }
      return;
    }

    if (req.method === "DELETE" && p.startsWith("/api/v1/webhooks/") && !p.includes("/deliveries")) {
      const webhookId = p.slice("/api/v1/webhooks/".length).trim();
      if (!webhookId) {
        apiV1Json(res, 404, null, "Not found");
        return;
      }
      const { getDb } = await import("./db/index.js");
      const { validateKey, getBearerToken } = await import("./auth/api-keys.js");
      const token = getBearerToken(req);
      if (!token) {
        apiV1Json(res, 401, { error: "Missing or invalid Authorization header" }, "Missing or invalid Authorization header");
        return;
      }
      const database = getDb();
      const key = validateKey(database, token);
      if (!key) {
        apiV1Json(res, 401, { error: "Invalid or expired API key" }, "Invalid or expired API key");
        return;
      }
      const { checkAndConsume, RATE_LIMIT_RETRY_AFTER_SECONDS } = await import("./auth/rate-limit.js");
      if (!checkAndConsume(key.id, key.rate_limit)) {
        res.setHeader("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
        apiV1Json(res, 429, { error: "Rate limit exceeded" }, "Rate limit exceeded");
        return;
      }
      const { deleteWebhook } = await import("./webhooks/service.js");
      const deleted = deleteWebhook(database, webhookId, key.id);
      if (!deleted) {
        apiV1Json(res, 404, { error: "Webhook not found" }, "Webhook not found");
        return;
      }
      apiV1Json(res, 200, { success: true });
      return;
    }

    if (req.method === "GET" && p.match(/^\/api\/v1\/webhooks\/[^/]+\/deliveries$/)) {
      const match = p.match(/^\/api\/v1\/webhooks\/([^/]+)\/deliveries$/);
      const webhookId = match ? match[1].trim() : "";
      const limit = Math.min(100, Math.max(1, parseInt(parsed.searchParams.get("limit") ?? "50", 10) || 50));
      const { getDb } = await import("./db/index.js");
      const { validateKey, getBearerToken } = await import("./auth/api-keys.js");
      const token = getBearerToken(req);
      if (!token) {
        apiV1Json(res, 401, { error: "Missing or invalid Authorization header" }, "Missing or invalid Authorization header");
        return;
      }
      const database = getDb();
      const key = validateKey(database, token);
      if (!key) {
        apiV1Json(res, 401, { error: "Invalid or expired API key" }, "Invalid or expired API key");
        return;
      }
      const { checkAndConsume, RATE_LIMIT_RETRY_AFTER_SECONDS } = await import("./auth/rate-limit.js");
      if (!checkAndConsume(key.id, key.rate_limit)) {
        res.setHeader("Retry-After", String(RATE_LIMIT_RETRY_AFTER_SECONDS));
        apiV1Json(res, 429, { error: "Rate limit exceeded" }, "Rate limit exceeded");
        return;
      }
      const { listDeliveries } = await import("./webhooks/service.js");
      const deliveries = listDeliveries(database, webhookId, key.id, limit);
      if (!deliveries.length && webhookId) {
        const { getWebhook } = await import("./webhooks/service.js");
        const wh = getWebhook(database, webhookId, key.id);
        if (!wh) {
          apiV1Json(res, 404, { error: "Webhook not found" }, "Webhook not found");
          return;
        }
      }
      apiV1Json(res, 200, { deliveries });
      return;
    }

    if (req.method === "POST" && p === "/api/v1/alerts/register") {
      try {
        const { register: registerSms, isValidPhone } = await import("./sms/registry.js");
        const { requireSignedRequest } = await import("./sms/verify-wallet.js");
        const { checkSmsRateLimit } = await import("./sms/rate-limit.js");
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as {
          address?: string;
          phone?: string;
          preferences?: Record<string, boolean>;
          message?: string;
          signature?: string;
        };
        const address = body.address?.trim();
        const phone = body.phone?.trim();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          apiV1Json(res, 400, { error: "Invalid or missing address" }, "Invalid or missing address");
          return;
        }
        if (!phone || !isValidPhone(phone)) {
          apiV1Json(res, 400, { error: "Invalid or missing phone (E.164)" }, "Invalid or missing phone");
          return;
        }
        const message = body.message?.trim();
        const signature = body.signature;
        if (!message || !signature) {
          apiV1Json(res, 400, { error: "Wallet signature required" }, "Wallet signature required. Sign the message in your wallet to register.");
          return;
        }
        const ip = getClientIp(req);
        const rate = checkSmsRateLimit("register", address, ip);
        if (!rate.allowed) {
          res.statusCode = 429;
          apiV1Json(res, 429, { error: "Too many registration attempts", retryAfterSec: rate.retryAfterSec }, "Too many attempts");
          return;
        }
        const auth = await requireSignedRequest(message, signature, "register", address);
        if (!auth.ok) {
          apiV1Json(res, 401, { error: auth.error }, auth.error);
          return;
        }
        const prefs = body.preferences
          ? {
              rebalances: !!body.preferences.rebalances,
              warnings: !!body.preferences.warnings,
              largePriceMoves: !!body.preferences.largePriceMoves,
              dailySummary: !!body.preferences.dailySummary,
              testAlerts: !!body.preferences.testAlerts,
            }
          : undefined;
        const result = await registerSms(address, phone, prefs);
        if (!result.ok) {
          apiV1Json(res, 409, { error: result.error }, result.error);
          return;
        }
        apiV1Json(res, 200, { success: true, message: "Phone registered for SMS alerts" });
      } catch (e) {
        if (e instanceof SyntaxError) {
          apiV1Json(res, 400, { error: "Invalid JSON" }, "Invalid JSON body");
          return;
        }
        console.error("[server] SMS register error", e);
        apiV1Json(res, 500, null, "Failed to register phone");
      }
      return;
    }

    if (req.method === "POST" && p === "/api/v1/alerts/preferences") {
      try {
        const { updatePreferences } = await import("./sms/registry.js");
        const { requireSignedRequest } = await import("./sms/verify-wallet.js");
        const { checkSmsRateLimit } = await import("./sms/rate-limit.js");
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as {
          address?: string;
          preferences?: Record<string, boolean>;
          message?: string;
          signature?: string;
        };
        const address = body.address?.trim();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          apiV1Json(res, 400, { error: "Invalid or missing address" }, "Invalid or missing address");
          return;
        }
        const message = body.message?.trim();
        const signature = body.signature;
        if (!message || !signature) {
          apiV1Json(res, 400, { error: "Wallet signature required" }, "Wallet signature required to update preferences.");
          return;
        }
        const ip = getClientIp(req);
        const rate = checkSmsRateLimit("preferences", address, ip);
        if (!rate.allowed) {
          res.statusCode = 429;
          apiV1Json(res, 429, { error: "Too many requests", retryAfterSec: rate.retryAfterSec }, "Too many attempts");
          return;
        }
        const auth = await requireSignedRequest(message, signature, "preferences", address);
        if (!auth.ok) {
          apiV1Json(res, 401, { error: auth.error }, auth.error);
          return;
        }
        const p2 = body.preferences || {};
        const prefs: Record<string, boolean> = {};
        if (typeof p2.rebalances === "boolean") prefs.rebalances = p2.rebalances;
        if (typeof p2.warnings === "boolean") prefs.warnings = p2.warnings;
        if (typeof p2.largePriceMoves === "boolean") prefs.largePriceMoves = p2.largePriceMoves;
        if (typeof p2.dailySummary === "boolean") prefs.dailySummary = p2.dailySummary;
        if (typeof p2.testAlerts === "boolean") prefs.testAlerts = p2.testAlerts;
        const updated = await updatePreferences(address, prefs);
        if (!updated) {
          apiV1Json(res, 404, { error: "Address not registered for SMS" }, "Address not registered for SMS");
          return;
        }
        apiV1Json(res, 200, { success: true });
      } catch (e) {
        if (e instanceof SyntaxError) {
          apiV1Json(res, 400, { error: "Invalid JSON" }, "Invalid JSON body");
          return;
        }
        console.error("[server] SMS preferences error", e);
        apiV1Json(res, 500, null, "Failed to update preferences");
      }
      return;
    }

    if (req.method === "POST" && p === "/api/v1/alerts/test") {
      try {
        const { getEntry, recordAlertSent } = await import("./sms/registry.js");
        const { sendAlert } = await import("./sms/twilio-client.js");
        const { getTestMessage } = await import("./sms/templates.js");
        const { requireSignedRequest } = await import("./sms/verify-wallet.js");
        const { checkSmsRateLimit } = await import("./sms/rate-limit.js");
        const raw = await readBody(req);
        const body = JSON.parse(raw || "{}") as { address?: string; message?: string; signature?: string };
        const address = body.address?.trim();
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          apiV1Json(res, 400, { error: "Invalid or missing address" }, "Invalid or missing address");
          return;
        }
        const message = body.message?.trim();
        const signature = body.signature;
        if (!message || !signature) {
          apiV1Json(res, 400, { error: "Wallet signature required" }, "Wallet signature required to send test SMS.");
          return;
        }
        const ip = getClientIp(req);
        const rate = checkSmsRateLimit("test", address, ip);
        if (!rate.allowed) {
          res.statusCode = 429;
          apiV1Json(res, 429, { error: "Too many test SMS requests", retryAfterSec: rate.retryAfterSec }, "Too many attempts");
          return;
        }
        const auth = await requireSignedRequest(message, signature, "test", address);
        if (!auth.ok) {
          apiV1Json(res, 401, { error: auth.error }, auth.error);
          return;
        }
        const entry = await getEntry(address);
        if (!entry) {
          apiV1Json(res, 404, { error: "Address not registered for SMS" }, "Address not registered for SMS");
          return;
        }
        if (!entry.preferences.testAlerts) {
          apiV1Json(res, 400, { error: "Test alerts disabled" }, "Test alerts are disabled in preferences");
          return;
        }
        const result = await sendAlert(entry.phone, getTestMessage());
        if (result.ok) await recordAlertSent(address);
        apiV1Json(res, 200, { success: true, sent: result.ok, error: result.ok ? undefined : result.error });
      } catch (e) {
        if (e instanceof SyntaxError) {
          apiV1Json(res, 400, { error: "Invalid JSON" }, "Invalid JSON body");
          return;
        }
        console.error("[server] SMS test error", e);
        apiV1Json(res, 500, null, "Failed to send test SMS");
      }
      return;
    }

    apiV1Json(res, 404, null, "Not found");
    return;
  }

  if (req.method === "GET" && (url === "/health" || url === "/health/")) {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        status: "ok",
        timestamp: new Date().toISOString(),
        service: "autonomi-backend",
      })
    );
    return;
  }

  if (req.method === "GET" && (url === "/" || url === "")) {
    res.statusCode = 302;
    res.setHeader("Location", "/api/v1/docs");
    res.end();
    return;
  }

  res.statusCode = 404;
  res.end();
  } catch (e) {
    console.error("[server] Request error", parsed.pathname, e);
    if (!res.writableEnded) sendError(500, "Internal server error");
  }
});

server.listen(PORT, () => {
  console.log(`[server] Autonomi backend listening on http://localhost:${PORT}`);
  console.log(`[server] Health check: http://localhost:${PORT}/health`);
  console.log(`[server] Dashboard API: http://localhost:${PORT}/api/dashboard?address=0x...`);
  import("./agent.js").then(({ runAgent }) => {
    const agent = runAgent();
    if (agent) {
      agentRunning = true;
      console.log("[server] Agent running");
    } else
      console.log("[server] Agent not started (set AUTONOMI_ADDRESS and AGENT_PRIVATE_KEY to enable)");
  }).catch((e) => {
    console.error("[server] Failed to load agent:", e);
  });
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[server] Port ${PORT} is in use. Stop the other process or run: PORT=${PORT + 1} npm run dev:server`
    );
  } else {
    console.error("[server]", err);
  }
  process.exit(1);
});

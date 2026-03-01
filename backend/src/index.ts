import "dotenv/config.js";
import { createServer } from "node:http";
console.log("[server] Index loaded, creating HTTP server...");

const PORT = Number(process.env["PORT"] ?? 3000);
const DEFAULT_DASHBOARD_ADDRESS = (process.env["WATCH_ADDRESSES"]?.split(",")[0]?.trim() ||
  process.env["AUTONOMI_DEFAULT_VIEWER"] ||
  "0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515") as `0x${string}`;

function sendJson(res: import("node:http").ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function setCors(res: import("node:http").ServerResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
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
  if (req.method === "OPTIONS" && (parsed.pathname === "/api/dashboard" || parsed.pathname === "/api/sms/register" || parsed.pathname === "/api/sms/status")) {
    setCors(res);
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/dashboard") {
    setCors(res);
    const address = (parsed.searchParams.get("address") || DEFAULT_DASHBOARD_ADDRESS).trim() as `0x${string}`;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      sendJson(res, 400, { error: "Invalid or missing address" });
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

  if (req.method === "GET" && parsed.pathname === "/api/sms/status") {
    const address = parsed.searchParams.get("address")?.trim();
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      setCors(res);
      sendJson(res, 400, { error: "Invalid or missing address" });
      return;
    }
    setCors(res);
    try {
      const { isRegistered, getMaskedPhone } = await import("./sms/registry.js");
      const registered = await isRegistered(address);
      const maskedPhone = registered ? await getMaskedPhone(address) : null;
      sendJson(res, 200, { registered, maskedPhone });
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
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}") as { address?: string; phone?: string };
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
      await registerSms(address, phone);
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
    if (!agent)
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

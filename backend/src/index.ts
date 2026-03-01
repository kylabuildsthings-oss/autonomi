import "dotenv/config.js";
import { createServer } from "node:http";
import { runAgent } from "./agent.js";
import { getDashboardData } from "./dashboard-api.js";

const PORT = Number(process.env["PORT"] ?? 3000);
const DEFAULT_DASHBOARD_ADDRESS = (process.env["WATCH_ADDRESSES"]?.split(",")[0]?.trim() ||
  process.env["AUTONOMI_DEFAULT_VIEWER"] ||
  "0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515") as `0x${string}`;

function sendJson(res: import("node:http").ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

const server = createServer(async (req, res) => {
  const url = req.url ?? "/";
  const parsed = new URL(url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS" && parsed.pathname === "/api/dashboard") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === "GET" && parsed.pathname === "/api/dashboard") {
    const address = (parsed.searchParams.get("address") || DEFAULT_DASHBOARD_ADDRESS).trim() as `0x${string}`;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      sendJson(res, 400, { error: "Invalid or missing address" });
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    try {
      const data = await getDashboardData(address);
      sendJson(res, 200, data);
    } catch (e) {
      console.error("[server] Dashboard API error", e);
      sendJson(res, 500, { error: "Failed to fetch contract data" });
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
});

server.listen(PORT, () => {
  console.log(`[server] Autonomi backend listening on http://localhost:${PORT}`);
  console.log(`[server] Health check: http://localhost:${PORT}/health`);
  console.log(`[server] Dashboard API: http://localhost:${PORT}/api/dashboard?address=0x...`);
  const agent = runAgent();
  if (!agent)
    console.log("[server] Agent not started (set AUTONOMI_ADDRESS and AGENT_PRIVATE_KEY to enable)");
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `[server] Port ${PORT} is in use. Stop the other process or run: PORT=${PORT + 1} npm run dev`
    );
  } else {
    console.error("[server]", err);
  }
  process.exit(1);
});

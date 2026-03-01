#!/usr/bin/env node
/**
 * Quick API smoke test. Run with backend server up:
 *   cd backend && npm run dev:server
 *   node scripts/test-api.mjs
 * Or: BASE_URL=http://localhost:3000 node scripts/test-api.mjs
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";

async function req(method, path, body) {
  const url = path.startsWith("http") ? path : BASE + path;
  const opt = { method, headers: { "Content-Type": "application/json" } };
  if (body) opt.body = JSON.stringify(body);
  const res = await fetch(url, opt);
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function main() {
  const results = [];
  const ok = (name, r) => {
    const pass = r.status >= 200 && r.status < 300;
    results.push({ name, pass, status: r.status });
    console.log(pass ? "✓" : "✗", name, r.status, pass ? "" : String(r.data).slice(0, 80));
  };

  console.log("Testing API at", BASE, "\n");

  let r = await req("GET", "/api/v1/health");
  ok("GET /api/v1/health", r);

  r = await req("GET", "/api/v1/market");
  ok("GET /api/v1/market", r);

  r = await req("GET", "/api/v1/agent");
  ok("GET /api/v1/agent", r);

  r = await req("GET", "/api/v1/positions/0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515");
  ok("GET /api/v1/positions/:address", r);

  r = await req("POST", "/api/v1/auth/keys", {
    user_address: "0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515",
    name: "test-key",
    rate_limit: 100,
  });
  ok("POST /api/v1/auth/keys (create)", r);
  const rawKey = r.data?.data?.rawKey || r.data?.rawKey;

  if (rawKey) {
    const meRes = await fetch(BASE + "/api/v1/auth/me", {
      headers: { Authorization: "Bearer " + rawKey },
    });
    const meText = await meRes.text();
    let meData;
    try {
      meData = JSON.parse(meText);
    } catch {
      meData = meText;
    }
    ok("GET /api/v1/auth/me (Bearer)", { status: meRes.status, data: meData });

    const whRes = await fetch(BASE + "/api/v1/webhooks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + rawKey,
      },
      body: JSON.stringify({ url: "https://example.com/webhook", events: ["rebalance", "warning"] }),
    });
    const whText = await whRes.text();
    let whData;
    try {
      whData = JSON.parse(whText);
    } catch {
      whData = whText;
    }
    ok("POST /api/v1/webhooks", { status: whRes.status, data: whData });
  }

  r = await req("GET", "/api/v1/auth/keys?address=0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515");
  ok("GET /api/v1/auth/keys?address=...", r);

  const failed = results.filter((x) => !x.pass);
  console.log("\n" + results.length + " tests,", failed.length, "failed");
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

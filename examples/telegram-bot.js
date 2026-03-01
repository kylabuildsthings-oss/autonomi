/**
 * Example: Telegram bot that forwards Autonomi alerts
 *
 * Users send /start to subscribe; the bot registers a webhook per chat so
 * rebalance and warning events are forwarded to that Telegram chat.
 *
 * Run:
 *   npm install node-telegram-bot-api   # from repo root or examples/
 *   export TELEGRAM_BOT_TOKEN=your_bot_token
 *   export AUTONOMI_API_KEY=ak_xxx
 *   export WEBHOOK_PUBLIC_URL=https://your-ngrok-or-domain.com
 *   node examples/telegram-bot.js
 *
 * WEBHOOK_PUBLIC_URL must be reachable by the Autonomi backend (e.g. ngrok http 9090).
 */

const http = require("http");
const url = require("url");

const BASE_URL = process.env.AUTONOMI_API_URL || "http://localhost:3000";
const API_KEY = process.env.AUTONOMI_API_KEY || "";
const WEBHOOK_PUBLIC_URL = (process.env.WEBHOOK_PUBLIC_URL || "").replace(/\/$/, "");
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const PORT = Number(process.env.PORT) || 9090;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("Set TELEGRAM_BOT_TOKEN (from @BotFather)");
  process.exit(1);
}
if (!API_KEY) {
  console.error("Set AUTONOMI_API_KEY to register webhooks");
  process.exit(1);
}
if (!WEBHOOK_PUBLIC_URL || !WEBHOOK_PUBLIC_URL.startsWith("http")) {
  console.error("Set WEBHOOK_PUBLIC_URL to a public URL (e.g. https://xxx.ngrok.io) so the backend can POST to this bot");
  process.exit(1);
}

const TelegramBot = require("node-telegram-bot-api");
const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });

async function registerWebhook(webhookUrl, events) {
  const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/api/v1/webhooks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ url: webhookUrl, events }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || res.statusText);
  return json;
}

function formatAlert(payload) {
  const { event, timestamp, data } = payload;
  const t = new Date(timestamp).toLocaleString();
  if (event === "rebalance") {
    return `🔄 Rebalance\n${t}\nUser: ${data.user}\nLTV: ${(data.oldLTVBps / 100).toFixed(1)}% → ${(data.newLTVBps / 100).toFixed(1)}%\nBorrowed: ${data.borrowed} USDC\nTx: ${data.txHash}`;
  }
  if (event === "warning") {
    return `⚠️ Warning\n${t}\nUser: ${data.user}\nLTV: ${(data.ltvBps / 100).toFixed(1)}%\nPrice: ${data.price}`;
  }
  if (event === "price") {
    return `📊 Price\n${t}\n${data.oldPrice} → ${data.newPrice} (${data.changePct}% ${data.direction})`;
  }
  return `🔔 ${event}\n${t}\n${JSON.stringify(data)}`;
}

// /start — register webhook for this chat and confirm
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const webhookUrl = `${WEBHOOK_PUBLIC_URL}/webhook/${chatId}`;
  try {
    await registerWebhook(webhookUrl, ["rebalance", "warning"]);
    await bot.sendMessage(chatId, "🔔 Autonomi alerts activated!");
  } catch (e) {
    await bot.sendMessage(chatId, `Failed to register: ${e.message}`);
  }
});

// HTTP server: receive Autonomi webhook POSTs and forward to Telegram
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url || "", true);
  const path = parsed.pathname || "";
  const match = path.match(/^\/webhook\/(\-?\d+)$/);
  if (req.method !== "POST" || !match) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }
  const chatId = match[1];
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const payload = JSON.parse(body);
    const text = formatAlert(payload);
    await bot.sendMessage(chatId, text);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  } catch (e) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log(`Telegram bot running. Webhook receiver: ${WEBHOOK_PUBLIC_URL}/webhook/:chatId (port ${PORT})`);
});

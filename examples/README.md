# Autonomi API — Example Use Cases

## Use Case 1: DeFi Dashboard Integration

A DeFi dashboard integrates Autonomi to show protection status (LTV, whether the position is protected, agent status). The dashboard polls the API periodically and updates the UI.

**Run:**

```bash
# From repo root; ensure the backend is running (e.g. npm run dev:server in backend/)
export USER_ADDRESS=0xYourWalletAddress   # optional, default is example address
export AUTONOMI_API_URL=http://localhost:3000
export AUTONOMI_API_KEY=ak_xxx             # optional, for auth-only endpoints
node examples/defi-dashboard.js
```

**Snippet (integrate into your app):**

```javascript
const autonomi = new Autonomi(API_KEY);

// Show protection status on your interface
setInterval(async () => {
  const pos = await autonomi.getDashboardState(userAddress);
  updateUI({
    ltv: pos.ltv.current,
    protected: pos.summary.totalProtected > 0,
    lastAction: pos.agent.lastRebalance ?? (pos.agent.running ? "Agent active" : "—"),
    hasPosition: pos.summary.hasPosition,
    usycDeposited: pos.summary.usycDeposited,
    usdcBorrowed: pos.summary.usdcBorrowed,
    agentRunning: pos.agent.running,
  });
}, 60000);
```

**API used:**

- `GET /api/v1/positions/:address` — position and LTV
- `GET /api/v1/agent` — agent running and watched count

`Autonomi` in `defi-dashboard.js` maps the API response to a dashboard-friendly shape (`ltv.current`, `summary.totalProtected`, `agent.lastRebalance` / `agent.running`). The API does not store last rebalance time; use agent status for "Agent active" or similar.

---

## Use Case 2: Trading Bot Integration

A Python trading bot uses Autonomi for risk management: when the agent rebalances a position, the bot receives a webhook and can adjust strategy.

**Run:**

```bash
pip install httpx
export AUTONOMI_API_KEY=ak_xxx
export WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io
python examples/trading-bot.py
```

**Snippet:**

```python
# Python trading bot uses Autonomi for risk management
# See examples/trading-bot.py for the Autonomi class; run it or copy the class into your project.
client = Autonomi("ak_xxx")

@client.on_rebalance
def handle_rebalance(data):
    print(f"Position rebalanced: {data['borrowed']} USDC")
    adjust_strategy(data["newLTV"])

def adjust_strategy(new_ltv):
    pass  # your risk logic

client.run_webhook_server(port=9090)
```

Set **WEBHOOK_BASE_URL** to a public URL (e.g. `ngrok http 9090`) so the backend can POST to your server. **API:** `POST /api/v1/webhooks` to register; backend sends `{ event, timestamp, data }` when a rebalance occurs. Handler receives `newLTV`, `oldLTV`, `txHash`, `user`, `borrowed` (API does not return a separate "repaid" amount).

---

## Use Case 3: SMS/Telegram Bot

A Telegram bot forwards Autonomi alerts to users. When a user sends `/start`, the bot registers a webhook for that chat; when the Autonomi backend fires a rebalance or warning event, it POSTs to the bot’s webhook URL and the bot forwards the message to the right Telegram chat.

**Run:**

```bash
npm install node-telegram-bot-api
export TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
export AUTONOMI_API_KEY=ak_xxx
export WEBHOOK_PUBLIC_URL=https://your-ngrok-or-domain.com
node examples/telegram-bot.js
```

Set **WEBHOOK_PUBLIC_URL** to a public URL (e.g. `ngrok http 9090`) so the Autonomi backend can POST to your server. The bot listens for Telegram updates (polling) and runs an HTTP server to receive webhook payloads at `/webhook/:chatId`.

**Snippet (matches the example in `examples/telegram-bot.js`):**

```javascript
// A Telegram bot that forwards alerts
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  await registerWebhook({
    url: `https://mybot.com/webhook/${chatId}`,
    events: ['rebalance', 'warning']
  })
  bot.sendMessage(chatId, '🔔 Autonomi alerts activated!')
})
```

**API used:** `POST /api/v1/webhooks` with `{ url, events }`. Backend sends `{ event, timestamp, data }` to the registered URL; the example formats rebalance/warning/price and sends them to Telegram.

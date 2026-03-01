# Autonomi Backend

Node.js/TypeScript **agent** and **dashboard API** for [Autonomi](https://github.com/kylabuildsthings-oss/autonomi) on Arc Testnet.

For full setup (contracts, env, deploy), see the [root README](../README.md).

## Quick start

```bash
npm install
cp .env.example .env
# Edit .env: AUTONOMI_ADDRESS, AGENT_PRIVATE_KEY (or PRIVATE_KEY)
npm run dev
```

The agent runs every 5 minutes; if LTV ≥ 65% it calls `autoRebalance(user, 6000)`. Authorize the agent wallet on-chain once: `cast send $AUTONOMI_ADDRESS "authorizeAgent(address)" <AGENT_ADDRESS> --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY`.

## Scripts

| Command           | Description                    |
|-------------------|--------------------------------|
| `npm run dev`     | Run server + agent (tsx watch) |
| `npm run build`   | Compile to `dist/`             |
| `npm start`       | Run `dist/bootstrap.js`       |
| `npm run db:init` | Create SQLite DB and apply schema |
| `npm run test:agent` | Test contract reads         |

## Env

- `ARC_RPC_URL` / `ARC_TESTNET_RPC_URL` — Arc Testnet RPC
- `AUTONOMI_ADDRESS` — Deployed Autonomi contract
- `AGENT_PRIVATE_KEY` or `PRIVATE_KEY` — Wallet authorized to call `autoRebalance`
- `PORT` — Default 3000
- Optional: `WATCH_ADDRESSES`, `SIMULATE_USYC_PRICE`, Circle API keys

## Database (API keys & webhooks)

SQLite (default) and PostgreSQL schemas for API keys, webhooks, and webhook delivery logging live in `backend/db/`.

**Tables**

- **api_keys** — `id`, `name`, `key_hash`, `user_address`, `permissions`, `rate_limit`, `created_at`, `last_used`, `expires_at`
- **webhooks** — `id`, `api_key_id`, `url`, `events` (JSON array, e.g. `['rebalance','warning','price']`), `secret`, `active`, `created_at`
- **webhook_deliveries** — `id`, `webhook_id`, `event`, `payload`, `response_code`, `success`, `attempted_at`

**SQLite (default)**  
The app uses SQLite at `backend/data/autonomi.db`. Schema is applied automatically on first use when you call `getDb()` from `src/db/index.ts`. To create the DB and tables manually:

```bash
cd backend && npm run db:init
```

Schema file: `db/schema.sqlite.sql`.

**PostgreSQL**  
Use `db/schema.postgres.sql` (native `BOOLEAN` types). Run against your database, e.g.:

```bash
psql "$DATABASE_URL" -f backend/db/schema.postgres.sql
```

A single reference schema is in `db/schema.sql` (PostgreSQL-style; for SQLite use `schema.sqlite.sql`).

## SMS rebalance alerts

When the agent runs a rebalance for a user, it can send an SMS if that user has registered a phone number.

**1. Get Twilio credentials** — Sign up at [twilio.com](https://www.twilio.com). In the Console: copy **Account SID** and **Auth Token**; get a **Phone Number** (Phone Numbers → Buy a number). Trial accounts can only send to verified numbers until you upgrade.

**2. Configure backend** — Add to `backend/.env`:

```env
TWILIO_ACCOUNT_SID="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
TWILIO_AUTH_TOKEN="your_auth_token"
TWILIO_PHONE_NUMBER="+15551234567"
```

Use E.164 format for the number (`+` then country code and digits).

**3. Register from the dashboard** — Start the backend (`npm run dev:server`), open the dashboard (e.g. `http://localhost:8787/dashboard.html?api=http://localhost:3000`). In the **SMS Alerts** card, enter your phone (e.g. `+15551234567`) and click **Register for rebalance alerts**. Registrations are stored in `backend/data/sms-registry.json`. When the agent runs `autoRebalance` for that address, it sends an SMS via Twilio using varied templates (rebalance, warnings, price moves, daily summary). See `backend/src/sms/templates.ts` for message templates.

If Twilio env vars are not set, the backend still runs; the agent skips SMS and logs a one-line warning on rebalance.

**Remove "Sent from Twilio trial account"** — That suffix is added by Twilio for trial accounts. To remove it: Twilio Console → Phone Numbers → your number → ensure Messaging is enabled; add funds (min $20); the trial message disappears within 24 hours after upgrading to production.

## REST API v1 (external integrations)

The **v1 API** provides a stable, versioned REST surface for external applications (wallets, dashboards, bots) to integrate autonomous lending protection. All responses use a consistent envelope: `{ success, data?, error?, meta: { version, timestamp } }`.

**Base URL:** `http://localhost:3000/api/v1` (or your deployed host). **Interactive docs:** [http://localhost:3000/api/v1/docs](http://localhost:3000/api/v1/docs) (Swagger UI). **OpenAPI 3.0 spec:** [http://localhost:3000/api/v1/openapi.json](http://localhost:3000/api/v1/openapi.json).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/health` | Service health, version, contract, chain |
| GET | `/api/v1/market` | USYC price, contract address, chain id/name |
| GET | `/api/v1/positions/:address` | Single position + USYC price for one wallet |
| GET | `/api/v1/positions?addresses=0x...,0x...` | Batch positions (max 20 addresses) |
| GET | `/api/v1/agent` | Agent status: `running`, `contractAddress`, `watchedAddressesCount` |
| GET | `/api/v1/monitoring/health` | Deep health: DB + RPC checks (200 ok, 503 degraded) |
| GET | `/api/v1/monitoring/ready` | Readiness probe for k8s (200 ready, 503 not ready) |
| GET | `/api/v1/monitoring/status` | Aggregate: checks + agent + version + contract + chain |
| GET | `/api/v1/analytics/overview` | Counts: API keys, webhooks, deliveries, SMS regs, agent |
| GET | `/api/v1/analytics/webhooks?hours=24` | Webhook delivery stats by event and recent window |
| GET | `/api/v1/analytics/usage?days=7` | API key usage: total and with recent use |
| GET | `/api/v1/alerts/status?address=0x...` | SMS registration and preferences |
| POST | `/api/v1/alerts/register` | Register phone (body: `{ address, phone, preferences? }`) |
| POST | `/api/v1/alerts/preferences` | Update SMS preferences (body: `{ address, preferences }`) |
| POST | `/api/v1/alerts/test` | Send test SMS (body: `{ address }`) |
| GET | `/api/v1/openapi.json` | OpenAPI 3.0 spec for code generation and docs |
| GET | `/api/v1/docs` | Interactive API docs (Swagger UI) |

**Authentication (API keys)** — Keys are stored by hash in the database; the raw key is returned only on create. **Rate limiting:** Authenticated requests (Bearer) are limited per key by the key's `rate_limit` (requests per minute). When exceeded, the API returns `429 Too Many Requests` with `Retry-After: 60`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/auth/me` | Current key identity (header: `Authorization: Bearer <api_key>`) |
| POST | `/api/v1/auth/keys` | Create API key (body: `{ user_address, name?, permissions?, rate_limit?, expires_at? }`) |
| GET | `/api/v1/auth/keys?address=0x...` | List API keys for a wallet |
| DELETE | `/api/v1/auth/keys/:id?address=0x...` | Revoke an API key (address must own the key) |

**Webhooks** — All webhook endpoints require `Authorization: Bearer <api_key>`. Events: `rebalance`, `warning`, `price`. Secret is returned only on create. **Delivery:** Each webhook is tried up to 3 times with 1s/2s backoff; each attempt is logged in `webhook_deliveries`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/webhooks` | Create webhook (body: `{ url, events[], secret? }`) |
| GET | `/api/v1/webhooks` | List webhooks for current API key |
| GET | `/api/v1/webhooks/:id` | Get one webhook |
| PATCH | `/api/v1/webhooks/:id` | Update url, events, or active |
| DELETE | `/api/v1/webhooks/:id` | Delete webhook |
| GET | `/api/v1/webhooks/:id/deliveries?limit=50` | List recent delivery attempts |

When events occur, Autonomi **POSTs** to each registered webhook URL (for the event type). All payloads use this envelope:

```json
{ "event": "<rebalance|warning|price>", "timestamp": "<ISO8601>", "data": { ... } }
```

**Headers:** `Content-Type: application/json`, `User-Agent: Autonomi-Webhook/1.0`, `X-Webhook-Event`, `X-Webhook-ID`. If the webhook has a secret, `X-Webhook-Signature: sha256=<hmac_hex>` is included so you can verify the body (HMAC-SHA256 of raw body with your secret).

| Event | When | `data` shape |
|-------|------|--------------|
| **rebalance** | Agent called `autoRebalance` for a user | `user`, `txHash`, `oldLTVBps`, `newLTVBps`, `collateral`, `borrowed`, `price`, `contractAddress`, `chainId` |
| **warning** | LTV exceeded threshold (e.g. ≥65%) before rebalance | `user`, `ltvBps`, `price`, `contractAddress`, `chainId` |
| **price** | USYC price moved >10% vs previous check | `oldPrice`, `newPrice`, `changePct`, `direction` (up/down), `contractAddress`, `chainId` |

Deliveries are logged in `webhook_deliveries`; use **GET /api/v1/webhooks/:id/deliveries** to inspect success/failure and response codes.

**Analytics** — Aggregate stats for dashboards and ops.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/analytics/overview` | API keys count, webhooks (total/active), delivery totals, SMS registrations, agent state |
| GET | `/api/v1/analytics/webhooks?hours=24` | Delivery counts by event (rebalance, warning, price), success/failed, recent window |
| GET | `/api/v1/analytics/usage?days=7` | API keys total and count used in last N days |

**Example — get position:**

```bash
curl -s "http://localhost:3000/api/v1/positions/0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515"
```

**Example — get positions (batch, up to 20 addresses):**

```bash
curl -s "http://localhost:3000/api/v1/positions?addresses=0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515,0x0000000000000000000000000000000000000001"
```

Response: `{ "success": true, "data": { "usycPrice": "...", "positions": [ { "address": "0x...", "position": { "usycDeposited", "usdcBorrowed", "ltvBps", "active" } }, ... ] } }`.

**Example — agent status:**

```bash
curl -s "http://localhost:3000/api/v1/agent"
```

**Example — create API key (store `rawKey` securely; it is not returned again):**

```bash
curl -s -X POST "http://localhost:3000/api/v1/auth/keys" \
  -H "Content-Type: application/json" \
  -d '{"user_address":"0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515","name":"My App"}'
```

**Example — validate key (GET /api/v1/auth/me):**

```bash
curl -s "http://localhost:3000/api/v1/auth/me" -H "Authorization: Bearer ak_<your_key>"
```

**Example — create webhook (store `secret` if you need to verify payloads):**

```bash
curl -s -X POST "http://localhost:3000/api/v1/webhooks" \
  -H "Authorization: Bearer ak_<your_key>" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/webhook","events":["rebalance","warning"]}'
```

**CORS:** All `/api/v1` routes allow `*` origin. For production, put the API behind your own gateway and restrict origins or use API keys.

**Monitoring** — Use `/api/v1/monitoring/health` for deep health (DB + RPC), `/api/v1/monitoring/ready` for Kubernetes readiness, and `/api/v1/monitoring/status` for a single aggregate view (checks + agent + version).

**Legacy (unchanged):** `GET /api/dashboard?address=0x...`, `GET/POST /api/sms/*`, `GET /health` remain available for backward compatibility.

## Example use cases

See **[examples/](../examples/)** in the repo. **Use case 1: DeFi dashboard integration** — poll `GET /api/v1/positions/:address` and `GET /api/v1/agent` to show LTV, protection status, and agent state in your UI. Run: `USER_ADDRESS=0x... node examples/defi-dashboard.js`. **Use case 2: Trading bot integration** — register a webhook with `POST /api/v1/webhooks` and run the Python script in `examples/trading-bot.py`; when the agent rebalances, your handler receives `newLTV`, `oldLTV`, `txHash`, and can adjust strategy. **Use case 3: SMS/Telegram bot** — run `examples/telegram-bot.js`; users send `/start` to subscribe, and the bot forwards rebalance/warning alerts to each chat via a per-chat webhook URL.

## Phase 9: Implementation steps (status)

| Step | Status | Notes |
|------|--------|--------|
| Set up database (SQLite/PostgreSQL) | Done | SQLite default (`data/autonomi.db`), schema auto-applied; PostgreSQL schema in `db/schema.postgres.sql` (run manually) |
| API key authentication middleware | Done | Bearer token via `Authorization`; `validateKey` + `getBearerToken` on webhook and auth routes |
| Rate limiting by key tier | Done | In-memory 1-min window per key; `rate_limit` column = requests/min; 429 + `Retry-After: 60` when exceeded |
| Webhook delivery with retries | Done | Up to 3 attempts per webhook with 1s/2s backoff; each attempt recorded in `webhook_deliveries` |
| SDKs (JS, Python, etc.) | Done | TypeScript client (generated), Python client in `sdk/`; see [sdk/README.md](../sdk/README.md) |
| OpenAPI docs with examples | Done | `GET /api/v1/openapi.json`, `GET /api/v1/docs` (Swagger UI); examples in spec |
| Monitoring for API usage | Done | `GET /api/v1/analytics/overview`, `analytics/webhooks`, `analytics/usage`; `last_used` on keys |
| Developer dashboard for key management | Done | [web/developers.html](../web/developers.html): create key, list by address, revoke; link from landing and docs |

## Client SDKs

Generated and hand-written clients live in the repo under **`sdk/`**. See [sdk/README.md](../sdk/README.md) for TypeScript and Python.

- **Export OpenAPI spec:** `npm run sdk:spec` (writes `openapi.json` after build).
- **Regenerate TypeScript client:** `npm run sdk:ts` (uses [@hey-api/openapi-ts](https://github.com/hey-api/openapi-ts)).

## API (legacy)

- **GET /api/dashboard?address=0x...** — Returns `{ usycPrice, position, address }` for the given address (read-only from contract).

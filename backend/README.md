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
| `npm start`       | Run `dist/index.js`            |
| `npm run test:agent` | Test contract reads         |

## Env

- `ARC_RPC_URL` / `ARC_TESTNET_RPC_URL` — Arc Testnet RPC
- `AUTONOMI_ADDRESS` — Deployed Autonomi contract
- `AGENT_PRIVATE_KEY` or `PRIVATE_KEY` — Wallet authorized to call `autoRebalance`
- `PORT` — Default 3000
- Optional: `WATCH_ADDRESSES`, `SIMULATE_USYC_PRICE`, Circle API keys

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

**3. Register from the dashboard** — Start the backend (`npm run dev:server`), open the dashboard (e.g. `http://localhost:8787/dashboard.html?api=http://localhost:3000`). In the **SMS Alerts** card, enter your phone (e.g. `+15551234567`) and click **Register for rebalance alerts**. Registrations are stored in `backend/data/sms-registry.json`. When the agent runs `autoRebalance` for that address, it sends an SMS via Twilio (e.g. *"Autonomi: Your position was rebalanced to 60% LTV. Tx: 0x..."*).

If Twilio env vars are not set, the backend still runs; the agent skips SMS and logs a one-line warning on rebalance.

## API

- **GET /api/dashboard?address=0x...** — Returns `{ usycPrice, position }` for the given address (read-only from contract).

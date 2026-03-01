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

## API

- **GET /api/dashboard?address=0x...** — Returns `{ usycPrice, position }` for the given address (read-only from contract).

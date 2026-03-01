# Autonomi — Architecture overview

High-level layout for [Autonomi](https://github.com/kylabuildsthings-oss/autonomi). For setup and commands, see the [root README](../README.md).

## Stack

| Layer    | Tech              | Role |
|----------|-------------------|------|
| Contracts| Solidity, Foundry | Autonomi.sol: USYC collateral, USDC borrows, LTV band (55–65%), `autoRebalance` (agent-only) |
| Backend  | Node.js, TypeScript, viem | Cron agent (every 5 min), monitors LTV; calls `autoRebalance` when ≥65%. HTTP API for dashboard. |
| Web      | Static HTML/CSS/JS, Tailwind CDN | Landing, dashboard (live data), strategy, docs, app pages (Sandy Pixel–DeFi UI) |

## Data flow

1. **User** deploys Autonomi, deposits USYC, borrows USDC; authorizes agent wallet via `authorizeAgent(address)`.
2. **Agent** (backend) reads positions from chain; if LTV ≥ 65%, sends `autoRebalance(user, 6000)` (target 60%).
3. **Dashboard** (web) calls `GET /api/dashboard?address=0x...`; backend reads from contract and returns USYC price and position; front end renders LTV gauge and stats.

## Repo layout

- `contracts/src/` — Autonomi, mocks (MockTeller, MockUSYC), HelloArchitect
- `script/` — Deploy scripts (permissioned and mock-collateral)
- `test/` — Foundry tests
- `backend/src/` — Agent, dashboard API, bootstrap
- `web/` — Static site (no bundler)

## Env

- **Root `.env`**: `ARC_TESTNET_RPC_URL`, `PRIVATE_KEY`, `AUTONOMI_ADDRESS` (and mock addresses if used).
- **Backend `.env`**: `AUTONOMI_ADDRESS`, `AGENT_PRIVATE_KEY` (or `PRIVATE_KEY`), optional `WATCH_ADDRESSES`, `PORT`.

Never commit `.env` or `backend/.env`; use `.env.example` as a template.

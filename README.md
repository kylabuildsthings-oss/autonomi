# Autonomi

Autonomi is an autonomous lending agent on [Arc](https://docs.arc.network) that transforms tokenized Treasury bills (USYC) into dynamic, self-managing credit lines.

- **Smart contracts** (Solidity, Foundry): collateralised borrowing, LTV monitoring, agent-triggered rebalancing.
- **Backend** (Node.js/TypeScript): agent that monitors positions and calls `autoRebalance` when LTV exceeds a threshold; HTTP API for the dashboard.
- **Web** (static): landing page, dashboard (live data), strategy, docs, and app UI (Sandy Pixel–DeFi design).

---

## Repository structure

```
autonomi/
├── contracts/src/     # Solidity (Autonomi, mocks, HelloArchitect)
├── script/            # Foundry deploy scripts
├── test/              # Foundry tests
├── backend/           # Node.js agent + dashboard API
├── web/               # Static site (landing, dashboard, docs)
├── foundry.toml       # Foundry config (src = contracts/src)
├── .env.example       # Root env template (RPC, keys, contract addresses)
└── README.md          # This file
```

---

## Prerequisites

- **Foundry**: [install](https://book.getfoundry.sh/getting-started/installation) then `foundryup`
- **Node.js 18 or 20** (for backend); recommend [nvm](https://github.com/nvm-sh/nvm) or [nodejs.org](https://nodejs.org/) LTS
- **Arc Testnet** deployer wallet with testnet ETH; [Circle Faucet](https://faucet.circle.com) for testnet USDC

---

## Setup

### 1. Clone and env

```bash
git clone https://github.com/kylabuildsthings-oss/autonomi.git
cd autonomi
cp .env.example .env
```

Edit `.env` and set at least:

- `ARC_TESTNET_RPC_URL` — e.g. `https://rpc.testnet.arc.network`
- `PRIVATE_KEY` — deployer wallet (for deploying and, if you wish, as agent)

### 2. Contracts (Foundry)

```bash
forge build
forge test
```

Sources live in `contracts/src/` (see `foundry.toml`). Deploy with:

```bash
source .env
# Permissioned USYC (main)
forge script script/Deploy.s.sol --rpc-url "$ARC_TESTNET_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --legacy

# Or with mock collateral (testing deposit/borrow/rebalance)
forge script script/DeployWithMockCollateral.s.sol --rpc-url "$ARC_TESTNET_RPC_URL" --private-key "$PRIVATE_KEY" --broadcast --legacy
```

Save the deployed **Autonomi** address in `.env` as `AUTONOMI_ADDRESS=0x...` and, if you use mocks, the mock addresses too.

### 3. Backend (agent + API)

```bash
cd backend
cp .env.example .env
npm install
```

In `backend/.env` set:

- `AUTONOMI_ADDRESS` — same as in root `.env`
- `AGENT_PRIVATE_KEY` or `PRIVATE_KEY` — key of the wallet that may call `autoRebalance` (same as deployer is fine)

Authorize the agent on-chain (once, as contract owner):

```bash
# From repo root
source .env
cast send $AUTONOMI_ADDRESS "authorizeAgent(address)" <YOUR_DEPLOYER_ADDRESS> \
  --rpc-url "$ARC_TESTNET_RPC_URL" --private-key "$PRIVATE_KEY"
```

Then:

```bash
npm run dev
```

API: `GET /api/dashboard?address=0x...` returns USYC price and position (collateral, loan, LTV). CORS enabled for the web app.

### 4. Web (landing + dashboard)

Static files in `web/`. No build step.

```bash
# From repo root
python3 -m http.server 8080 --directory web
# Or: npx serve web -p 8080
```

Open http://localhost:8080 (landing) and http://localhost:8080/dashboard.html (dashboard). For live data, run the backend on port 3000; the dashboard calls `http://localhost:3000/api/dashboard`.

See `web/README.md` for design tokens and page overview.

---

## Commands reference

| Where   | Command              | Description                    |
|---------|----------------------|--------------------------------|
| Root    | `forge build`        | Compile contracts              |
| Root    | `forge test`         | Run contract tests             |
| Root    | `forge fmt`          | Format Solidity                |
| Backend | `npm run dev`        | Run agent + API (watch)        |
| Backend | `npm run build`      | Compile TypeScript to `dist/`  |
| Backend | `npm run test:agent` | Test contract reads            |

---

## Push to GitHub

If you haven’t linked this repo to the remote:

```bash
git remote add origin https://github.com/kylabuildsthings-oss/autonomi.git
```

Ensure `.env` and `backend/.env` are **not** committed (they’re in `.gitignore`). Then:

```bash
git add .
git status   # double-check no secrets
git commit -m "Clean up structure, docs, and push to GitHub"
git branch -M main
git push -u origin main
```

---

## Resources

- [Arc documentation](https://docs.arc.network)
- [Circle Faucet](https://faucet.circle.com) (Arc Testnet)
- [Arc testnet explorer](https://testnet.arcscan.app)

---

*Built on Arc • Powered by Circle • Guarded by Stork*

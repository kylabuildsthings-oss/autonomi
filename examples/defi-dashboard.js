/**
 * Example: DeFi Dashboard Integration
 *
 * A DeFi dashboard integrates Autonomi to show protection status.
 * Run: node examples/defi-dashboard.js
 * Requires: API base URL (default http://localhost:3000), optional API_KEY for authenticated endpoints.
 *
 * API response shape:
 *   GET /api/v1/positions/:address → { success, data: { address, usycPrice, position: { ltvBps, active, ... } } }
 *   GET /api/v1/agent → { success, data: { running, watchedAddressesCount } }
 */

const BASE_URL = process.env.AUTONOMI_API_URL || "http://localhost:3000";
const API_KEY = process.env.AUTONOMI_API_KEY || "";
const LTV_REBALANCE_THRESHOLD_BPS = 6500; // 65% — agent rebalances above this

class Autonomi {
  constructor(apiKey = "") {
    this.apiKey = apiKey;
    this.baseUrl = BASE_URL.replace(/\/$/, "");
  }

  async _request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const headers = { "Content-Type": "application/json", ...options.headers };
    if (this.apiKey) headers["Authorization"] = `Bearer ${this.apiKey}`;
    const res = await fetch(url, { ...options, headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || res.statusText);
    return json.data;
  }

  /** GET /api/v1/positions/:address */
  async getPosition(userAddress) {
    const data = await this._request(`/api/v1/positions/${userAddress}`);
    const pos = data.position;
    const ltvBps = pos?.ltvBps ?? 0;
    const ltvPercent = ltvBps / 100;
    // Protected = active position and LTV below rebalance threshold (agent will maintain it)
    const protected_ = !!pos?.active && ltvBps < LTV_REBALANCE_THRESHOLD_BPS;
    return {
      address: data.address,
      usycPrice: data.usycPrice,
      position: pos,
      ltv: {
        bps: ltvBps,
        current: ltvPercent,
        threshold: LTV_REBALANCE_THRESHOLD_BPS / 100,
      },
      summary: {
        totalProtected: protected_ ? 1 : 0,
        hasPosition: !!pos?.active,
        usycDeposited: pos?.usycDeposited ?? "0",
        usdcBorrowed: pos?.usdcBorrowed ?? "0",
      },
      agent: {
        // Last rebalance time is not stored in the API; we only have agent status
        lastRebalance: null,
        running: null, // set by refreshAgentStatus()
      },
    };
  }

  /** GET /api/v1/agent */
  async getAgentStatus() {
    const data = await this._request("/api/v1/agent");
    return { running: data.running, watchedAddressesCount: data.watchedAddressesCount };
  }

  /** Fetch position and agent status for dashboard UI */
  async getDashboardState(userAddress) {
    const [positionPayload, agentStatus] = await Promise.all([
      this.getPosition(userAddress),
      this.getAgentStatus(),
    ]);
    positionPayload.agent.running = agentStatus.running;
    return positionPayload;
  }
}

// ——— Example: poll and update UI every 60s ———

const userAddress = process.env.USER_ADDRESS || "0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515";

function updateUI(state) {
  console.log(new Date().toISOString(), "Dashboard state:", {
    ltv: state.ltv.current,
    ltvThreshold: state.ltv.threshold,
    protected: state.summary.totalProtected > 0,
    hasPosition: state.summary.hasPosition,
    usycDeposited: state.summary.usycDeposited,
    usdcBorrowed: state.summary.usdcBorrowed,
    agentRunning: state.agent.running,
    lastAction: state.agent.lastRebalance ?? (state.agent.running ? "Agent active" : "—"),
  });
}

async function main() {
  const autonomi = new Autonomi(API_KEY);

  // Initial fetch
  try {
    const pos = await autonomi.getDashboardState(userAddress);
    updateUI(pos);
  } catch (e) {
    console.error("Initial fetch failed:", e.message);
    process.exitCode = 1;
    return;
  }

  // Poll every 60s (DeFi dashboard integration)
  setInterval(async () => {
    try {
      const pos = await autonomi.getDashboardState(userAddress);
      updateUI(pos);
    } catch (e) {
      console.error("Poll failed:", e.message);
    }
  }, 60000);
}

main();

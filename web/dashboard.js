/**
 * Dashboard — fetch live data from backend API and render
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const API_BASE = params.get("api") || window.AUTONOMI_API_URL || "http://localhost:3000";

  function el(selector) {
    return document.querySelector(selector);
  }

  function formatNumber(s) {
    return Number(s).toLocaleString();
  }

  function renderPrice(price) {
    const oracleEl = document.getElementById("oracle-price");
    if (oracleEl) oracleEl.textContent = "USYC Price: $" + price;
  }

  function renderPosition(position, noWallet) {
    const card = document.getElementById("position-card");
    const empty = document.getElementById("position-empty");
    const emptyMsg = document.getElementById("position-empty-message");
    const content = document.getElementById("position-content");
    if (!card) return;

    if (noWallet) {
      if (empty) {
        empty.hidden = false;
        if (emptyMsg) emptyMsg.textContent = "Connect your wallet to view your position and use the app.";
      }
      if (content) content.hidden = true;
      return;
    }

    if (!position || !position.active) {
      if (empty) {
        empty.hidden = false;
        if (emptyMsg) emptyMsg.textContent = "No active position. Deposit USYC and borrow USDC to get started.";
      }
      if (content) content.hidden = true;
      return;
    }

    if (empty) empty.hidden = true;
    if (content) content.hidden = false;

    const usycEl = document.getElementById("position-usyc");
    const usdcEl = document.getElementById("position-usdc");
    const ltvEl = document.getElementById("ltv-value");
    const gaugeFill = document.getElementById("ltv-gauge-fill");

    if (usycEl) usycEl.textContent = formatNumber(position.usycDeposited) + " USYC";
    if (usdcEl) usdcEl.textContent = formatNumber(position.usdcBorrowed) + " USDC";

    const ltvPct = position.ltvBps / 100;
    if (ltvEl) ltvEl.textContent = ltvPct.toFixed(1) + "%";
    if (gaugeFill) {
      gaugeFill.style.width = Math.min(100, ltvPct) + "%";
      gaugeFill.setAttribute("aria-valuenow", String(position.ltvBps));
    }
  }

  function renderStats(data) {
    var tvlEl = document.getElementById("stat-tvl");
    var tvlChangeEl = document.getElementById("stat-tvl-change");
    var usersEl = document.getElementById("stat-users");
    var monEl = document.getElementById("stat-monitored");
    var yieldEl = document.getElementById("stat-yield");
    var yieldSrcEl = document.getElementById("stat-yield-source");
    var arcEl = document.getElementById("stat-arc");
    var arcFinalEl = document.getElementById("stat-arc-finality");
    if (!data) {
      if (tvlEl) tvlEl.textContent = "—";
      if (tvlChangeEl) tvlChangeEl.textContent = "";
      if (usersEl) usersEl.textContent = "—";
      if (monEl) monEl.textContent = "—";
      if (yieldEl) yieldEl.textContent = "—";
      if (yieldSrcEl) yieldSrcEl.textContent = "";
      if (arcEl) arcEl.textContent = "—";
      if (arcFinalEl) arcFinalEl.textContent = "Finality";
      var aw = document.getElementById("stat-agent-watched");
      var as = document.getElementById("stat-agent-status");
      if (aw) aw.textContent = "—";
      if (as) as.textContent = "—";
      return;
    }
    if (tvlEl) tvlEl.textContent = data.tvl.formatted || "—";
    if (tvlChangeEl) {
      if (data.tvl.changePct != null) {
        tvlChangeEl.textContent = (data.tvl.changePct >= 0 ? "↑ " : "↓ ") + Math.abs(data.tvl.changePct).toFixed(1) + "%";
      } else {
        tvlChangeEl.textContent = "";
      }
    }
    if (usersEl) usersEl.textContent = String(data.users.total ?? "—");
    if (monEl) monEl.textContent = String(data.users.monitored ?? "—");
    if (yieldEl) yieldEl.textContent = data.yield.formatted || "—";
    if (yieldSrcEl) yieldSrcEl.textContent = data.yield.source || "";
    if (arcEl) arcEl.textContent = data.arc.settlement || "<1s";
    if (arcFinalEl) arcFinalEl.textContent = data.arc.finality ? "Finality " + data.arc.finality : "Finality";
    var agentWatchedEl = document.getElementById("stat-agent-watched");
    var agentStatusEl = document.getElementById("stat-agent-status");
    if (data.agent) {
      if (agentWatchedEl) agentWatchedEl.textContent = String(data.agent.positionsWatched ?? "—");
      if (agentStatusEl) {
        agentStatusEl.textContent = data.agent.running ? "Active" : "Inactive";
        agentStatusEl.style.color = data.agent.running ? "var(--ltv-green, #22c55e)" : "var(--sand-text-muted)";
      }
    } else {
      if (agentWatchedEl) agentWatchedEl.textContent = "—";
      if (agentStatusEl) agentStatusEl.textContent = "—";
    }
  }

  function setLoading(loading) {
    const el = document.getElementById("dashboard-loading");
    if (el) el.hidden = !loading;
    const main = document.getElementById("dashboard-main");
    if (main) main.hidden = loading;
  }

  function setError(message) {
    const el = document.getElementById("dashboard-error");
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
  }

  function hideError() {
    const el = document.getElementById("dashboard-error");
    if (el) el.hidden = true;
  }

  async function load() {
    var addressParam = getCurrentAddress();

    setLoading(true);
    hideError();

    if (!addressParam || !/^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
      setLoading(false);
      renderPrice("—");
      renderPosition(null, true);
      renderStats(null);
      renderSmsStatus(null);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const url = API_BASE + "/api/dashboard?address=" + encodeURIComponent(addressParam);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load dashboard");
      }

      const data = await res.json();
      const address = data.address || addressParam;
      if (window.AutonomiDashboard) window.AutonomiDashboard._lastAddress = address;
      renderPrice(data.usycPrice);
      renderPosition(data.position, false);
      loadSmsStatus(address);
      loadStats();
    } catch (e) {
      clearTimeout(timeoutId);
      var isAbort = e.name === "AbortError";
      var isNetworkError = !e.message || e.message === "Failed to fetch" || e.message === "Load failed" || e.message === "NetworkError when attempting to fetch resource";
      var message = isAbort
        ? "Request timed out. The backend or RPC may be slow—try again in a moment."
        : isNetworkError
          ? "Could not reach the API. Start the backend (cd backend && npm run dev:server). If this page is on another port (e.g. 8787), use ?api=http://localhost:3000 to point to the API."
          : (e.message || "Could not load dashboard.");
      setError(message);
      renderPrice("—");
      renderPosition(null, false);
      renderStats(null);
      renderSmsStatus(null);
    } finally {
      setLoading(false);
    }
  }

  function loadMarketPrice() {
    fetch(API_BASE + "/api/v1/market")
      .then(function (res) { return res.ok ? res.json() : Promise.reject(); })
      .then(function (body) {
        var price = body && body.data && body.data.usycPrice;
        if (price) renderPrice(price);
      })
      .catch(function () {});
  }

  function refreshData() {
    var addressParam = getCurrentAddress();
    if (!addressParam || !/^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
      return;
    }
    var url = API_BASE + "/api/dashboard?address=" + encodeURIComponent(addressParam);
    fetch(url)
      .then(function (res) { return res.ok ? res.json() : Promise.reject(new Error("Fetch failed")); })
      .then(function (data) {
        if (window.AutonomiDashboard) window.AutonomiDashboard._lastAddress = data.address || addressParam;
        renderPrice(data.usycPrice);
        renderPosition(data.position);
        loadSmsStatus(data.address || addressParam);
      })
      .catch(function () {});
    loadStats();
  }

  function renderSmsStatus(data) {
    const statusEl = document.getElementById("sms-status-text");
    const linkEl = document.getElementById("sms-dashboard-link");
    if (!statusEl) return;
    if (data === null || data === undefined) {
      statusEl.textContent = "SMS alerts: connect backend to register.";
      if (linkEl) linkEl.href = "alerts.html";
      return;
    }
    if (data.registered && data.maskedPhone) {
      statusEl.textContent = "Alerts active for " + data.maskedPhone;
      if (linkEl && window.AutonomiDashboard && window.AutonomiDashboard._lastAddress) {
        linkEl.href = "alerts.html?address=" + encodeURIComponent(window.AutonomiDashboard._lastAddress);
      } else if (linkEl) linkEl.href = "alerts.html";
    } else {
      statusEl.textContent = "Not registered. Manage alerts to add a phone.";
      if (linkEl && window.AutonomiDashboard && window.AutonomiDashboard._lastAddress) {
        linkEl.href = "alerts.html?address=" + encodeURIComponent(window.AutonomiDashboard._lastAddress);
      } else if (linkEl) linkEl.href = "alerts.html";
    }
  }

  async function loadSmsStatus(address) {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      renderSmsStatus(null);
      return;
    }
    try {
      const res = await fetch(API_BASE + "/api/sms/status?address=" + encodeURIComponent(address));
      const data = await res.json();
      renderSmsStatus(data);
    } catch {
      renderSmsStatus(null);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch(API_BASE + "/api/dashboard/stats");
      if (!res.ok) {
        renderStats(null);
        return;
      }
      const data = await res.json();
      renderStats(data);
    } catch {
      renderStats(null);
    }
  }

  function bindSmsRegister() {
    const btn = document.getElementById("sms-register-btn");
    if (!btn) return;
    // Full SMS UI is on alerts page; no-op on dashboard
  }

  function getCurrentAddress() {
    var addressParam = new URLSearchParams(window.location.search).get("address") || "";
    var stored = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("autonomi_wallet")) || "";
    return addressParam || (window.AutonomiDashboard && window.AutonomiDashboard._lastAddress) || stored || "";
  }

  function bindWalletConnect() {
    var addressParam = new URLSearchParams(window.location.search).get("address") || "";
    var stored = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("autonomi_wallet")) || "";
    var address = addressParam || stored || "";
    if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      if (window.AutonomiDashboard) window.AutonomiDashboard._lastAddress = address;
    }
  }

  function bindSmsPreferencesAndTest() {
    // Full SMS UI is on alerts page; no-op on dashboard
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      load();
      bindSmsRegister();
      bindSmsPreferencesAndTest();
      bindWalletConnect();
      setInterval(refreshData, 60000);
    });
  } else {
    load();
    bindSmsRegister();
    bindSmsPreferencesAndTest();
    bindWalletConnect();
    setInterval(refreshData, 60000);
  }

  window.AutonomiDashboard = { reload: load, _lastAddress: "" };
})();

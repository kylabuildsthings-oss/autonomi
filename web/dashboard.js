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

  function renderPosition(position) {
    const card = document.getElementById("position-card");
    const empty = document.getElementById("position-empty");
    const content = document.getElementById("position-content");
    if (!card) return;

    if (!position || !position.active) {
      if (empty) empty.hidden = false;
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const url = addressParam
        ? API_BASE + "/api/dashboard?address=" + encodeURIComponent(addressParam)
        : API_BASE + "/api/dashboard";
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
      renderPosition(data.position);
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
      renderPosition(null);
      renderStats(null);
      renderSmsStatus(null);
    } finally {
      setLoading(false);
    }
  }

  function refreshData() {
    var addressParam = getCurrentAddress();
    var url = addressParam
      ? API_BASE + "/api/dashboard?address=" + encodeURIComponent(addressParam)
      : API_BASE + "/api/dashboard";
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

  function setWalletUI(connected, address) {
    var btn = document.getElementById("wallet-connect-btn");
    var addrEl = document.getElementById("wallet-address");
    var discBtn = document.getElementById("wallet-disconnect-btn");
    if (!btn || !addrEl || !discBtn) return;
    if (connected && address) {
      btn.classList.add("hidden");
      addrEl.textContent = address.slice(0, 6) + "…" + address.slice(-4);
      addrEl.classList.remove("hidden");
      discBtn.classList.remove("hidden");
    } else {
      btn.classList.remove("hidden");
      addrEl.classList.add("hidden");
      discBtn.classList.add("hidden");
    }
  }

  function connectWallet() {
    if (!window.ethereum) {
      alert("No wallet found. Install MetaMask or another Web3 wallet.");
      return;
    }
    window.ethereum.request({ method: "eth_requestAccounts" }).then(function (accounts) {
      if (accounts && accounts[0]) {
        var addr = accounts[0];
        if (typeof sessionStorage !== "undefined") sessionStorage.setItem("autonomi_wallet", addr);
        window.AutonomiDashboard._lastAddress = addr;
        var params = new URLSearchParams(window.location.search);
        params.set("address", addr);
        var newUrl = window.location.pathname + "?" + params.toString();
        window.history.replaceState({}, "", newUrl);
        setWalletUI(true, addr);
        load();
      }
    }).catch(function (err) {
      if (err.code !== 4001) console.error("Wallet connect error", err);
    });
  }

  function disconnectWallet() {
    if (typeof sessionStorage !== "undefined") sessionStorage.removeItem("autonomi_wallet");
    var params = new URLSearchParams(window.location.search);
    params.delete("address");
    var newUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
    window.history.replaceState({}, "", newUrl);
    window.AutonomiDashboard._lastAddress = "";
    setWalletUI(false);
    load();
  }

  function bindWalletConnect() {
    var btn = document.getElementById("wallet-connect-btn");
    var discBtn = document.getElementById("wallet-disconnect-btn");
    var posBtn = document.getElementById("wallet-connect-position-btn");
    if (btn) btn.addEventListener("click", connectWallet);
    if (discBtn) discBtn.addEventListener("click", disconnectWallet);
    if (posBtn) posBtn.addEventListener("click", connectWallet);
    var addressParam = new URLSearchParams(window.location.search).get("address") || "";
    if (addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam)) setWalletUI(true, addressParam);
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

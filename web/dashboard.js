/**
 * Dashboard — fetch live data from backend API and render
 */
(function () {
  const API_BASE = window.AUTONOMI_API_URL || "http://localhost:3000";

  function el(selector) {
    return document.querySelector(selector);
  }

  function formatNumber(s) {
    return Number(s).toLocaleString();
  }

  function renderPrice(price) {
    const el = document.getElementById("oracle-price");
    if (!el) return;
    el.textContent = "USYC Price: $" + price;
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
    const address = new URLSearchParams(window.location.search).get("address") || "";

    setLoading(true);
    hideError();

    try {
      const url = address
        ? API_BASE + "/api/dashboard?address=" + encodeURIComponent(address)
        : API_BASE + "/api/dashboard";
      const res = await fetch(url);

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to load dashboard");
      }

      const data = await res.json();
      renderPrice(data.usycPrice);
      renderPosition(data.position);
    } catch (e) {
      setError(e.message || "Could not reach backend. Is it running on " + API_BASE + "?");
      renderPrice("—");
      renderPosition(null);
    } finally {
      setLoading(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", load);
  } else {
    load();
  }

  window.AutonomiDashboard = { reload: load };
})();

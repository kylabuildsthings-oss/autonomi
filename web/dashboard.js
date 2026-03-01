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
    const addressParam = new URLSearchParams(window.location.search).get("address") || "";

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
      renderPrice(data.usycPrice);
      renderPosition(data.position);
      loadSmsStatus(address);
    } catch (e) {
      clearTimeout(timeoutId);
      const isAbort = e.name === "AbortError";
      const isNetworkError = !e.message || e.message === "Failed to fetch" || e.message === "Load failed" || e.message === "NetworkError when attempting to fetch resource";
      const message = isAbort
        ? "Request timed out. The backend or RPC may be slow—try again in a moment."
        : isNetworkError
          ? "Could not reach the API. Start the backend (cd backend && npm run dev:server). If this page is on another port (e.g. 8787), use ?api=http://localhost:3000 to point to the API."
          : (e.message || "Could not load dashboard.");
      setError(message);
      renderPrice("—");
      renderPosition(null);
      renderSmsStatus(null, null);
    } finally {
      setLoading(false);
    }
  }

  function renderSmsStatus(registered, maskedPhone) {
    const statusEl = document.getElementById("sms-status-text");
    const formEl = document.getElementById("sms-register-form");
    if (!statusEl) return;
    if (registered === null) {
      statusEl.textContent = "SMS alerts: connect backend to register.";
      if (formEl) formEl.classList.add("hidden");
      return;
    }
    if (registered && maskedPhone) {
      statusEl.textContent = "Alerts active for " + maskedPhone;
      if (formEl) formEl.classList.add("hidden");
    } else {
      statusEl.textContent = "Get SMS when the agent rebalances your position.";
      if (formEl) formEl.classList.remove("hidden");
    }
  }

  async function loadSmsStatus(address) {
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      renderSmsStatus(null, null);
      return;
    }
    try {
      const res = await fetch(API_BASE + "/api/sms/status?address=" + encodeURIComponent(address));
      const data = await res.json();
      renderSmsStatus(data.registered, data.maskedPhone || null);
    } catch {
      renderSmsStatus(null, null);
    }
  }

  function bindSmsRegister() {
    const btn = document.getElementById("sms-register-btn");
    const phoneInput = document.getElementById("sms-phone");
    const errorEl = document.getElementById("sms-register-error");
    if (!btn || !phoneInput) return;

    btn.addEventListener("click", async function () {
      const addressParam = new URLSearchParams(window.location.search).get("address") || "";
      const url = addressParam
        ? API_BASE + "/api/dashboard?address=" + encodeURIComponent(addressParam)
        : API_BASE + "/api/dashboard";
      let address = addressParam;
      if (!address) {
        try {
          const r = await fetch(url);
          const data = await r.json();
          address = data.address;
        } catch (e) {
          if (errorEl) {
            errorEl.textContent = "Could not get wallet address. Add ?address=0x... to the URL.";
            errorEl.classList.remove("hidden");
          }
          return;
        }
      }
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        if (errorEl) {
          errorEl.textContent = "Invalid or missing address.";
          errorEl.classList.remove("hidden");
        }
        return;
      }

      const phone = phoneInput.value.trim().replace(/\s/g, "");
      if (!phone || phone.length < 10) {
        if (errorEl) {
          errorEl.textContent = "Enter a valid phone number (e.g. +15551234567).";
          errorEl.classList.remove("hidden");
        }
        return;
      }

      if (errorEl) errorEl.classList.add("hidden");
      btn.disabled = true;

      try {
        const res = await fetch(API_BASE + "/api/sms/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, phone }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (errorEl) {
            errorEl.textContent = data.error || "Registration failed.";
            errorEl.classList.remove("hidden");
          }
          return;
        }
        await loadSmsStatus(address);
      } catch (e) {
        if (errorEl) {
          errorEl.textContent = "Could not reach the API.";
          errorEl.classList.remove("hidden");
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      load();
      bindSmsRegister();
    });
  } else {
    load();
    bindSmsRegister();
  }

  window.AutonomiDashboard = { reload: load };
})();

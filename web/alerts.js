/**
 * Alerts page — full SMS preference management and change number.
 * Requires a connected wallet (URL param or sessionStorage); shows connect prompt when disconnected.
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const API_BASE = params.get("api") || window.AUTONOMI_API_URL || "http://localhost:3000";
  const STORAGE_KEY = "autonomi_wallet";

  /** True if the header shows a connected wallet (Connect button is hidden). */
  function isWalletConnectedInHeader() {
    var btn = document.getElementById("wallet-connect-btn");
    return btn ? btn.classList.contains("hidden") : false;
  }

  function getCurrentAddress() {
    if (!isWalletConnectedInHeader()) return "";
    var q = typeof window !== "undefined" && window.location && window.location.search ? window.location.search : "";
    var params = new URLSearchParams(q);
    var u = params.get("address") || "";
    if (u && /^0x[a-fA-F0-9]{40}$/.test(u)) return u;
    try {
      var s = sessionStorage.getItem(STORAGE_KEY);
      return s && /^0x[a-fA-F0-9]{40}$/.test(s) ? s : "";
    } catch (e) { return ""; }
  }

  let currentAddress = getCurrentAddress();

  function renderSmsStatus(data, noWallet) {
    const statusEl = document.getElementById("sms-status-text");
    const formEl = document.getElementById("sms-register-form");
    const viewEl = document.getElementById("sms-status-view");
    const maskedEl = document.getElementById("sms-masked-phone");
    const lastAlertEl = document.getElementById("sms-last-alert");
    const changeFormEl = document.getElementById("sms-change-number-form");
    if (!statusEl) return;
    if (noWallet) {
      statusEl.textContent = "Connect your wallet using the button in the header to view and manage SMS alerts.";
      if (formEl) formEl.classList.add("hidden");
      if (viewEl) viewEl.classList.add("hidden");
      return;
    }
    if (data === null || data === undefined) {
      statusEl.textContent = "SMS alerts: connect backend to register.";
      if (formEl) formEl.classList.remove("hidden");
      if (viewEl) viewEl.classList.add("hidden");
      return;
    }
    const registered = data.registered;
    const maskedPhone = data.maskedPhone || null;
    const preferences = data.preferences || {};
    const lastAlertAt = data.lastAlertAt || null;

    if (registered && maskedPhone) {
      statusEl.textContent = "Alerts active for " + maskedPhone;
      if (formEl) formEl.classList.add("hidden");
      if (viewEl) viewEl.classList.remove("hidden");
      if (maskedEl) maskedEl.textContent = "Phone: " + maskedPhone;
      if (lastAlertEl) {
        lastAlertEl.textContent = lastAlertAt
          ? "Last alert: " + formatLastAlert(lastAlertAt)
          : "No alerts sent yet.";
      }
      if (changeFormEl) changeFormEl.classList.add("hidden");
      ["rebalances", "warnings", "largePriceMoves", "dailySummary", "testAlerts"].forEach(function (key) {
        const cb = document.getElementById("pref-" + key);
        if (cb) cb.checked = !!preferences[key];
      });
    } else {
      statusEl.textContent = "Get SMS when the agent rebalances your position.";
      if (formEl) formEl.classList.remove("hidden");
      if (viewEl) viewEl.classList.add("hidden");
    }
  }

  function formatLastAlert(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffM = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffM < 1) return "just now";
    if (diffM < 60) return diffM + " min ago";
    if (diffH < 24) return diffH + " hr ago";
    if (diffD < 7) return diffD + " day(s) ago";
    return d.toLocaleDateString();
  }

  async function loadSmsStatus(address) {
    if (!isWalletConnectedInHeader()) {
      renderSmsStatus(null, true);
      return;
    }
    var addr = address || getCurrentAddress();
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) {
      renderSmsStatus(null, true);
      return;
    }
    try {
      const res = await fetch(API_BASE + "/api/sms/status?address=" + encodeURIComponent(addr));
      const data = await res.json();
      renderSmsStatus(isWalletConnectedInHeader() ? data : null, !isWalletConnectedInHeader());
    } catch {
      renderSmsStatus(null, false);
    }
  }

  function ensureAddress() {
    currentAddress = getCurrentAddress();
    return currentAddress;
  }

  /** Build message for backend verification (must match server format). */
  function buildSmsMessage(action, address) {
    return "Autonomi SMS: " + action + " " + address + " at " + new Date().toISOString();
  }

  /** Get signature from wallet; returns signature or throws. */
  function signSmsMessage(address, message) {
    var sign = typeof window !== "undefined" && window.AutonomiWallet && window.AutonomiWallet.signMessage;
    if (!sign) return Promise.reject(new Error("Wallet not available. Connect your wallet first."));
    return sign(address, message);
  }

  function bindSmsRegister() {
    const btn = document.getElementById("sms-register-btn");
    const phoneInput = document.getElementById("sms-phone");
    const errorEl = document.getElementById("sms-register-error");
    if (!btn || !phoneInput) return;

    btn.addEventListener("click", async function () {
      const address = ensureAddress();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        if (errorEl) {
          errorEl.textContent = "Connect your wallet first using the button in the header.";
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
      const preferences = {
        rebalances: document.getElementById("reg-rebalances")?.checked !== false,
        warnings: document.getElementById("reg-warnings")?.checked !== false,
        largePriceMoves: document.getElementById("reg-largePriceMoves")?.checked !== false,
        dailySummary: document.getElementById("reg-dailySummary")?.checked !== false,
        testAlerts: document.getElementById("reg-testAlerts")?.checked !== false,
      };
      if (errorEl) errorEl.classList.add("hidden");
      btn.disabled = true;
      try {
        const message = buildSmsMessage("register", address);
        const signature = await signSmsMessage(address, message);
        const res = await fetch(API_BASE + "/api/sms/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, phone, preferences, message, signature }),
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
          errorEl.textContent = e && e.message ? e.message : "Could not reach the API.";
          errorEl.classList.remove("hidden");
        }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindChangeNumber() {
    const showBtn = document.getElementById("sms-change-number-btn");
    const formEl = document.getElementById("sms-change-number-form");
    const inputEl = document.getElementById("sms-new-phone");
    const updateBtn = document.getElementById("sms-update-phone-btn");
    const errorEl = document.getElementById("sms-change-number-error");
    if (!showBtn || !formEl || !inputEl || !updateBtn) return;

    showBtn.addEventListener("click", function () {
      formEl.classList.toggle("hidden");
      if (!formEl.classList.contains("hidden")) inputEl.focus();
      if (errorEl) errorEl.classList.add("hidden");
    });

    updateBtn.addEventListener("click", async function () {
      const address = currentAddress;
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        if (errorEl) {
          errorEl.textContent = "No wallet address.";
          errorEl.classList.remove("hidden");
        }
        return;
      }
      const phone = inputEl.value.trim().replace(/\s/g, "");
      if (!phone || phone.length < 10) {
        if (errorEl) {
          errorEl.textContent = "Enter a valid phone number (E.164).";
          errorEl.classList.remove("hidden");
        }
        return;
      }
      const preferences = {
        rebalances: document.getElementById("pref-rebalances")?.checked ?? true,
        warnings: document.getElementById("pref-warnings")?.checked ?? true,
        largePriceMoves: document.getElementById("pref-largePriceMoves")?.checked ?? true,
        dailySummary: document.getElementById("pref-dailySummary")?.checked ?? true,
        testAlerts: document.getElementById("pref-testAlerts")?.checked ?? true,
      };
      if (errorEl) errorEl.classList.add("hidden");
      updateBtn.disabled = true;
      try {
        const message = buildSmsMessage("register", address);
        const signature = await signSmsMessage(address, message);
        const res = await fetch(API_BASE + "/api/sms/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, phone, preferences, message, signature }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (errorEl) {
            errorEl.textContent = data.error || "Update failed.";
            errorEl.classList.remove("hidden");
          }
          return;
        }
        formEl.classList.add("hidden");
        inputEl.value = "";
        await loadSmsStatus(address);
      } catch (e) {
        if (errorEl) {
          errorEl.textContent = e && e.message ? e.message : "Could not reach the API.";
          errorEl.classList.remove("hidden");
        }
      } finally {
        updateBtn.disabled = false;
      }
    });
  }

  function bindSmsPreferencesAndTest() {
    const toggles = document.querySelectorAll(".sms-pref-toggle");
    const testBtn = document.getElementById("sms-test-btn");
    const testMsg = document.getElementById("sms-test-message");

    toggles.forEach(function (el) {
      el.addEventListener("change", async function () {
        const address = currentAddress;
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) return;
        const preferences = {
          rebalances: document.getElementById("pref-rebalances")?.checked ?? true,
          warnings: document.getElementById("pref-warnings")?.checked ?? true,
          largePriceMoves: document.getElementById("pref-largePriceMoves")?.checked ?? true,
          dailySummary: document.getElementById("pref-dailySummary")?.checked ?? true,
          testAlerts: document.getElementById("pref-testAlerts")?.checked ?? true,
        };
        try {
          const message = buildSmsMessage("preferences", address);
          const signature = await signSmsMessage(address, message);
          await fetch(API_BASE + "/api/sms/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, preferences, message, signature }),
          });
        } catch (e) {}
      });
    });

    if (testBtn && testMsg) {
      testBtn.addEventListener("click", async function () {
        const address = currentAddress;
        if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
          testMsg.textContent = "No wallet address. Add ?address=0x... to the URL.";
          testMsg.classList.remove("hidden");
          testMsg.classList.add("text-red-400");
          return;
        }
        testMsg.classList.add("hidden");
        testBtn.disabled = true;
        try {
          const message = buildSmsMessage("test", address);
          const signature = await signSmsMessage(address, message);
          const res = await fetch(API_BASE + "/api/sms/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, message, signature }),
          });
          const data = await res.json().catch(() => ({}));
          if (res.ok && data.sent) {
            testMsg.textContent = "Test SMS sent. Check your phone.";
            testMsg.classList.remove("text-red-400");
          } else {
            testMsg.textContent = data.error || "Failed to send test SMS.";
            testMsg.classList.add("text-red-400");
          }
          testMsg.classList.remove("hidden");
        } catch (e) {
          testMsg.textContent = e && e.message ? e.message : "Could not reach the API.";
          testMsg.classList.add("text-red-400");
          testMsg.classList.remove("hidden");
        }
        testBtn.disabled = false;
      });
    }
  }

  async function init() {
    currentAddress = getCurrentAddress();
    await loadSmsStatus(currentAddress);
    bindSmsRegister();
    bindChangeNumber();
    bindSmsPreferencesAndTest();
    document.addEventListener("autonomi:wallet-change", function () {
      currentAddress = getCurrentAddress();
      loadSmsStatus(currentAddress);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(init, 0);
    });
  } else {
    setTimeout(init, 0);
  }
})();

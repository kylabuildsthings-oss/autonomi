/**
 * Alerts page — full SMS preference management and change number
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const API_BASE = params.get("api") || window.AUTONOMI_API_URL || "http://localhost:3000";
  let currentAddress = params.get("address") || "";

  function renderSmsStatus(data) {
    const statusEl = document.getElementById("sms-status-text");
    const formEl = document.getElementById("sms-register-form");
    const viewEl = document.getElementById("sms-status-view");
    const maskedEl = document.getElementById("sms-masked-phone");
    const lastAlertEl = document.getElementById("sms-last-alert");
    const changeFormEl = document.getElementById("sms-change-number-form");
    if (!statusEl) return;
    if (data === null || data === undefined) {
      statusEl.textContent = "SMS alerts: connect backend to register.";
      if (formEl) formEl.classList.add("hidden");
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

  async function ensureAddress() {
    if (currentAddress && /^0x[a-fA-F0-9]{40}$/.test(currentAddress)) return currentAddress;
    try {
      const res = await fetch(API_BASE + "/api/dashboard");
      const data = await res.json();
      if (data.address) currentAddress = data.address;
    } catch (e) {}
    return currentAddress;
  }

  function bindSmsRegister() {
    const btn = document.getElementById("sms-register-btn");
    const phoneInput = document.getElementById("sms-phone");
    const errorEl = document.getElementById("sms-register-error");
    if (!btn || !phoneInput) return;

    btn.addEventListener("click", async function () {
      const address = await ensureAddress();
      if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
        if (errorEl) {
          errorEl.textContent = "Could not get wallet address. Add ?address=0x... to the URL.";
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
        const res = await fetch(API_BASE + "/api/sms/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, phone, preferences }),
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
        const res = await fetch(API_BASE + "/api/sms/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address, phone, preferences }),
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
          errorEl.textContent = "Could not reach the API.";
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
          await fetch(API_BASE + "/api/sms/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address, preferences }),
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
          const res = await fetch(API_BASE + "/api/sms/test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ address }),
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
          testMsg.textContent = "Could not reach the API.";
          testMsg.classList.add("text-red-400");
          testMsg.classList.remove("hidden");
        }
        testBtn.disabled = false;
      });
    }
  }

  async function init() {
    const addressParam = params.get("address") || "";
    if (addressParam && /^0x[a-fA-F0-9]{40}$/.test(addressParam)) {
      currentAddress = addressParam;
    } else {
      await ensureAddress();
    }
    await loadSmsStatus(currentAddress);
    bindSmsRegister();
    bindChangeNumber();
    bindSmsPreferencesAndTest();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

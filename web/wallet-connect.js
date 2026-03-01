/**
 * Shared wallet connect UI for all app pages (except landing).
 * Persists connected address in sessionStorage so state is kept across navigation.
 */
(function () {
  var STORAGE_KEY = "autonomi_wallet";

  function getStoredAddress() {
    try {
      var a = sessionStorage.getItem(STORAGE_KEY);
      return a && /^0x[a-fA-F0-9]{40}$/.test(a) ? a : "";
    } catch (e) {
      return "";
    }
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
    window.ethereum
      .request({ method: "eth_requestAccounts" })
      .then(function (accounts) {
        if (accounts && accounts[0]) {
          var addr = accounts[0];
          sessionStorage.setItem(STORAGE_KEY, addr);
          setWalletUI(true, addr);
          var path = window.location.pathname;
          var params = new URLSearchParams(window.location.search);
          params.set("address", addr);
          window.history.replaceState({}, "", path + "?" + params.toString());
          if (window.AutonomiDashboard && typeof window.AutonomiDashboard.reload === "function") {
            window.AutonomiDashboard._lastAddress = addr;
            window.AutonomiDashboard.reload();
          }
          updateDashboardLinks(addr);
        }
      })
      .catch(function (err) {
        if (err.code !== 4001) console.error("Wallet connect error", err);
      });
  }

  function disconnectWallet() {
    sessionStorage.removeItem(STORAGE_KEY);
    var params = new URLSearchParams(window.location.search);
    params.delete("address");
    var path = window.location.pathname;
    var qs = params.toString();
    window.history.replaceState({}, "", path + (qs ? "?" + qs : ""));
    setWalletUI(false);
    if (window.AutonomiDashboard) {
      window.AutonomiDashboard._lastAddress = "";
      if (typeof window.AutonomiDashboard.reload === "function") window.AutonomiDashboard.reload();
    }
    updateDashboardLinks(null);
  }

  function updateDashboardLinks(address) {
    document.querySelectorAll('a[href="dashboard.html"], a[href*="dashboard.html?"]').forEach(function (a) {
      var href = "dashboard.html";
      if (address) href += "?address=" + encodeURIComponent(address);
      a.setAttribute("href", href);
    });
  }

  function init() {
    var btn = document.getElementById("wallet-connect-btn");
    var discBtn = document.getElementById("wallet-disconnect-btn");
    if (!btn || !discBtn) return;
    btn.addEventListener("click", connectWallet);
    discBtn.addEventListener("click", disconnectWallet);
    var posBtn = document.getElementById("wallet-connect-position-btn");
    if (posBtn) posBtn.addEventListener("click", connectWallet);

    var address = new URLSearchParams(window.location.search).get("address") || getStoredAddress();
    if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      sessionStorage.setItem(STORAGE_KEY, address);
      setWalletUI(true, address);
      updateDashboardLinks(address);
    } else {
      setWalletUI(false);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

/**
 * Robust Connect Wallet for Autonomi — Arc Testnet.
 * Detects the browser extension (MetaMask, Coinbase Wallet, Rabby, etc.),
 * ensures Arc Testnet is added and selected, then connects and optionally signs in.
 */
(function () {
  var STORAGE_KEY = "autonomi_wallet";
  var STORAGE_WALLET_NAME = "autonomi_wallet_name";

  // Arc Testnet (matches backend and docs)
  var ARC_CHAIN_ID = 5042002;
  var ARC_CHAIN_ID_HEX = "0x" + ARC_CHAIN_ID.toString(16);
  var ARC_RPC_URL = "https://rpc.testnet.arc.network";
  var ARC_EXPLORER = "https://testnet.arcscan.app";
  var ARC_NETWORK = {
    chainId: ARC_CHAIN_ID_HEX,
    chainName: "Arc Testnet",
    nativeCurrency: { name: "USDC", symbol: "USDC", decimals: 6 },
    rpcUrls: [ARC_RPC_URL],
    blockExplorerUrls: [ARC_EXPLORER],
  };

  /**
   * Detect the injected EIP-1193 provider. Handles multiple providers (e.g. MetaMask + Coinbase).
   * Returns { provider, walletName } or null.
   */
  function getProvider() {
    var ethereum = typeof window !== "undefined" && window.ethereum;
    if (!ethereum) return null;

    // Single provider (most extensions)
    if (!ethereum.providers) {
      return { provider: ethereum, walletName: getWalletName(ethereum) };
    }

    // Multiple providers: prefer MetaMask, then Coinbase, then Rabby, then first
    var providers = ethereum.providers;
    var metaMask = providers.find(function (p) { return p.isMetaMask && !p.isRabby; });
    var coinbase = providers.find(function (p) { return p.isCoinbaseWallet; });
    var rabby = providers.find(function (p) { return p.isRabby; });
    var chosen = metaMask || coinbase || rabby || providers[0];
    return { provider: chosen, walletName: getWalletName(chosen) };
  }

  function getWalletName(provider) {
    if (!provider) return "Wallet";
    if (provider.isMetaMask && provider.isRabby) return "Rabby";
    if (provider.isMetaMask) return "MetaMask";
    if (provider.isCoinbaseWallet) return "Coinbase Wallet";
    if (provider.isBraveWallet) return "Brave Wallet";
    if (provider.isRabby) return "Rabby";
    if (provider.isPhantom) return "Phantom";
    if (provider.isTrust) return "Trust Wallet";
    if (provider.isRainbow) return "Rainbow";
    if (provider.isLedgerConnect) return "Ledger";
    return provider.provider?.name || provider.name || "Web3";
  }

  function getStoredAddress() {
    try {
      var a = sessionStorage.getItem(STORAGE_KEY);
      return a && /^0x[a-fA-F0-9]{40}$/.test(a) ? a : "";
    } catch (e) {
      return "";
    }
  }

  function setWalletUI(connected, address, walletName) {
    var btn = document.getElementById("wallet-connect-btn");
    var addrEl = document.getElementById("wallet-address");
    var discBtn = document.getElementById("wallet-disconnect-btn");
    var wrap = document.getElementById("wallet-connect-wrap");
    if (!btn || !addrEl || !discBtn) return;
    if (connected && address) {
      btn.classList.add("hidden");
      addrEl.textContent = address.slice(0, 6) + "…" + address.slice(-4);
      addrEl.classList.remove("hidden");
      if (walletName) {
        addrEl.setAttribute("title", "Connected with " + walletName + " on Arc Testnet");
        if (wrap) wrap.setAttribute("data-wallet-name", walletName);
      }
      discBtn.classList.remove("hidden");
    } else {
      btn.classList.remove("hidden");
      addrEl.classList.add("hidden");
      discBtn.classList.add("hidden");
      if (wrap) wrap.removeAttribute("data-wallet-name");
    }
  }

  /**
   * Add Arc Testnet to the wallet if missing, then switch to it.
   */
  function ensureArcTestnet(provider) {
    return provider
      .request({ method: "wallet_switchEthereumChain", params: [{ chainId: ARC_CHAIN_ID_HEX }] })
      .catch(function (err) {
        if (err.code === 4902 || err.code === -32603) {
          return provider.request({
            method: "wallet_addEthereumChain",
            params: [ARC_NETWORK],
          });
        }
        throw err;
      });
  }

  /**
   * Optional sign-in message to prove ownership (Arc Testnet).
   */
  function signInMessage(provider, address) {
    var message = "Sign in to Autonomi on Arc Testnet\n\nOrigin: " + (window.location.origin || "unknown") + "\nAt: " + new Date().toISOString();
    return provider.request({
      method: "personal_sign",
      params: [message, address],
    });
  }

  function connectWallet() {
    var info = getProvider();
    if (!info) {
      alert("No Web3 wallet found. Install a browser extension such as MetaMask or Coinbase Wallet, then add Arc Testnet.");
      return;
    }
    var provider = info.provider;
    var walletName = info.walletName;

    var btn = document.getElementById("wallet-connect-btn");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Connecting…";
    }

    provider
      .request({ method: "eth_requestAccounts" })
      .then(function (accounts) {
        if (!accounts || !accounts[0]) {
          if (btn) { btn.disabled = false; btn.textContent = "Connect wallet"; }
          return;
        }
        var addr = accounts[0];
        return ensureArcTestnet(provider).then(
          function () { return addr; },
          function (err) {
            if (err.code === 4001) throw err;
            alert("Please add Arc Testnet in your wallet. Chain ID: " + ARC_CHAIN_ID + ", RPC: " + ARC_RPC_URL);
            throw err;
          }
        );
      })
      .then(function (addr) {
        if (!addr) return;
        return signInMessage(provider, addr).then(
          function () { return addr; },
          function (err) {
            if (err.code === 4001) return addr;
            console.warn("Sign-in skipped:", err.message);
            return addr;
          }
        );
      })
      .then(function (addr) {
        if (!addr) return;
        sessionStorage.setItem(STORAGE_KEY, addr);
        if (walletName) sessionStorage.setItem(STORAGE_WALLET_NAME, walletName);
        setWalletUI(true, addr, walletName);
        var path = window.location.pathname;
        var params = new URLSearchParams(window.location.search);
        params.set("address", addr);
        window.history.replaceState({}, "", path + "?" + params.toString());
        if (window.AutonomiDashboard && typeof window.AutonomiDashboard.reload === "function") {
          window.AutonomiDashboard._lastAddress = addr;
          window.AutonomiDashboard.reload();
        }
        updateDashboardLinks(addr);
        dispatchWalletChange(addr);
      })
      .catch(function (err) {
        if (err.code !== 4001) console.error("Wallet connect error", err);
      })
      .finally(function () {
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Connect wallet";
        }
      });
  }

  function dispatchWalletChange(address) {
    try {
      document.dispatchEvent(new CustomEvent("autonomi:wallet-change", { detail: { address: address || null } }));
    } catch (e) {}
  }

  /**
   * Sign a message with the connected wallet (for SMS auth). Resolves with hex signature or rejects.
   * Other scripts (e.g. alerts.js) can call: AutonomiWallet.signMessage(address, message)
   */
  function signMessage(address, message) {
    var info = getProvider();
    if (!info || !address || !message) return Promise.reject(new Error("Wallet not available or missing address/message"));
    return info.provider.request({
      method: "personal_sign",
      params: [message, address],
    });
  }

  window.AutonomiWallet = {
    signMessage: signMessage,
  };

  function disconnectWallet() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(STORAGE_WALLET_NAME);
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
    dispatchWalletChange(null);
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
    btn.setAttribute("title", "Connect your wallet to Arc Testnet (Chain ID " + ARC_CHAIN_ID + ")");
    var info = getProvider();
    if (!info) btn.setAttribute("aria-label", "Connect wallet — install MetaMask or another Web3 extension");
    btn.addEventListener("click", connectWallet);
    discBtn.addEventListener("click", disconnectWallet);
    var posBtn = document.getElementById("wallet-connect-position-btn");
    if (posBtn) posBtn.addEventListener("click", connectWallet);

    var address = new URLSearchParams(window.location.search).get("address") || getStoredAddress();
    var walletName = sessionStorage.getItem(STORAGE_WALLET_NAME) || "";
    if (address && /^0x[a-fA-F0-9]{40}$/.test(address)) {
      sessionStorage.setItem(STORAGE_KEY, address);
      setWalletUI(true, address, walletName || undefined);
      updateDashboardLinks(address);
    } else {
      setWalletUI(false);
    }
    dispatchWalletChange(address && /^0x[a-fA-F0-9]{40}$/.test(address) ? address : null);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

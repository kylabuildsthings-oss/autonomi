/**
 * Community forum — anon username, list posts, view thread, new post, reply.
 * Requires wallet connect for posting; uses same signature flow as Alerts.
 */
(function () {
  const params = new URLSearchParams(window.location.search);
  const API_BASE = params.get("api") || window.AUTONOMI_API_URL || "http://localhost:3000";
  const STORAGE_KEY = "autonomi_wallet";

  function isWalletConnectedInHeader() {
    var btn = document.getElementById("wallet-connect-btn");
    return btn ? btn.classList.contains("hidden") : false;
  }

  function getCurrentAddress() {
    if (!isWalletConnectedInHeader()) return "";
    var q = window.location.search || "";
    var u = new URLSearchParams(q).get("address") || "";
    if (u && /^0x[a-fA-F0-9]{40}$/.test(u)) return u;
    try {
      var s = sessionStorage.getItem(STORAGE_KEY);
      return s && /^0x[a-fA-F0-9]{40}$/.test(s) ? s : "";
    } catch (e) { return ""; }
  }

  function buildMessage(action, address) {
    return "Autonomi Community: " + action + " " + address + " at " + new Date().toISOString();
  }

  function apiUrl(path) {
    var base = API_BASE ? API_BASE.replace(/\/$/, "") : "http://localhost:3000";
    return base + path;
  }

  function signMessage(address, message) {
    var sign = typeof window !== "undefined" && window.AutonomiWallet && window.AutonomiWallet.signMessage;
    if (!sign) return Promise.reject(new Error("Connect your wallet first."));
    return sign(address, message);
  }

  function showView(list, thread) {
    document.getElementById("community-list-wrap").classList.toggle("hidden", !list);
    document.getElementById("community-thread-wrap").classList.toggle("hidden", !thread);
  }

  function showConnectPrompt(show) {
    var el = document.getElementById("community-connect-prompt");
    var wrap = document.getElementById("community-username-wrap");
    var btn = document.getElementById("community-new-post-btn");
    if (el) el.classList.toggle("hidden", !show);
    if (wrap) wrap.classList.toggle("hidden", show);
    if (btn) btn.classList.toggle("hidden", show);
  }

  function setUsernameDisplay(username) {
    var el = document.getElementById("community-username-current");
    if (el) el.textContent = username ? "Display name: " + username : "Not set — your posts will show a short address.";
  }

  async function loadUsername() {
    var addr = getCurrentAddress();
    if (!addr) return;
    try {
      var res = await fetch(apiUrl("/api/community/me?address=" + encodeURIComponent(addr)));
      var data = await res.json().catch(function() { return {}; });
      setUsernameDisplay(data.username || null);
    } catch (e) {}
  }

  async function loadPosts() {
    var listEl = document.getElementById("community-posts-list");
    if (!listEl) return;
    try {
      var res = await fetch(apiUrl("/api/community/posts"));
      var data = await res.json().catch(function() { return {}; });
      var posts = data.posts || [];
      if (posts.length === 0) {
        listEl.innerHTML = "<p class=\"text-sand-text-muted\">No posts yet. Connect your wallet and create one.</p>";
        return;
      }
      listEl.innerHTML = posts.map(function(p) {
        var date = p.createdAt ? new Date(p.createdAt).toLocaleString() : "";
        return "<a href=\"community.html?post=" + encodeURIComponent(p.id) + "\" class=\"block card p-4 hover:border-sand-orange no-underline text-sand-text\">" +
          "<span class=\"font-heading font-bold text-sand-orange\">" + escapeHtml(p.title) + "</span>" +
          "<p class=\"text-sm text-sand-text-muted m-0 mt-1\">" + escapeHtml(p.authorUsername) + " · " + date + "</p>" +
          "</a>";
      }).join("");
    } catch (e) {
      listEl.innerHTML = "<p class=\"text-sand-text-muted\">Failed to load posts.</p>";
    }
  }

  function escapeHtml(s) {
    if (!s) return "";
    var d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  async function loadThread(postId) {
    var res = await fetch(apiUrl("/api/community/posts/" + encodeURIComponent(postId)));
    var data = await res.json().catch(function() { return {}; });
    var post = data.post;
    var replies = data.replies || [];
    if (!post) {
      showView(true, false);
      loadPosts();
      return;
    }
    showView(false, true);
    var postEl = document.getElementById("community-thread-post");
    postEl.innerHTML = "<h2 class=\"font-heading font-bold text-lg text-sand-text m-0 mb-2\">" + escapeHtml(post.title) + "</h2>" +
      "<p class=\"text-sm text-sand-text-muted m-0 mb-2\">" + escapeHtml(post.authorUsername) + " · " + (post.createdAt ? new Date(post.createdAt).toLocaleString() : "") + "</p>" +
      "<p class=\"text-sand-text m-0 whitespace-pre-wrap\">" + escapeHtml(post.body) + "</p>";

    var repliesEl = document.getElementById("community-thread-replies");
    repliesEl.innerHTML = replies.length === 0
      ? "<p class=\"text-sand-text-muted text-sm\">No replies yet.</p>"
      : replies.map(function(r) {
          return "<div class=\"community-reply card p-4 pl-5\">" +
            "<p class=\"text-sm text-sand-text-muted m-0 mb-1\">" + escapeHtml(r.authorUsername) + " · " + (r.createdAt ? new Date(r.createdAt).toLocaleString() : "") + "</p>" +
            "<p class=\"text-sand-text m-0 whitespace-pre-wrap\">" + escapeHtml(r.body) + "</p></div>";
        }).join("");

    var replyForm = document.getElementById("community-reply-form-wrap");
    if (replyForm) replyForm.classList.toggle("hidden", !isWalletConnectedInHeader());
  }

  function initFromUrl() {
    var postId = new URLSearchParams(window.location.search).get("post");
    if (postId) {
      loadThread(postId);
    } else {
      showView(true, false);
      loadPosts();
    }
  }

  function bindUsername() {
    var btn = document.getElementById("community-username-btn");
    var input = document.getElementById("community-username-input");
    var errEl = document.getElementById("community-username-error");
    if (!btn || !input) return;
    btn.addEventListener("click", async function() {
      var addr = getCurrentAddress();
      if (!addr) {
        if (errEl) { errEl.textContent = "Connect your wallet first."; errEl.classList.remove("hidden"); }
        return;
      }
      var username = input.value.trim();
      if (!username || username.length < 2) {
        if (errEl) { errEl.textContent = "Username must be at least 2 characters."; errEl.classList.remove("hidden"); }
        return;
      }
      if (errEl) errEl.classList.add("hidden");
      btn.disabled = true;
      try {
        var message = buildMessage("community_username", addr);
        var signature = await signMessage(addr, message);
        var res = await fetch(apiUrl("/api/community/username"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, username: username, message: message, signature: signature }),
        });
        var data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
          var msg = data.error || (res.status === 404 ? "API not found. Add ?api=http://localhost:3000 to the URL if the backend runs on port 3000." : "Failed to set username.");
          if (errEl) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
          return;
        }
        setUsernameDisplay(username);
        input.value = "";
      } catch (e) {
        if (errEl) { errEl.textContent = e && e.message ? e.message : "Request failed"; errEl.classList.remove("hidden"); }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function bindNewPost() {
    var openBtn = document.getElementById("community-new-post-btn");
    var wrap = document.getElementById("community-new-post-wrap");
    var cancelBtn = document.getElementById("community-new-post-cancel");
    var submitBtn = document.getElementById("community-new-post-submit");
    var titleInput = document.getElementById("community-new-post-title");
    var bodyInput = document.getElementById("community-new-post-body");
    var errEl = document.getElementById("community-new-post-error");
    if (!openBtn || !wrap) return;

    openBtn.addEventListener("click", function() {
      wrap.classList.remove("hidden");
      if (titleInput) titleInput.value = "";
      if (bodyInput) bodyInput.value = "";
      if (errEl) errEl.classList.add("hidden");
    });
    cancelBtn && cancelBtn.addEventListener("click", function() { wrap.classList.add("hidden"); });

    submitBtn && submitBtn.addEventListener("click", async function() {
      var addr = getCurrentAddress();
      if (!addr) {
        if (errEl) { errEl.textContent = "Connect your wallet first."; errEl.classList.remove("hidden"); }
        return;
      }
      var title = titleInput ? titleInput.value.trim() : "";
      var body = bodyInput ? bodyInput.value.trim() : "";
      if (!title) {
        if (errEl) { errEl.textContent = "Enter a title."; errEl.classList.remove("hidden"); }
        return;
      }
      if (errEl) errEl.classList.add("hidden");
      submitBtn.disabled = true;
      try {
        var message = buildMessage("community_post", addr);
        var signature = await signMessage(addr, message);
        var res = await fetch(apiUrl("/api/community/posts"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, title: title, body: body, message: message, signature: signature }),
        });
        var data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
          var msg = data.error || (res.status === 404 ? "API not found. Add ?api=http://localhost:3000 to the URL if the backend runs on port 3000." : "Failed to create post.");
          if (errEl) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
          return;
        }
        wrap.classList.add("hidden");
        loadPosts();
      } catch (e) {
        if (errEl) { errEl.textContent = e && e.message ? e.message : "Request failed"; errEl.classList.remove("hidden"); }
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function bindReply() {
    var btn = document.getElementById("community-reply-btn");
    var bodyEl = document.getElementById("community-reply-body");
    var errEl = document.getElementById("community-reply-error");
    if (!btn || !bodyEl) return;
    btn.addEventListener("click", async function() {
      var postId = new URLSearchParams(window.location.search).get("post");
      if (!postId) return;
      var addr = getCurrentAddress();
      if (!addr) {
        if (errEl) { errEl.textContent = "Connect your wallet first."; errEl.classList.remove("hidden"); }
        return;
      }
      var body = bodyEl.value.trim();
      if (!body) {
        if (errEl) { errEl.textContent = "Enter a reply."; errEl.classList.remove("hidden"); }
        return;
      }
      if (errEl) errEl.classList.add("hidden");
      btn.disabled = true;
      try {
        var message = buildMessage("community_reply", addr);
        var signature = await signMessage(addr, message);
        var res = await fetch(apiUrl("/api/community/posts/" + encodeURIComponent(postId) + "/replies"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ address: addr, body: body, message: message, signature: signature }),
        });
        var data = await res.json().catch(function() { return {}; });
        if (!res.ok) {
          var msg = data.error || (res.status === 404 ? "API not found. Add ?api=http://localhost:3000 to the URL if the backend runs on port 3000." : "Failed to post reply.");
          if (errEl) { errEl.textContent = msg; errEl.classList.remove("hidden"); }
          return;
        }
        bodyEl.value = "";
        loadThread(postId);
      } catch (e) {
        if (errEl) { errEl.textContent = e && e.message ? e.message : "Request failed"; errEl.classList.remove("hidden"); }
      } finally {
        btn.disabled = false;
      }
    });
  }

  function updateUI() {
    var connected = isWalletConnectedInHeader();
    showConnectPrompt(!connected);
    if (connected) {
      loadUsername();
    }
    var threadVisible = !document.getElementById("community-thread-wrap").classList.contains("hidden");
    if (!threadVisible) loadPosts();
  }

  function init() {
    updateUI();
    bindUsername();
    bindNewPost();
    bindReply();
    initFromUrl();
    document.addEventListener("autonomi:wallet-change", function() {
      updateUI();
      var postId = new URLSearchParams(window.location.search).get("post");
      if (postId) loadThread(postId);
      else loadPosts();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() { setTimeout(init, 0); });
  } else {
    setTimeout(init, 0);
  }
})();

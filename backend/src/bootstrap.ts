/**
 * Entry point that logs immediately so we see output even if later imports hang.
 * Run: node dist/bootstrap.js (or point "main" / dev script here).
 */
console.log("[server] Starting Autonomi backend...");
await import("./index.js");

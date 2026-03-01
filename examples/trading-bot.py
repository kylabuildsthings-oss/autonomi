#!/usr/bin/env python3
"""
Example: Trading Bot Integration — Use Case 2

A Python trading bot uses Autonomi for risk management. When the agent
rebalances a position, the bot receives a webhook and can adjust strategy.

Requires:
  - pip install httpx
  - API key (create via POST /api/v1/auth/keys)
  - A public URL for webhooks (e.g. ngrok: ngrok http 9090)

Run:
  export AUTONOMI_API_KEY=ak_xxx
  export WEBHOOK_BASE_URL=https://your-ngrok-url.ngrok.io   # must be reachable by the backend
  python examples/trading-bot.py

Or run the server only (after registering a webhook elsewhere):
  python examples/trading-bot.py --listen-only --port 9090
"""

from __future__ import annotations

import argparse
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any, Callable, Optional

try:
    import httpx
except ImportError:
    print("Install httpx: pip install httpx", file=sys.stderr)
    sys.exit(1)

import argparse
import json
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path

# Repo root (examples/ is one level down)
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "sdk" / "python"))
try:
    from autonomi_client import AutonomiClient
except ImportError:
    AutonomiClient = None  # type: ignore


class Autonomi:
    """
    Trading-bot integration: register rebalance (and other) handlers and
    receive webhooks from the Autonomi backend.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "http://localhost:3000",
        webhook_base_url: Optional[str] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.webhook_base_url = (webhook_base_url or "").rstrip("/")
        self._client = AutonomiClient(base_url=base_url, api_key=api_key) if AutonomiClient else None
        self._on_rebalance: Optional[Callable[[dict[str, Any]], None]] = None
        self._on_warning: Optional[Callable[[dict[str, Any]], None]] = None
        self._on_price: Optional[Callable[[dict[str, Any]], None]] = None

    def on_rebalance(self, f: Callable[[dict[str, Any]], None]) -> Callable[[dict[str, Any]], None]:
        """Register a handler for rebalance events. Called when the agent runs autoRebalance."""
        self._on_rebalance = f
        return f

    def on_warning(self, f: Callable[[dict[str, Any]], None]) -> Callable[[dict[str, Any]], None]:
        """Register a handler for LTV warning events (e.g. LTV >= 65%)."""
        self._on_warning = f
        return f

    def on_price(self, f: Callable[[dict[str, Any]], None]) -> Callable[[dict[str, Any]], None]:
        """Register a handler for large price move events (>10%)."""
        self._on_price = f
        return f

    def _normalize_rebalance(self, data: dict[str, Any]) -> dict[str, Any]:
        """Map API webhook payload to a strategy-friendly shape."""
        old_bps = data.get("oldLTVBps") or 0
        new_bps = data.get("newLTVBps") or 0
        return {
            "user": data.get("user", ""),
            "txHash": data.get("txHash", ""),
            "oldLTV": old_bps / 100.0,
            "newLTV": new_bps / 100.0,
            "repaid": data.get("borrowed"),  # API does not return repaid amount; use borrowed as proxy
            "collateral": data.get("collateral"),
            "borrowed": data.get("borrowed"),
            "price": data.get("price"),
            "contractAddress": data.get("contractAddress"),
            "chainId": data.get("chainId"),
        }

    def _handle_webhook(self, body: bytes) -> tuple[int, str]:
        """Parse webhook body and dispatch to registered handlers. Returns (status_code, response)."""
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            return 400, "Invalid JSON"
        event = payload.get("event")
        data = payload.get("data") or {}
        if event == "rebalance" and self._on_rebalance:
            self._on_rebalance(self._normalize_rebalance(data))
        elif event == "warning" and self._on_warning:
            self._on_warning(data)
        elif event == "price" and self._on_price:
            self._on_price(data)
        return 200, "OK"

    def register_webhook(self, url: str, events: list[str]) -> dict[str, Any]:
        """Register a webhook URL for the given events. Requires AutonomiClient."""
        if not self._client:
            raise RuntimeError("AutonomiClient not available; add sdk/python to path")
        return self._client.create_webhook(url=url, events=events)

    def run_webhook_server(
        self,
        port: int = 9090,
        host: str = "0.0.0.0",
        path: str = "/",
    ) -> None:
        """Start an HTTP server that receives webhooks and calls your handlers. Optionally register the webhook with the API if WEBHOOK_BASE_URL is set."""
        that = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):
                if self.path != path and self.path.rstrip("/") != path.rstrip("/"):
                    self.send_response(404)
                    self.end_headers()
                    return
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length)
                status, msg = that._handle_webhook(body)
                self.send_response(status)
                self.send_header("Content-Type", "text/plain")
                self.end_headers()
                self.wfile.write(msg.encode("utf-8"))

            def log_message(self, format: str, *args: Any) -> None:
                print(f"[webhook] {args[0]}")

        if self.webhook_base_url and self._client:
            webhook_url = f"{self.webhook_base_url.rstrip('/')}{path}"
            try:
                res = self.register_webhook(webhook_url, ["rebalance", "warning", "price"])
                print(f"[Autonomi] Registered webhook: {webhook_url}")
                if res.get("data", {}).get("secret"):
                    print("[Autonomi] Store the webhook secret to verify X-Webhook-Signature")
            except Exception as e:
                print(f"[Autonomi] Webhook registration failed: {e}", file=sys.stderr)

        server = HTTPServer((host, port), Handler)
        print(f"[Autonomi] Webhook server listening on http://{host}:{port}{path}")
        server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description="Trading bot webhook receiver")
    parser.add_argument("--port", type=int, default=9090, help="Port for webhook server")
    parser.add_argument("--listen-only", action="store_true", help="Do not register webhook; only run server")
    args = parser.parse_args()

    api_key = __import__("os").environ.get("AUTONOMI_API_KEY") or "auto_live_sk_xxxxx"
    base_url = __import__("os").environ.get("AUTONOMI_API_URL") or "http://localhost:3000"
    webhook_base = None if args.listen_only else __import__("os").environ.get("WEBHOOK_BASE_URL")

    if not args.listen_only and not webhook_base:
        print("Set WEBHOOK_BASE_URL (e.g. https://xxx.ngrok.io) so the backend can POST to your server.", file=sys.stderr)
        print("Or run with --listen-only and register the webhook manually via the API.", file=sys.stderr)

    client = Autonomi(api_key, base_url=base_url, webhook_base_url=webhook_base)

    @client.on_rebalance
    def handle_rebalance(data: dict[str, Any]) -> None:
        print(f"Position rebalanced: {data.get('borrowed')} USDC borrowed (repaid proxy); new LTV: {data.get('newLTV')}%")
        adjust_strategy(data["newLTV"])

    def adjust_strategy(new_ltv: float) -> None:
        """Implement your strategy adjustment (e.g. reduce exposure when LTV rises)."""
        print(f"  -> Adjust strategy for new LTV: {new_ltv}%")

    client.run_webhook_server(port=args.port)


if __name__ == "__main__":
    main()

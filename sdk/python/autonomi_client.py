"""
Autonomi API client — minimal sync client for the Autonomi REST API v1.
Install: pip install httpx
Usage:
  from autonomi_client import AutonomiClient
  client = AutonomiClient(base_url="http://localhost:3000")
  health = client.get_health()
  position = client.get_position("0x...")
  # With API key:
  client = AutonomiClient(base_url="...", api_key="ak_...")
  keys = client.list_webhooks()
"""

from __future__ import annotations

import json
from typing import Any, Optional

try:
    import httpx
except ImportError:
    raise ImportError("Install httpx: pip install httpx") from None


class AutonomiClient:
    """Sync client for Autonomi REST API v1."""

    def __init__(
        self,
        base_url: str = "http://localhost:3000",
        api_key: Optional[str] = None,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def _headers(self, json_body: bool = True) -> dict[str, str]:
        h: dict[str, str] = {}
        if json_body:
            h["Content-Type"] = "application/json"
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[dict[str, Any]] = None,
        json: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        with httpx.Client(timeout=self.timeout) as client:
            r = client.request(
                method,
                url,
                params=params,
                json=json,
                headers=self._headers(json_body=json is not None or method in ("POST", "PATCH")),
            )
            r.raise_for_status()
            if r.content:
                return r.json()
            return {}

    # Health & market
    def get_health(self) -> dict[str, Any]:
        """GET /api/v1/health"""
        return self._request("GET", "/api/v1/health")

    def get_market(self) -> dict[str, Any]:
        """GET /api/v1/market"""
        return self._request("GET", "/api/v1/market")

    # Positions
    def get_position(self, address: str) -> dict[str, Any]:
        """GET /api/v1/positions/{address}"""
        return self._request("GET", f"/api/v1/positions/{address}")

    def get_positions_batch(self, addresses: list[str]) -> dict[str, Any]:
        """GET /api/v1/positions?addresses=..."""
        return self._request("GET", "/api/v1/positions", params={"addresses": ",".join(addresses)})

    # Agent & monitoring
    def get_agent(self) -> dict[str, Any]:
        """GET /api/v1/agent"""
        return self._request("GET", "/api/v1/agent")

    def get_monitoring_health(self) -> dict[str, Any]:
        """GET /api/v1/monitoring/health"""
        return self._request("GET", "/api/v1/monitoring/health")

    def get_monitoring_ready(self) -> dict[str, Any]:
        """GET /api/v1/monitoring/ready"""
        return self._request("GET", "/api/v1/monitoring/ready")

    def get_monitoring_status(self) -> dict[str, Any]:
        """GET /api/v1/monitoring/status"""
        return self._request("GET", "/api/v1/monitoring/status")

    # Analytics
    def get_analytics_overview(self) -> dict[str, Any]:
        """GET /api/v1/analytics/overview"""
        return self._request("GET", "/api/v1/analytics/overview")

    def get_analytics_webhooks(self, hours: int = 24) -> dict[str, Any]:
        """GET /api/v1/analytics/webhooks"""
        return self._request("GET", "/api/v1/analytics/webhooks", params={"hours": hours})

    def get_analytics_usage(self, days: int = 7) -> dict[str, Any]:
        """GET /api/v1/analytics/usage"""
        return self._request("GET", "/api/v1/analytics/usage", params={"days": days})

    # Auth (no API key required for create/list keys by address)
    def get_auth_me(self) -> dict[str, Any]:
        """GET /api/v1/auth/me — requires API key."""
        return self._request("GET", "/api/v1/auth/me")

    def create_api_key(
        self,
        user_address: str,
        name: str = "API Key",
        permissions: str = "read",
        rate_limit: int = 100,
    ) -> dict[str, Any]:
        """POST /api/v1/auth/keys"""
        return self._request(
            "POST",
            "/api/v1/auth/keys",
            json={
                "user_address": user_address,
                "name": name,
                "permissions": permissions,
                "rate_limit": rate_limit,
            },
        )

    def list_api_keys(self, address: str) -> dict[str, Any]:
        """GET /api/v1/auth/keys?address=..."""
        return self._request("GET", "/api/v1/auth/keys", params={"address": address})

    def revoke_api_key(self, key_id: str, address: str) -> dict[str, Any]:
        """DELETE /api/v1/auth/keys/{id}?address=..."""
        return self._request("DELETE", f"/api/v1/auth/keys/{key_id}", params={"address": address})

    # Webhooks (require API key)
    def create_webhook(
        self,
        url: str,
        events: list[str],
        secret: Optional[str] = None,
    ) -> dict[str, Any]:
        """POST /api/v1/webhooks — events: ['rebalance','warning','price']"""
        body: dict[str, Any] = {"url": url, "events": events}
        if secret is not None:
            body["secret"] = secret
        return self._request("POST", "/api/v1/webhooks", json=body)

    def list_webhooks(self) -> dict[str, Any]:
        """GET /api/v1/webhooks"""
        return self._request("GET", "/api/v1/webhooks")

    def get_webhook(self, webhook_id: str) -> dict[str, Any]:
        """GET /api/v1/webhooks/{id}"""
        return self._request("GET", f"/api/v1/webhooks/{webhook_id}")

    def update_webhook(
        self,
        webhook_id: str,
        url: Optional[str] = None,
        events: Optional[list[str]] = None,
        active: Optional[bool] = None,
    ) -> dict[str, Any]:
        """PATCH /api/v1/webhooks/{id}"""
        body: dict[str, Any] = {}
        if url is not None:
            body["url"] = url
        if events is not None:
            body["events"] = events
        if active is not None:
            body["active"] = active
        return self._request("PATCH", f"/api/v1/webhooks/{webhook_id}", json=body)

    def delete_webhook(self, webhook_id: str) -> dict[str, Any]:
        """DELETE /api/v1/webhooks/{id}"""
        return self._request("DELETE", f"/api/v1/webhooks/{webhook_id}")

    def list_webhook_deliveries(self, webhook_id: str, limit: int = 50) -> dict[str, Any]:
        """GET /api/v1/webhooks/{id}/deliveries"""
        return self._request(
            "GET",
            f"/api/v1/webhooks/{webhook_id}/deliveries",
            params={"limit": limit},
        )

    # Alerts (SMS)
    def get_alerts_status(self, address: str) -> dict[str, Any]:
        """GET /api/v1/alerts/status?address=..."""
        return self._request("GET", "/api/v1/alerts/status", params={"address": address})

    def register_alerts(
        self,
        address: str,
        phone: str,
        preferences: Optional[dict[str, bool]] = None,
    ) -> dict[str, Any]:
        """POST /api/v1/alerts/register"""
        body: dict[str, Any] = {"address": address, "phone": phone}
        if preferences is not None:
            body["preferences"] = preferences
        return self._request("POST", "/api/v1/alerts/register", json=body)

    def update_alert_preferences(self, address: str, preferences: dict[str, bool]) -> dict[str, Any]:
        """POST /api/v1/alerts/preferences"""
        return self._request("POST", "/api/v1/alerts/preferences", json={"address": address, "preferences": preferences})

    def send_test_alert(self, address: str) -> dict[str, Any]:
        """POST /api/v1/alerts/test"""
        return self._request("POST", "/api/v1/alerts/test", json={"address": address})

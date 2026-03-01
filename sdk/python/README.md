# Autonomi Python client

Minimal sync client for the [Autonomi REST API](https://github.com/kylabuildsthings-oss/autonomi).

## Install

```bash
pip install -r requirements.txt
# or: pip install httpx
```

## Usage

```python
from autonomi_client import AutonomiClient

# Default base URL is http://localhost:3000
client = AutonomiClient()

# Health and market
health = client.get_health()
market = client.get_market()

# Position for one address
position = client.get_position("0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515")

# Batch positions (max 20 addresses)
positions = client.get_positions_batch(["0x...", "0x..."])

# With API key (for webhooks, auth/me, etc.)
client = AutonomiClient(base_url="https://api.example.com", api_key="ak_xxx")
me = client.get_auth_me()
webhooks = client.list_webhooks()
```

All methods return the decoded JSON response (the full v1 envelope with `success`, `data`, `error`, `meta`). Raise-for-status is enabled: non-2xx responses raise `httpx.HTTPStatusError`.

## Regenerate from OpenAPI (optional)

To regenerate a client from the OpenAPI spec instead of using this hand-written client:

```bash
pip install openapi-python-client
openapi-python-client generate --path ../../backend/openapi.json --output . --overwrite
```

(Export the spec first from the backend: `cd backend && npm run build && node scripts/export-openapi.mjs`.)

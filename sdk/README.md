# Autonomi client SDKs

Client libraries for the [Autonomi REST API](https://github.com/kylabuildsthings-oss/autonomi) (autonomous lending protection on Arc).

## TypeScript / JavaScript

Generated from the OpenAPI spec with [@hey-api/openapi-ts](https://github.com/hey-api/openapi-ts). Uses fetch and returns typed responses.

### Install

From the repo root (or copy `sdk/typescript` into your project):

```bash
cd sdk/typescript
npm install
```

Or link the folder and depend on it; the client has no hard dependency except the built-in fetch (Node 18+ or browser).

### Use

```ts
import { getApiV1Health, getApiV1PositionsByAddress, setConfig } from './sdk/typescript';
// Or from within the sdk/typescript directory:
// import { getApiV1Health, getApiV1PositionsByAddress } from '.';

// Optional: set base URL (default is http://localhost:3000)
import { client } from './sdk/typescript/client.gen';
client.setConfig({ baseUrl: 'https://api.example.com' });

const health = await getApiV1Health();
const position = await getApiV1PositionsByAddress({ path: { address: '0x...' } });
```

For authenticated endpoints (webhooks, auth/me), set the API key on the client:

```ts
import { client } from './sdk/typescript/client.gen';
client.setConfig({
  baseUrl: 'https://api.example.com',
  security: { bearerAuth: 'ak_your_api_key' },
});
// Then call getApiV1Webhooks(), getApiV1AuthMe(), etc.
```

### Regenerate

From the backend directory:

```bash
cd backend
npm run build
node scripts/export-openapi.mjs
npx @hey-api/openapi-ts -i openapi.json -o ../sdk/typescript
```

---

## Python

Hand-written sync client using [httpx](https://www.python-httpx.org/). No codegen required.

### Install

```bash
cd sdk/python
pip install -r requirements.txt
```

### Use

```python
from autonomi_client import AutonomiClient

client = AutonomiClient(base_url="http://localhost:3000")
health = client.get_health()
position = client.get_position("0x6C9365Ca168953BEEE77Cd8332a1d3B5Ae557515")

# With API key
client = AutonomiClient(base_url="https://api.example.com", api_key="ak_xxx")
webhooks = client.list_webhooks()
```

See [sdk/python/README.md](python/README.md) for full method list and optional codegen steps.

---

## OpenAPI spec

The backend serves the spec at **GET /api/v1/openapi.json**. A static copy is written to `backend/openapi.json` when you run:

```bash
cd backend && npm run build && node scripts/export-openapi.mjs
```

You can use this file with any OpenAPI-based code generator (e.g. OpenAPI Generator, oapi-codegen for Go, etc.) to produce clients for other languages.

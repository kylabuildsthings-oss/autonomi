/**
 * OpenAPI 3.0 spec for Autonomi REST API v1.
 * Served at GET /api/v1/openapi.json
 * Interactive docs: GET /api/v1/docs
 */
export const openApiV1 = {
  openapi: "3.0.3",
  info: {
    title: "Autonomi API",
    description:
      "REST API for autonomous lending protection on Arc. Integrate position data, agent status, SMS alerts, and webhooks into your application.\n\n" +
      "**Response envelope:** All responses use `{ success: boolean, data?: object, error?: string, meta: { version, timestamp } }`. On success, `data` holds the result; on error, `error` and optionally `data` hold details.",
    version: "1.0.0",
    contact: { name: "Autonomi" },
    license: { name: "ISC" },
  },
  servers: [
    { url: "http://localhost:3000", description: "Local" },
    { url: "https://api.autonomi.example.com", description: "Production (example)" },
  ],
  tags: [
    { name: "Health", description: "Health and version" },
    { name: "Market", description: "USYC price and contract info" },
    { name: "Positions", description: "User positions and batch" },
    { name: "Agent", description: "Rebalance agent status" },
    { name: "Monitoring", description: "Deep health, readiness, status" },
    { name: "Analytics", description: "Counts and usage stats" },
    { name: "Auth", description: "API key management" },
    { name: "Webhooks", description: "Webhook registration and deliveries" },
    { name: "Alerts", description: "SMS alert registration" },
    { name: "Documentation", description: "OpenAPI spec" },
  ],
  paths: {
    "/api/v1/health": {
      get: {
        tags: ["Health"],
        summary: "Health check",
        description: "Service health and version.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        status: { type: "string", example: "ok" },
                        version: { type: "string" },
                        service: { type: "string" },
                        contractAddress: { type: "string" },
                        chainId: { type: "number" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/market": {
      get: {
        tags: ["Market"],
        summary: "Market data",
        description: "USYC price and contract info.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        usycPrice: { type: "string" },
                        contractAddress: { type: "string" },
                        chainId: { type: "number" },
                        chainName: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/positions/{address}": {
      get: {
        tags: ["Positions"],
        summary: "Get position by address",
        description: "Position and USYC price for a single wallet address.",
        parameters: [
          { name: "address", in: "path", required: true, schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        address: { type: "string" },
                        usycPrice: { type: "string" },
                        position: {
                          type: "object",
                          nullable: true,
                          properties: {
                            usycDeposited: { type: "string" },
                            usdcBorrowed: { type: "string" },
                            ltvBps: { type: "number" },
                            active: { type: "boolean" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid address" },
        },
      },
    },
    "/api/v1/positions": {
      get: {
        tags: ["Positions"],
        summary: "Get positions (batch)",
        description: "Positions and USYC price for multiple wallet addresses. Query: addresses=0x...,0x... (max 20).",
        parameters: [
          { name: "addresses", in: "query", required: true, schema: { type: "string", description: "Comma-separated list of 0x addresses" } },
        ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        usycPrice: { type: "string" },
                        positions: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              address: { type: "string" },
                              position: {
                                type: "object",
                                nullable: true,
                                properties: {
                                  usycDeposited: { type: "string" },
                                  usdcBorrowed: { type: "string" },
                                  ltvBps: { type: "number" },
                                  active: { type: "boolean" },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Missing or invalid addresses" },
        },
      },
    },
    "/api/v1/agent": {
      get: {
        tags: ["Agent"],
        summary: "Agent status",
        description: "Whether the autonomous rebalance agent is running.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        running: { type: "boolean" },
                        contractAddress: { type: "string", nullable: true },
                        watchedAddressesCount: { type: "number", nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/stats": {
      get: {
        tags: ["Market"],
        summary: "Dashboard stats",
        description: "Aggregate stats for the dashboard: TVL (monitored positions), active users, USYC yield, Arc settlement.",
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        tvl: {
                          type: "object",
                          properties: {
                            valueUsd: { type: "number" },
                            changePct: { type: "number", nullable: true },
                            formatted: { type: "string" },
                          },
                        },
                        users: {
                          type: "object",
                          properties: {
                            total: { type: "number" },
                            monitored: { type: "number" },
                          },
                        },
                        yield: {
                          type: "object",
                          properties: {
                            value: { type: "number" },
                            formatted: { type: "string" },
                            source: { type: "string" },
                          },
                        },
                        arc: {
                          type: "object",
                          properties: {
                            settlement: { type: "string" },
                            blockTime: { type: "string" },
                            finality: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/monitoring/health": {
      get: {
        tags: ["Monitoring"],
        summary: "Deep health check",
        description: "Runs DB and RPC checks. Returns 200 when ok, 503 when degraded.",
        responses: {
          "200": { description: "All checks passed" },
          "503": { description: "One or more checks failed (degraded)" },
        },
      },
    },
    "/api/v1/monitoring/ready": {
      get: {
        tags: ["Monitoring"],
        summary: "Readiness probe",
        description: "Returns 200 if DB and RPC are reachable, 503 otherwise. Use for Kubernetes readinessProbe.",
        responses: {
          "200": { description: "Ready to accept traffic" },
          "503": { description: "Not ready" },
        },
      },
    },
    "/api/v1/monitoring/status": {
      get: {
        tags: ["Monitoring"],
        summary: "Aggregate status",
        description: "Combined view for dashboards: health checks, agent state, version, contract, chain.",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/v1/analytics/overview": {
      get: {
        tags: ["Analytics"],
        summary: "Analytics overview",
        description: "Aggregate counts: API keys, webhooks, webhook deliveries, SMS registrations, agent state.",
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/v1/analytics/webhooks": {
      get: {
        tags: ["Analytics"],
        summary: "Webhook delivery stats",
        description: "Delivery counts by event and recent window. Query: hours=24 (default).",
        parameters: [{ name: "hours", in: "query", schema: { type: "integer", default: 24 } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/v1/analytics/usage": {
      get: {
        tags: ["Analytics"],
        summary: "API key usage stats",
        description: "Total keys and count with recent use. Query: days=7 (default).",
        parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 7 } }],
        responses: { "200": { description: "OK" } },
      },
    },
    "/api/v1/alerts/status": {
      get: {
        tags: ["Alerts"],
        summary: "SMS alert status",
        parameters: [{ name: "address", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "400": { description: "Invalid address" } },
      },
    },
    "/api/v1/alerts/register": {
      post: {
        tags: ["Alerts"],
        summary: "Register phone for SMS alerts",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["address", "phone"],
                properties: {
                  address: { type: "string" },
                  phone: { type: "string" },
                  preferences: { type: "object" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Registered" }, "400": { description: "Invalid input" } },
      },
    },
    "/api/v1/alerts/preferences": {
      post: {
        tags: ["Alerts"],
        summary: "Update SMS preferences",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["address", "preferences"],
                properties: {
                  address: { type: "string" },
                  preferences: { type: "object" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" }, "404": { description: "Not registered" } },
      },
    },
    "/api/v1/alerts/test": {
      post: {
        tags: ["Alerts"],
        summary: "Send test SMS",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["address"],
                properties: { address: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Sent or error in body" }, "404": { description: "Not registered" } },
      },
    },
    "/api/v1/openapi.json": {
      get: {
        tags: ["Documentation"],
        summary: "OpenAPI spec",
        description: "This specification (JSON).",
        responses: { "200": { description: "OpenAPI 3.0 JSON" } },
      },
    },
    "/api/v1/docs": {
      get: {
        tags: ["Documentation"],
        summary: "Interactive API docs",
        description: "Swagger UI for exploring and trying the API.",
        responses: { "200": { description: "HTML (Swagger UI)" } },
      },
    },
    "/api/v1/auth/me": {
      get: {
        tags: ["Auth"],
        summary: "Current API key identity",
        description: "Validate Bearer token and return key metadata. Header: Authorization: Bearer <api_key>.",
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        user_address: { type: "string" },
                        permissions: { type: "string" },
                        rate_limit: { type: "number" },
                        name: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": { description: "Missing or invalid API key" },
        },
      },
    },
    "/api/v1/auth/keys": {
      post: {
        tags: ["Auth"],
        summary: "Create API key",
        description: "Create an API key for a wallet address. The raw key is returned only once.",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["user_address"],
                properties: {
                  name: { type: "string", example: "My App" },
                  user_address: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" },
                  permissions: { type: "string", default: "read" },
                  rate_limit: { type: "number", default: 100 },
                  expires_at: { type: "string", format: "date-time", nullable: true },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        rawKey: { type: "string", description: "Store securely; not returned again" },
                        name: { type: "string" },
                        user_address: { type: "string" },
                        permissions: { type: "string" },
                        rate_limit: { type: "number" },
                        created_at: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid or missing user_address" },
        },
      },
      get: {
        tags: ["Auth"],
        summary: "List API keys",
        description: "List API keys for a wallet address. Query: address=0x...",
        parameters: [{ name: "address", in: "query", required: true, schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" } }],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean" },
                    data: {
                      type: "object",
                      properties: {
                        keys: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              id: { type: "string" },
                              name: { type: "string" },
                              user_address: { type: "string" },
                              permissions: { type: "string" },
                              rate_limit: { type: "number" },
                              created_at: { type: "string" },
                              last_used: { type: "string", nullable: true },
                              expires_at: { type: "string", nullable: true },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          "400": { description: "Invalid or missing address" },
        },
      },
    },
    "/api/v1/auth/keys/{id}": {
      delete: {
        tags: ["Auth"],
        summary: "Revoke API key",
        description: "Delete an API key. Query: address=0x... (must own the key).",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "address", in: "query", required: true, schema: { type: "string", pattern: "^0x[a-fA-F0-9]{40}$" } },
        ],
        responses: {
          "200": { description: "Revoked" },
          "400": { description: "Invalid or missing address" },
          "404": { description: "Key not found or not owned by address" },
        },
      },
    },
    "/api/v1/webhooks": {
      post: {
        tags: ["Webhooks"],
        summary: "Create webhook",
        description: "Register a webhook URL for events. Requires Bearer API key. Events: rebalance, warning, price. Secret returned only on create. When events occur, Autonomi POSTs to the URL with JSON envelope: { event, timestamp, data }. Headers include X-Webhook-Event, X-Webhook-ID, and optionally X-Webhook-Signature (HMAC-SHA256 of body with secret).",
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["url", "events"],
                properties: {
                  url: { type: "string", format: "uri", example: "https://example.com/webhook" },
                  events: { type: "array", items: { type: "string", enum: ["rebalance", "warning", "price"] } },
                  secret: { type: "string", description: "Optional; generated if omitted" },
                },
              },
            },
          },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Invalid url or events" }, "401": { description: "Invalid API key" } },
      },
      get: {
        tags: ["Webhooks"],
        summary: "List webhooks",
        description: "List webhooks for the current API key.",
        security: [{ bearerAuth: [] }],
        responses: { "200": { description: "OK" }, "401": { description: "Invalid API key" } },
      },
    },
    "/api/v1/webhooks/{id}": {
      get: {
        tags: ["Webhooks"],
        summary: "Get webhook",
        description: "Get one webhook by id.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "OK" }, "401": { description: "Invalid API key" }, "404": { description: "Webhook not found" } },
      },
      patch: {
        tags: ["Webhooks"],
        summary: "Update webhook",
        description: "Update url, events, or active.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  url: { type: "string", format: "uri" },
                  events: { type: "array", items: { type: "string", enum: ["rebalance", "warning", "price"] } },
                  active: { type: "boolean" },
                },
              },
            },
          },
        },
        responses: { "200": { description: "Updated" }, "401": { description: "Invalid API key" }, "404": { description: "Webhook not found" } },
      },
      delete: {
        tags: ["Webhooks"],
        summary: "Delete webhook",
        description: "Remove a webhook.",
        security: [{ bearerAuth: [] }],
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Deleted" }, "401": { description: "Invalid API key" }, "404": { description: "Webhook not found" } },
      },
    },
    "/api/v1/webhooks/{id}/deliveries": {
      get: {
        tags: ["Webhooks"],
        summary: "List webhook deliveries",
        description: "Recent delivery attempts for a webhook. Query: limit=50.",
        security: [{ bearerAuth: [] }],
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", schema: { type: "integer", default: 50 } },
        ],
        responses: { "200": { description: "OK" }, "401": { description: "Invalid API key" }, "404": { description: "Webhook not found" } },
      },
    },
  },
  components: {
    schemas: {
      ApiV1Envelope: {
        type: "object",
        description: "Standard v1 response envelope",
        properties: {
          success: { type: "boolean" },
          data: { type: "object", description: "Response payload on success" },
          error: { type: "string", description: "Error message when success is false" },
          meta: {
            type: "object",
            properties: {
              version: { type: "string" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API Key",
        description: "Raw API key (created via POST /api/v1/auth/keys)",
      },
    },
  },
} as const;

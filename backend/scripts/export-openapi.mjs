#!/usr/bin/env node
/**
 * Export OpenAPI spec to JSON for SDK generation. Run from backend: node scripts/export-openapi.mjs
 * Requires backend to be built first (dist/api/openapi.js).
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const specPath = join(root, "openapi.json");

const { openApiV1 } = await import(join(root, "dist", "api", "openapi.js"));
writeFileSync(specPath, JSON.stringify(openApiV1, null, 2), "utf8");
console.log("Wrote", specPath);

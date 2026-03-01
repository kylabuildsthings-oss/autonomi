#!/usr/bin/env node
/**
 * Initialize SQLite DB and apply schema. Run from backend: node scripts/init-db.mjs
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dbPath = join(root, "data", "autonomi.db");
const schemaPath = join(root, "db", "schema.sqlite.sql");

const dir = dirname(dbPath);
if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
const sql = readFileSync(schemaPath, "utf8");
db.exec(sql);
db.close();
console.log("DB initialized at", dbPath);

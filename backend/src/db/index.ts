/**
 * SQLite database for API keys, webhooks, and webhook deliveries.
 * Schema is applied automatically on first open (db/schema.sqlite.sql).
 */
import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DEFAULT_DB_PATH = join(process.cwd(), "data", "autonomi.db");

let db: Database.Database | null = null;

function getSchemaPath(): string {
  // From dist/db/index.js we need backend/db/schema.sqlite.sql
  const fromDist = join(__dirname, "..", "..", "db", "schema.sqlite.sql");
  const fromSrc = join(process.cwd(), "db", "schema.sqlite.sql");
  if (existsSync(fromDist)) return fromDist;
  return fromSrc;
}

function applySchema(database: Database.Database): void {
  const schemaPath = getSchemaPath();
  try {
    const sql = readFileSync(schemaPath, "utf8");
    database.exec(sql);
  } catch (e) {
    console.error("[db] Failed to apply schema from", schemaPath, e);
    throw e;
  }
}

/**
 * Open the SQLite database and apply schema if needed. Uses DATA_DIR/autonomi.db
 * (DATA_DIR defaults to backend/data). Safe to call multiple times; returns same instance.
 */
export function getDb(dbPath: string = DEFAULT_DB_PATH): Database.Database {
  if (db) return db;
  const dir = dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL");
  applySchema(database);
  db = database;
  return db;
}

/**
 * Close the database (e.g. for tests or graceful shutdown). After this, getDb() will open again.
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export type { Database };

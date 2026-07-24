import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import type { OperationalTwinState, PersistenceStatus } from "../twin-core/types";

interface SqliteStatement {
  run(...values: unknown[]): unknown;
  get(...values: unknown[]): unknown;
  all(...values: unknown[]): unknown[];
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface SqliteModule {
  DatabaseSync: new (path: string) => SqliteDatabase;
}

const require = createRequire(import.meta.url);
const DEFAULT_DATABASE_PATH = resolve(process.cwd(), ".data", "medroutex.sqlite");

function enabled(): boolean {
  return process.env.MEDROUTEX_SQLITE_ENABLED?.trim().toLowerCase() === "true";
}

export function configuredDatabasePath(): string {
  return resolve(process.env.MEDROUTEX_SQLITE_PATH?.trim() || DEFAULT_DATABASE_PATH);
}

function openDatabase(): SqliteDatabase {
  const path = configuredDatabasePath();
  mkdirSync(dirname(path), { recursive: true });
  const sqlite = require("node:sqlite") as SqliteModule;
  const database = new sqlite.DatabaseSync(path);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS twin_state_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      state_version INTEGER NOT NULL,
      saved_at TEXT NOT NULL,
      trigger TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_twin_state_version
      ON twin_state_snapshots(state_version DESC, id DESC);
    CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY,
      state_version INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      domain TEXT NOT NULL,
      severity TEXT NOT NULL,
      title TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS decision_audits (
      id TEXT PRIMARY KEY,
      state_version INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      decision TEXT NOT NULL,
      recommendation_id TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
  `);
  return database;
}

export function persistenceStatus(): PersistenceStatus {
  if (!enabled()) {
    return {
      mode: "memory-only",
      databasePath: null,
      lastPersistedAt: null,
      lastRestoredAt: null,
      lastError: null,
    };
  }
  return {
    mode: "sqlite-local",
    databasePath: configuredDatabasePath(),
    lastPersistedAt: null,
    lastRestoredAt: null,
    lastError: null,
  };
}

export function persistOperationalTwinState(
  state: OperationalTwinState,
  trigger: string
): PersistenceStatus {
  if (!enabled()) return state.persistence.mode === "memory-only" ? state.persistence : persistenceStatus();
  const savedAt = new Date().toISOString();
  let database: SqliteDatabase | null = null;
  try {
    database = openDatabase();
    database.exec("BEGIN IMMEDIATE;");
    database
      .prepare("INSERT INTO twin_state_snapshots(state_version, saved_at, trigger, payload_json) VALUES (?, ?, ?, ?)")
      .run(state.version, savedAt, trigger, JSON.stringify(state));
    const eventStatement = database.prepare(
      "INSERT OR IGNORE INTO operational_events(id, state_version, timestamp, domain, severity, title, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    for (const event of state.operationalEvents) {
      eventStatement.run(
        event.id,
        event.stateVersion,
        event.timestamp,
        event.domain,
        event.severity,
        event.title,
        JSON.stringify(event)
      );
    }
    const auditStatement = database.prepare(
      "INSERT OR IGNORE INTO decision_audits(id, state_version, timestamp, decision, recommendation_id, payload_json) VALUES (?, ?, ?, ?, ?, ?)"
    );
    for (const audit of state.approvalAuditEvents) {
      auditStatement.run(
        audit.id,
        state.version,
        audit.timestamp,
        audit.decision,
        audit.recommendationId,
        JSON.stringify(audit)
      );
    }
    database.exec("COMMIT;");
    return {
      mode: "sqlite-local",
      databasePath: configuredDatabasePath(),
      lastPersistedAt: savedAt,
      lastRestoredAt: state.persistence.lastRestoredAt,
      lastError: null,
    };
  } catch (error) {
    try {
      database?.exec("ROLLBACK;");
    } catch {
      // The transaction may not have started.
    }
    return {
      mode: "sqlite-local",
      databasePath: configuredDatabasePath(),
      lastPersistedAt: state.persistence.lastPersistedAt,
      lastRestoredAt: state.persistence.lastRestoredAt,
      lastError: error instanceof Error ? error.message : "SQLite persistence failed.",
    };
  } finally {
    database?.close();
  }
}

function looksLikeOperationalTwinState(value: unknown): value is OperationalTwinState {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.twinId === "string" &&
    typeof record.version === "number" &&
    Array.isArray(record.entities) &&
    Array.isArray(record.relationships) &&
    Array.isArray(record.operationalEvents) &&
    typeof record.scenarioRuntime === "object"
  );
}

export function restoreLatestOperationalTwinState(): {
  state: OperationalTwinState | null;
  status: PersistenceStatus;
} {
  if (!enabled()) return { state: null, status: persistenceStatus() };
  const restoredAt = new Date().toISOString();
  let database: SqliteDatabase | null = null;
  try {
    database = openDatabase();
    const row = database
      .prepare("SELECT payload_json FROM twin_state_snapshots ORDER BY id DESC LIMIT 1")
      .get() as { payload_json?: unknown } | undefined;
    if (!row || typeof row.payload_json !== "string") {
      return {
        state: null,
        status: {
          mode: "sqlite-local",
          databasePath: configuredDatabasePath(),
          lastPersistedAt: null,
          lastRestoredAt: restoredAt,
          lastError: null,
        },
      };
    }
    const parsed: unknown = JSON.parse(row.payload_json);
    if (!looksLikeOperationalTwinState(parsed)) {
      throw new Error("Latest SQLite payload is not a valid MedRouteX twin state.");
    }
    const state = parsed;
    return {
      state: {
        ...state,
        persistence: {
          mode: "sqlite-local",
          databasePath: configuredDatabasePath(),
          lastPersistedAt: state.persistence?.lastPersistedAt ?? null,
          lastRestoredAt: restoredAt,
          lastError: null,
        },
      },
      status: {
        mode: "sqlite-local",
        databasePath: configuredDatabasePath(),
        lastPersistedAt: state.persistence?.lastPersistedAt ?? null,
        lastRestoredAt: restoredAt,
        lastError: null,
      },
    };
  } catch (error) {
    return {
      state: null,
      status: {
        mode: "sqlite-local",
        databasePath: configuredDatabasePath(),
        lastPersistedAt: null,
        lastRestoredAt: restoredAt,
        lastError: error instanceof Error ? error.message : "SQLite restore failed.",
      },
    };
  } finally {
    database?.close();
  }
}

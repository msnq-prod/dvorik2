import BetterSqlite3 from "better-sqlite3";

export type DatabaseOperation = "open" | "query" | "execute" | "transaction" | "close";
export type SqlValue = null | string | number | bigint | Uint8Array;
export type SqlParameters = readonly SqlValue[] | Readonly<Record<string, SqlValue>>;

export class DatabaseError extends Error {
  readonly code: string;
  readonly operation: DatabaseOperation;
  readonly causeCode?: string;

  constructor(operation: DatabaseOperation, code = "DATABASE_ERROR", cause?: unknown) {
    super(`SQLite ${operation} failed`);
    this.name = "DatabaseError";
    this.code = code;
    this.operation = operation;
    this.causeCode = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : undefined;
  }
}

export interface DatabaseContext {
  query<T extends object>(sql: string, parameters?: SqlParameters): T[];
  execute(sql: string, parameters?: SqlParameters): { changes: number; lastInsertRowid: number | bigint };
}

export interface DatabaseAdapter extends DatabaseContext {
  executeScript(sql: string): void;
  transaction<T>(run: (database: DatabaseContext) => T, options?: Readonly<{ mode?: "deferred" | "immediate" }>): T;
  close(): void;
}

class TransactionDatabaseContext implements DatabaseContext {
  private active = true;

  constructor(private readonly database: DatabaseContext) {}

  query<T extends object>(sql: string, parameters?: SqlParameters) {
    this.assertActive("query");
    return this.database.query<T>(sql, parameters);
  }

  execute(sql: string, parameters?: SqlParameters) {
    this.assertActive("execute");
    return this.database.execute(sql, parameters);
  }

  deactivate() {
    this.active = false;
  }

  private assertActive(operation: "query" | "execute") {
    if (!this.active) throw new DatabaseError(operation, "TRANSACTION_CONTEXT_CLOSED");
  }
}

export type DatabaseConnectionPolicy = {
  foreignKeys: true;
  journalMode: "WAL";
  busyTimeoutMs: number;
  synchronous: "NORMAL";
};

export const defaultDatabaseConnectionPolicy: DatabaseConnectionPolicy = {
  foreignKeys: true,
  journalMode: "WAL",
  busyTimeoutMs: 5_000,
  synchronous: "NORMAL"
};

function normalizeSearchText(value: unknown) {
  return typeof value === "string"
    ? value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim()
    : "";
}

export type DatabaseOpenOptions = {
  readonly?: boolean;
  fileMustExist?: boolean;
  policy?: DatabaseConnectionPolicy;
};

export type DatabaseReadiness =
  | { ready: true; schemaVersions: number[] }
  | { ready: false; code: "SCHEMA_VERSION_MISMATCH" | "DATABASE_UNAVAILABLE"; schemaVersions?: number[] };

function invoke<T>(statement: { all(...params: unknown[]): T[]; run(...params: unknown[]): BetterSqlite3.RunResult }, method: "all" | "run", parameters?: SqlParameters) {
  if (parameters === undefined) return statement[method]();
  if (Array.isArray(parameters)) return statement[method](...parameters);
  return statement[method](parameters);
}

function transactionControlKeyword(sql: string) {
  const statement = sql.replace(/^(?:[\s;]|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)+/, "");
  return /^(BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/i.exec(statement)?.[1]?.toUpperCase();
}

export class BetterSqliteDatabase implements DatabaseAdapter {
  private readonly database: BetterSqlite3.Database;
  private readonly policy: DatabaseConnectionPolicy;
  private readonly readonly: boolean;

  constructor(filePath: string, options: DatabaseOpenOptions = {}) {
    this.policy = options.policy || defaultDatabaseConnectionPolicy;
    this.readonly = options.readonly === true;
    try {
      this.database = new BetterSqlite3(filePath, { readonly: this.readonly, ...(options.fileMustExist === undefined ? {} : { fileMustExist: options.fileMustExist }) });
      this.database.function("dvorik_normalize_search", { deterministic: true }, normalizeSearchText);
      this.applyConnectionPolicy();
    } catch (error) {
      throw new DatabaseError("open", "DATABASE_OPEN_FAILED", error);
    }
  }

  query<T extends object>(sql: string, parameters?: SqlParameters) {
    this.assertOpen("query");
    try {
      return invoke<T>(this.database.prepare<unknown[], T>(sql), "all", parameters) as T[];
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("query", "DATABASE_QUERY_FAILED", error);
    }
  }

  execute(sql: string, parameters?: SqlParameters) {
    this.assertOpen("execute");
    if (transactionControlKeyword(sql)) throw new DatabaseError("execute", "TRANSACTION_CONTROL_FORBIDDEN");
    try {
      return invoke(this.database.prepare(sql), "run", parameters) as BetterSqlite3.RunResult;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("execute", "DATABASE_EXECUTE_FAILED", error);
    }
  }

  executeScript(sql: string) {
    this.assertOpen("execute");
    if (this.database.inTransaction) throw new DatabaseError("execute", "SCRIPT_DURING_TRANSACTION_FORBIDDEN");
    try {
      this.database.exec(sql);
      if (this.database.inTransaction) {
        this.database.exec("ROLLBACK");
        throw new DatabaseError("execute", "INCOMPLETE_SCRIPT_TRANSACTION");
      }
      this.applyConnectionPolicy();
    } catch (error) {
      if (this.database.inTransaction) {
        try { this.database.exec("ROLLBACK"); } catch { /* preserve original sanitized error */ }
      }
      try { this.applyConnectionPolicy(); } catch { /* preserve original sanitized error */ }
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("execute", "DATABASE_EXECUTE_FAILED", error);
    }
  }

  transaction<T>(run: (database: DatabaseContext) => T, options: Readonly<{ mode?: "deferred" | "immediate" }> = {}) {
    this.assertOpen("transaction");
    if (this.database.inTransaction) throw new DatabaseError("transaction", "NESTED_TRANSACTION_FORBIDDEN");
    try {
      const transaction = this.database.transaction(() => {
        const context = new TransactionDatabaseContext(this);
        try {
          const result = run(context);
          if (result && typeof result === "object" && typeof (result as { then?: unknown }).then === "function") {
            void Promise.resolve(result).catch(() => undefined);
            throw new DatabaseError("transaction", "ASYNC_TRANSACTION_FORBIDDEN");
          }
          return result;
        } finally {
          context.deactivate();
        }
      });
      return options.mode === "immediate" ? transaction.immediate() : transaction.deferred();
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError("transaction", "DATABASE_TRANSACTION_FAILED", error);
    }
  }

  close() {
    if (!this.database.open) return;
    if (this.database.inTransaction) throw new DatabaseError("close", "CLOSE_DURING_TRANSACTION_FORBIDDEN");
    try {
      if (!this.readonly) {
        const checkpoint = this.database.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number }>;
        if (checkpoint[0]?.busy) throw new Error("WAL checkpoint busy");
      }
      this.database.close();
    } catch (error) {
      throw new DatabaseError("close", "DATABASE_CLOSE_FAILED", error);
    }
  }

  private assertOpen(operation: DatabaseOperation) {
    if (!this.database.open) throw new DatabaseError(operation, "DATABASE_CLOSED");
  }

  private applyConnectionPolicy() {
    this.database.pragma("foreign_keys = ON");
    this.database.pragma(`busy_timeout = ${this.policy.busyTimeoutMs}`);
    this.database.pragma(`synchronous = ${this.policy.synchronous}`);
    if (this.readonly) {
      const journal = String(this.database.pragma("journal_mode", { simple: true })).toLowerCase();
      if (journal !== "wal") throw new Error("Readonly database is not in WAL mode");
    } else {
      const journal = String(this.database.pragma(`journal_mode = ${this.policy.journalMode}`, { simple: true })).toLowerCase();
      if (journal !== "wal") throw new Error("WAL mode is required");
    }
    if (Number(this.database.pragma("foreign_keys", { simple: true })) !== 1) throw new Error("Foreign keys are required");
  }
}

export function openDatabase(filePath: string, options?: DatabaseOpenOptions): DatabaseAdapter {
  return new BetterSqliteDatabase(filePath, options);
}

export function checkDatabaseReadiness(database: DatabaseAdapter, expectedSchemaVersions: number[], expectedTables: readonly string[]): DatabaseReadiness {
  try {
    const schemaVersions = database.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version").map((row) => row.version);
    if (schemaVersions.length !== expectedSchemaVersions.length || schemaVersions.some((version, index) => version !== expectedSchemaVersions[index])) {
      return { ready: false, code: "SCHEMA_VERSION_MISMATCH", schemaVersions };
    }
    const requiredTables = [...new Set(expectedTables)];
    if (requiredTables.length) {
      const placeholders = requiredTables.map(() => "?").join(",");
      const presentTables = new Set(database.query<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (${placeholders})`,
        requiredTables
      ).map((row) => row.name));
      if (requiredTables.some((table) => !presentTables.has(table))) {
        return { ready: false, code: "SCHEMA_VERSION_MISMATCH", schemaVersions };
      }
    }
    database.executeScript("BEGIN IMMEDIATE; UPDATE schema_migrations SET applied_at = applied_at WHERE version = (SELECT min(version) FROM schema_migrations); ROLLBACK;");
    return { ready: true, schemaVersions };
  } catch {
    return { ready: false, code: "DATABASE_UNAVAILABLE" };
  }
}

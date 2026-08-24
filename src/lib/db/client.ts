import { PGlite } from "@electric-sql/pglite";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type QueryResult<T extends QueryResultRow = QueryResultRow> = {
  rows: T[];
  rowCount: number | null;
};

export interface TransactionClient {
  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[],
  ): Promise<QueryResult<T>>;
  exec(sql: string): Promise<void>;
}

export interface Database extends TransactionClient {
  exec(sql: string): Promise<void>;
  transaction<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

class PostgresDatabase implements Database {
  constructor(private readonly pool: Pool) {}

  async query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
    const result = await this.pool.query<T>(text, params);
    return { rows: result.rows, rowCount: result.rowCount };
  }

  async exec(sql: string) {
    await this.pool.query(sql);
  }

  async transaction<T>(work: (tx: TransactionClient) => Promise<T>) {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const value = await work({
        query: async <R extends QueryResultRow>(text: string, params: unknown[] = []) => {
          const result = await client.query<R>(text, params);
          return { rows: result.rows, rowCount: result.rowCount };
        },
        exec: async (sql: string) => {
          await client.query(sql);
        },
      });
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

class LocalDatabase implements Database {
  constructor(private readonly database: PGlite) {}

  async query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
    const result = await this.database.query<T>(text, params);
    return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
  }

  async exec(sql: string) {
    await this.database.exec(sql);
  }

  async transaction<T>(work: (tx: TransactionClient) => Promise<T>) {
    return this.database.transaction(async (transaction) =>
      work({
        query: async <R extends QueryResultRow>(text: string, params: unknown[] = []) => {
          const result = await transaction.query<R>(text, params);
          return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
        },
        exec: async (sql: string) => {
          await transaction.exec(sql);
        },
      }),
    );
  }

  async close() {
    await this.database.close();
  }
}

async function createDatabase(): Promise<Database> {
  const driver = process.env.DATABASE_DRIVER ?? "local";
  if (driver === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is required when DATABASE_DRIVER=postgres");
    }
    return new PostgresDatabase(
      new Pool({
        connectionString,
        max: Number(process.env.DATABASE_POOL_MAX ?? 10),
        statement_timeout: 15_000,
        idle_in_transaction_session_timeout: 15_000,
      }),
    );
  }

  if (driver !== "local") {
    throw new Error(`Unsupported DATABASE_DRIVER: ${driver}`);
  }

  const dataDirectory = process.env.LOCAL_DATABASE_PATH ?? path.join(process.cwd(), ".data", "pglite");
  mkdirSync(path.dirname(dataDirectory), { recursive: true });
  return new LocalDatabase(new PGlite(dataDirectory));
}

let databasePromise: Promise<Database> | undefined;

export function getDatabase() {
  databasePromise ??= createDatabase().catch((error) => {
    // Allow a later request to recover from a transient initialization failure.
    databasePromise = undefined;
    throw error;
  });
  return databasePromise;
}

export async function withCompany<T>(
  companyId: string,
  work: (tx: TransactionClient) => Promise<T>,
) {
  const database = await getDatabase();
  return database.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.current_company_id', $1, true)", [companyId]);
    return work(tx);
  });
}

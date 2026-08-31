import path from "node:path";
import { mkdir } from "node:fs/promises";

export async function openRuntimeDatabase() {
  const driver = process.env.DATABASE_DRIVER ?? "local";
  if (driver === "postgres") {
    const connection = process.env.DATABASE_HOST
      ? {
          host: process.env.DATABASE_HOST,
          port: Number(process.env.DATABASE_PORT ?? 5432),
          database: process.env.DATABASE_NAME ?? "moarix",
          user: process.env.DATABASE_USER,
          password: process.env.DATABASE_PASSWORD,
        }
      : process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL }
        : null;
    if (!connection) throw new Error("DATABASE_URL or DATABASE_HOST is required when DATABASE_DRIVER=postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ ...connection, max: 2 });
    return {
      query: (text, params = []) => pool.query(text, params),
      exec: (sql) => pool.query(sql),
      transaction: async (work) => {
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          const result = await work({ query: (text, params = []) => client.query(text, params), exec: (sql) => client.query(sql) });
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      },
      close: () => pool.end(),
    };
  }
  if (driver !== "local") throw new Error(`Unsupported DATABASE_DRIVER: ${driver}`);

  const dataPath = process.env.LOCAL_DATABASE_PATH ?? path.join(process.cwd(), ".data", "pglite");
  await mkdir(path.dirname(dataPath), { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const database = new PGlite(dataPath);
  return {
    query: (text, params = []) => database.query(text, params),
    exec: (sql) => database.exec(sql),
    transaction: (work) => database.transaction((tx) => work({ query: (text, params = []) => tx.query(text, params), exec: (sql) => tx.exec(sql) })),
    close: () => database.close(),
  };
}

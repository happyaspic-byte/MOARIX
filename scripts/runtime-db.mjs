import path from "node:path";
import { mkdir } from "node:fs/promises";

export async function openRuntimeDatabase() {
  const driver = process.env.DATABASE_DRIVER ?? "local";
  if (driver === "postgres") {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required when DATABASE_DRIVER=postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
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

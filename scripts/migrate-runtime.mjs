import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { openRuntimeDatabase } from "./runtime-db.mjs";

const database = await openRuntimeDatabase();
try {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  const names = (await readdir(path.join(process.cwd(), "migrations")))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const existing = await database.query("SELECT name FROM schema_migrations WHERE name = $1", [name]);
    if (existing.rows.length > 0) continue;
    const sql = await readFile(path.join(process.cwd(), "migrations", name), "utf8");
    await database.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.info(`Applied migration ${name}`);
  }
} finally {
  await database.close();
}

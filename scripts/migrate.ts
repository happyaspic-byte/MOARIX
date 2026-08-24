import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { getDatabase } from "../src/lib/db/client";

async function migrate() {
  const database = await getDatabase();
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const migrations = (await readdir(path.join(process.cwd(), "migrations")))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();
  for (const name of migrations) {
    const existing = await database.query<{ name: string }>(
      "SELECT name FROM schema_migrations WHERE name = $1",
      [name],
    );
    if (existing.rows.length > 0) continue;

    const sql = await readFile(path.join(process.cwd(), "migrations", name), "utf8");
    await database.transaction(async (tx) => {
      await tx.exec(sql);
      await tx.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    });
    console.info(`Applied migration ${name}`);
  }

  await database.close();
}

migrate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

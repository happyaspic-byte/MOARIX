import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { openRuntimeDatabase } from "./runtime-db.mjs";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const companyName = process.env.BOOTSTRAP_COMPANY_NAME?.trim();
const companySlug = process.env.BOOTSTRAP_COMPANY_SLUG?.trim().toLowerCase() ?? "primary";

if (!email || !password || !companyName) {
  throw new Error("BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD and BOOTSTRAP_COMPANY_NAME are required");
}
if (password.length < 12 || password.length > 128) throw new Error("Bootstrap password must be between 12 and 128 characters");
if (!/^[a-z0-9-]{2,60}$/.test(companySlug)) throw new Error("BOOTSTRAP_COMPANY_SLUG must contain lowercase letters, numbers or hyphens");

const database = await openRuntimeDatabase();
try {
  const existing = await database.query(
    `SELECT u.email FROM users u
     JOIN company_members m ON m.user_id = u.id
     JOIN companies c ON c.id = m.company_id
     WHERE u.email = $1 OR c.slug = $2
     LIMIT 1`,
    [email, companySlug],
  );
  if (existing.rows.length > 0) throw new Error("An administrator or company with these identifiers already exists");

  const companyId = randomUUID();
  const userId = randomUUID();
  const passwordHash = await bcrypt.hash(password, 12);
  await database.transaction(async (tx) => {
    await tx.query("INSERT INTO companies (id, slug, name) VALUES ($1, $2, $3)", [companyId, companySlug, companyName]);
    await tx.query("INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)", [userId, email, "관리자", passwordHash]);
    await tx.query("INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, 'owner')", [companyId, userId]);
  });
  console.info(`Created owner account for ${companyName}: ${email}`);
} finally {
  await database.close();
}

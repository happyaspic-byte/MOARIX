import { randomUUID } from "node:crypto";
import { getDatabase } from "@/lib/db/client";
import { verifyPassword } from "@/lib/security/password";
import { createSessionToken, hashSessionToken } from "@/lib/security/session-token";
import type { Role } from "@/lib/security/permissions";

const SESSION_HOURS = 12;
const LOGIN_WINDOW_MINUTES = 15;
const MAX_LOGIN_ATTEMPTS = 5;

async function isLoginBlocked(identifierHash: string) {
  const database = await getDatabase();
  const result = await database.query<{ blocked: boolean }>(
    "SELECT COALESCE(blocked_until > now(), false) AS blocked FROM login_attempts WHERE identifier_hash = $1",
    [identifierHash],
  );
  return result.rows[0]?.blocked ?? false;
}

async function recordLoginFailure(identifierHash: string) {
  const database = await getDatabase();
  await database.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO login_attempts (identifier_hash, attempt_count)
       VALUES ($1, 0)
       ON CONFLICT (identifier_hash) DO NOTHING`,
      [identifierHash],
    );
    const result = await tx.query<{ attempt_count: number; window_expired: boolean }>(
      `SELECT attempt_count,
              window_started_at < now() - make_interval(mins => $2::integer) AS window_expired
       FROM login_attempts WHERE identifier_hash = $1 FOR UPDATE`,
      [identifierHash, LOGIN_WINDOW_MINUTES],
    );
    const current = result.rows[0];
    const nextCount = current?.window_expired ? 1 : (current?.attempt_count ?? 0) + 1;
    await tx.query(
      `UPDATE login_attempts
       SET attempt_count = $2::integer,
           window_started_at = CASE WHEN $3::boolean THEN now() ELSE window_started_at END,
           blocked_until = CASE WHEN $2::integer >= $4::integer THEN now() + make_interval(mins => $5::integer) ELSE NULL END,
           updated_at = now()
       WHERE identifier_hash = $1`,
      [identifierHash, nextCount, current?.window_expired ?? false, MAX_LOGIN_ATTEMPTS, LOGIN_WINDOW_MINUTES],
    );
  });
}

type LoginRow = {
  user_id: string;
  company_id: string;
  password_hash: string;
  user_name: string;
  email: string;
  company_name: string;
  role: Role;
};

export type SessionContext = {
  sessionId: string;
  userId: string;
  companyId: string;
  userName: string;
  email: string;
  companyName: string;
  companyTimezone: string;
  role: Role;
  expiresAt: Date;
};

export async function authenticate(
  email: string,
  password: string,
  metadata: { userAgent?: string; ipHash?: string } = {},
) {
  const database = await getDatabase();
  const normalizedEmail = email.trim().toLowerCase();
  const identifierHash = hashSessionToken(`login:${normalizedEmail}`);
  if (await isLoginBlocked(identifierHash)) return null;
  const result = await database.query<LoginRow>(
    `SELECT
       u.id AS user_id,
       m.company_id,
       u.password_hash,
       u.name AS user_name,
       u.email,
       c.name AS company_name,
       m.role
     FROM users u
     JOIN company_members m ON m.user_id = u.id AND m.is_active = true
     JOIN companies c ON c.id = m.company_id AND c.is_active = true
     WHERE u.email = $1 AND u.is_active = true
     ORDER BY m.created_at ASC
     LIMIT 1`,
    [normalizedEmail],
  );

  const account = result.rows[0];
  if (!account || !(await verifyPassword(password, account.password_hash))) {
    await recordLoginFailure(identifierHash);
    return null;
  }

  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  await database.transaction(async (tx) => {
    await tx.query("DELETE FROM login_attempts WHERE identifier_hash = $1", [identifierHash]);
    await tx.query("DELETE FROM sessions WHERE expires_at < now() OR revoked_at < now() - interval '7 days'");
    await tx.query(
      `INSERT INTO sessions
         (id, user_id, company_id, token_hash, expires_at, user_agent, ip_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        sessionId,
        account.user_id,
        account.company_id,
        tokenHash,
        expiresAt.toISOString(),
        metadata.userAgent?.slice(0, 512) ?? null,
        metadata.ipHash ?? null,
      ],
    );
    await tx.query("UPDATE users SET last_login_at = now() WHERE id = $1", [account.user_id]);
  });

  return { token, expiresAt };
}

export async function findSession(token: string): Promise<SessionContext | null> {
  if (!token) return null;
  const database = await getDatabase();
  const result = await database.query<{
    session_id: string;
    user_id: string;
    company_id: string;
    user_name: string;
    email: string;
    company_name: string;
    company_timezone: string;
    role: Role;
    expires_at: Date | string;
  }>(
    `SELECT
       s.id AS session_id,
       u.id AS user_id,
       c.id AS company_id,
       u.name AS user_name,
       u.email,
       c.name AS company_name,
       c.timezone AS company_timezone,
       m.role,
       s.expires_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id AND u.is_active = true
     JOIN companies c ON c.id = s.company_id AND c.is_active = true
     JOIN company_members m
       ON m.company_id = s.company_id AND m.user_id = s.user_id AND m.is_active = true
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
     LIMIT 1`,
    [hashSessionToken(token)],
  );

  const row = result.rows[0];
  if (!row) return null;

  await database.query(
    `UPDATE sessions SET last_seen_at = now()
     WHERE id = $1 AND last_seen_at < now() - interval '5 minutes'`,
    [row.session_id],
  );

  return {
    sessionId: row.session_id,
    userId: row.user_id,
    companyId: row.company_id,
    userName: row.user_name,
    email: row.email,
    companyName: row.company_name,
    companyTimezone: row.company_timezone,
    role: row.role,
    expiresAt: new Date(row.expires_at),
  };
}

export async function revokeSession(token: string) {
  if (!token) return;
  const database = await getDatabase();
  await database.query(
    "UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [hashSessionToken(token)],
  );
}

import { randomUUID } from "node:crypto";
import { getDatabase, withCompany } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/repository";
import { hashPassword } from "@/lib/security/password";
import type { Role } from "@/lib/security/permissions";
import { writeAudit } from "./audit";

export type MemberRow = {
  user_id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
};

export type AuditRow = {
  id: string;
  created_at: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  summary: string;
};

export async function listMembers(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<MemberRow>(
    `SELECT u.id AS user_id, u.name, u.email, m.role,
            (u.is_active AND m.is_active) AS is_active, u.last_login_at::text
     FROM company_members m
     JOIN users u ON u.id = m.user_id
     WHERE m.company_id = $1
     ORDER BY CASE m.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3 WHEN 'member' THEN 4 ELSE 5 END,
              u.name`,
    [companyId],
  );
    return result.rows;
  });
}

export function listAuditLogs(companyId: string) {
  return withCompany(companyId, async (tx) => {
    const result = await tx.query<AuditRow>(
      `SELECT a.id, a.created_at::text, u.name AS actor_name, a.action, a.entity_type, a.summary
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC
       LIMIT 200`,
    );
    return result.rows;
  });
}

export async function createMember(
  session: SessionContext,
  input: { email: string; name: string; password: string; role: Role },
) {
  if (input.role === "owner" && session.role !== "owner") throw new Error("Administrator cannot assign the owner role");
  const database = await getDatabase();
  const userId = randomUUID();
  const passwordHash = await hashPassword(input.password);
  await database.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.current_company_id', $1, true)", [session.companyId]);
    const existing = await tx.query("SELECT id FROM users WHERE email = $1", [input.email]);
    if (existing.rows.length > 0) throw new Error("duplicate key: users_email_key");
    await tx.query("INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)", [userId, input.email, input.name, passwordHash]);
    await tx.query("INSERT INTO company_members (company_id, user_id, role) VALUES ($1, $2, $3)", [session.companyId, userId, input.role]);
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "member.created",
      entityType: "company_member",
      entityId: userId,
      summary: `${input.name} 사용자를 ${input.role} 역할로 추가`,
      afterData: { userId, email: input.email, name: input.name, role: input.role },
    });
  });
  return userId;
}

export async function updateMember(
  session: SessionContext,
  input: { userId: string; role: Role; isActive: boolean },
) {
  const database = await getDatabase();
  await database.transaction(async (tx) => {
    await tx.query("SELECT set_config('app.current_company_id', $1, true)", [session.companyId]);

    // Lock every active owner in one deterministic order before the target row.
    // At PostgreSQL READ COMMITTED, a concurrent owner mutation waits here and
    // then re-evaluates this predicate against the committed owner set. This
    // prevents two owners from concurrently demoting one another to zero.
    await tx.query(
      `SELECT user_id
       FROM company_members
       WHERE company_id = $1 AND role = 'owner' AND is_active = true
       ORDER BY user_id
       FOR UPDATE`,
      [session.companyId],
    );

    const currentResult = await tx.query<{ role: Role; is_active: boolean; name: string }>(
      `SELECT m.role, m.is_active, u.name
       FROM company_members m JOIN users u ON u.id = m.user_id
       WHERE m.company_id = $1 AND m.user_id = $2 FOR UPDATE`,
      [session.companyId, input.userId],
    );
    const current = currentResult.rows[0];
    if (!current) throw new Error("Company member not found");
    if (current.role === input.role && current.is_active === input.isActive) return;
    if (current.role === "owner" && session.role !== "owner") throw new Error("Administrator cannot manage an owner");
    if (input.role === "owner" && session.role !== "owner") throw new Error("Administrator cannot assign the owner role");
    if (current.role === "owner" && (input.role !== "owner" || !input.isActive)) {
      const ownerCount = await tx.query<{ count: string }>(
        "SELECT COUNT(*)::text AS count FROM company_members WHERE company_id = $1 AND role = 'owner' AND is_active = true",
        [session.companyId],
      );
      if (Number(ownerCount.rows[0]?.count ?? 0) <= 1) throw new Error("Cannot change the last active owner");
    }
    if (input.userId === session.userId && !input.isActive) throw new Error("Cannot deactivate the current session account");

    await tx.query(
      "UPDATE company_members SET role = $3, is_active = $4, updated_at = now() WHERE company_id = $1 AND user_id = $2",
      [session.companyId, input.userId, input.role, input.isActive],
    );
    await tx.query("SELECT public.moarix_revoke_user_sessions($1, $2)", [session.companyId, input.userId]);
    await writeAudit(tx, {
      companyId: session.companyId,
      actorUserId: session.userId,
      action: "member.updated",
      entityType: "company_member",
      entityId: input.userId,
      summary: `${current.name} 사용자 역할·상태 변경`,
      beforeData: { role: current.role, isActive: current.is_active },
      afterData: { role: input.role, isActive: input.isActive },
    });
  });
}

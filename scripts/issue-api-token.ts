import { randomUUID } from "node:crypto";
import { getDatabase } from "../src/lib/db/client";
import { createApiTokenCredential, normalizeApiTokenScopes } from "../src/lib/auth/api-token";

type IssueOptions = {
  companySlug: string;
  email: string;
  name: string;
  scopes: string[];
  expiresInDays: number;
};

function readArgument(name: string) {
  const inline = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return value?.startsWith("--") ? undefined : value;
}

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function parseOptions(): IssueOptions {
  const companySlug = required(
    readArgument("--company") ?? process.env.API_TOKEN_COMPANY_SLUG,
    "--company or API_TOKEN_COMPANY_SLUG",
  ).toLowerCase();
  const email = required(
    readArgument("--email") ?? process.env.API_TOKEN_EMAIL,
    "--email or API_TOKEN_EMAIL",
  ).toLowerCase();
  const name = required(
    readArgument("--name") ?? process.env.API_TOKEN_NAME ?? "MOARIX AI CLI",
    "--name or API_TOKEN_NAME",
  );
  const scopes = normalizeApiTokenScopes(required(
    readArgument("--scopes") ?? process.env.API_TOKEN_SCOPES,
    "--scopes or API_TOKEN_SCOPES",
  ).split(","));
  const daysText = readArgument("--expires-in-days") ?? process.env.API_TOKEN_EXPIRES_IN_DAYS ?? "90";
  const expiresInDays = Number(daysText);

  if (!/^[a-z0-9-]{2,60}$/.test(companySlug)) {
    throw new Error("Company slug must contain lowercase letters, numbers or hyphens");
  }
  if (!email.includes("@") || email.length > 320) throw new Error("A valid account email is required");
  if (name.length > 100) throw new Error("API token name must be at most 100 characters");
  if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 3650) {
    throw new Error("API token expiry must be an integer between 1 and 3650 days");
  }

  return { companySlug, email, name, scopes, expiresInDays };
}

async function issueApiToken(options: IssueOptions) {
  if (process.env.DATABASE_DRIVER === "postgres" && process.env.DATABASE_OWNER_URL) {
    process.env.DATABASE_URL = process.env.DATABASE_OWNER_URL;
  }

  const database = await getDatabase();
  try {
    if (process.env.DATABASE_DRIVER === "postgres") {
      const ownership = await database.query<{ owns_api_tokens: boolean }>(
        `SELECT pg_get_userbyid(relation.relowner) = current_user AS owns_api_tokens
         FROM pg_catalog.pg_class AS relation
         WHERE relation.oid = 'public.api_tokens'::regclass`,
      );
      if (!ownership.rows[0]?.owns_api_tokens) {
        throw new Error("API tokens must be issued with the migration-owner database connection");
      }
    }

    const tokenId = randomUUID();
    const credential = createApiTokenCredential();
    const expiresAt = new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000);

    await database.transaction(async (tx) => {
      const account = await tx.query<{ company_id: string; user_id: string }>(
        `SELECT company.id AS company_id, account.id AS user_id
         FROM public.companies AS company
         JOIN public.company_members AS membership
           ON membership.company_id = company.id
          AND membership.is_active = true
         JOIN public.users AS account
           ON account.id = membership.user_id
          AND account.is_active = true
         WHERE company.slug = $1
           AND company.is_active = true
           AND account.email = $2
         LIMIT 1`,
        [options.companySlug, options.email],
      );
      const principal = account.rows[0];
      if (!principal) throw new Error("No active company membership matched the company slug and email");

      await tx.query(
        `INSERT INTO public.api_tokens
           (id, company_id, user_id, name, token_hash, token_prefix, scopes, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tokenId,
          principal.company_id,
          principal.user_id,
          options.name,
          credential.tokenHash,
          credential.tokenPrefix,
          options.scopes,
          expiresAt.toISOString(),
        ],
      );

      await tx.query(
        `INSERT INTO public.audit_logs
           (id, company_id, action, entity_type, entity_id, summary, after_data)
         VALUES ($1, $2, 'api_token.issued', 'api_token', $3,
                 '운영 스크립트로 AI/CLI API 토큰 발급',
                 pg_catalog.jsonb_build_object('principalUserId', $4::uuid,
                                               'name', $5::text, 'prefix', $6::text,
                                               'scopes', $7::text[], 'expiresAt', $8::timestamptz))`,
        [
          randomUUID(),
          principal.company_id,
          tokenId,
          principal.user_id,
          options.name,
          credential.tokenPrefix,
          options.scopes,
          expiresAt.toISOString(),
        ],
      );
    });

    console.error(`Issued ${credential.tokenPrefix} for ${options.companySlug}; expires ${expiresAt.toISOString()}.`);
    console.error("The full token is shown once on stdout. Store it in a secret manager; it cannot be recovered from MOARIX.");
    process.stdout.write(`${credential.token}\n`);
  } finally {
    await database.close();
  }
}

if (process.argv.includes("--help")) {
  console.info("Usage: npm run api-token:issue -- --company <slug> --email <account> --name <label> --scopes <resource:read,...> [--expires-in-days 90]");
} else {
  issueApiToken(parseOptions()).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

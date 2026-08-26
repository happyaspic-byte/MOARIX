import { randomUUID } from "node:crypto";
import { getDatabase } from "../src/lib/db/client";

function readArgument(name: string) {
  const inline = process.argv.slice(2).find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

async function revokeApiToken(companySlug: string, tokenPrefix: string) {
  if (!/^[a-z0-9-]{2,60}$/.test(companySlug)) throw new Error("Company slug is invalid");
  if (!/^mxk_[A-Za-z0-9_-]{12}$/.test(tokenPrefix)) {
    throw new Error("Token prefix must be the 16-character mxk_ prefix printed during issuance");
  }
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
        throw new Error("API tokens must be revoked with the migration-owner database connection");
      }
    }

    await database.transaction(async (tx) => {
      const result = await tx.query<{ id: string; company_id: string; user_id: string; name: string }>(
        `SELECT token.id, token.company_id, token.user_id, token.name
         FROM public.api_tokens AS token
         JOIN public.companies AS company ON company.id = token.company_id
         WHERE company.slug = $1 AND token.token_prefix = $2 AND token.revoked_at IS NULL
         FOR UPDATE`,
        [companySlug, tokenPrefix],
      );
      if (result.rows.length !== 1) throw new Error("Exactly one active API token must match the company and prefix");
      const token = result.rows[0]!;
      await tx.query("UPDATE public.api_tokens SET revoked_at = pg_catalog.now() WHERE id = $1", [token.id]);
      await tx.query(
        `INSERT INTO public.audit_logs
           (id, company_id, action, entity_type, entity_id, summary, after_data)
         VALUES ($1, $2, 'api_token.revoked', 'api_token', $3,
                 '운영 스크립트로 AI/CLI API 토큰 폐기',
                 pg_catalog.jsonb_build_object('principalUserId', $4::uuid,
                                               'name', $5::text, 'prefix', $6::text))`,
        [randomUUID(), token.company_id, token.id, token.user_id, token.name, tokenPrefix],
      );
    });
    console.info(`Revoked API token ${tokenPrefix} for ${companySlug}.`);
  } finally {
    await database.close();
  }
}

if (process.argv.includes("--help")) {
  console.info("Usage: npm run api-token:revoke -- --company <slug> --prefix <16-character-prefix>");
} else {
  revokeApiToken(
    required(readArgument("--company") ?? process.env.API_TOKEN_COMPANY_SLUG, "--company or API_TOKEN_COMPANY_SLUG").toLowerCase(),
    required(readArgument("--prefix") ?? process.env.API_TOKEN_PREFIX, "--prefix or API_TOKEN_PREFIX"),
  ).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

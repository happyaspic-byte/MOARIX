import { getDatabase } from "@/lib/db/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const database = await getDatabase();
    await database.query("SELECT 1 AS healthy");
    return Response.json(
      { status: "ok", service: "moarix", timestamp: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "error", service: "moarix" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

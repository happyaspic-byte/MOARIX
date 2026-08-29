import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/current";
import { getAssetCsvTemplate, getContractCsvTemplate } from "@/lib/services/asset-import-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireSession();
    const type = request.nextUrl.searchParams.get("type") || "asset";

    if (type === "contract") {
      const csv = getContractCsvTemplate();
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="moarix_contract_import_template.csv"',
        },
      });
    }

    const csv = getAssetCsvTemplate();
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="moarix_asset_import_template.csv"',
      },
    });
  } catch {
    return new NextResponse("Unauthorized", { status: 401 });
  }
}

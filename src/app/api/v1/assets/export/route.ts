import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/current";
import { listAssets, type AssetRow } from "@/lib/services/assets-service";
import { serializeCsv, type CsvColumnDef } from "@/lib/csv/csv-engine";

export const dynamic = "force-dynamic";

const exportColumns: CsvColumnDef<AssetRow>[] = [
  { key: "asset_tag", label: "자산태그" },
  { key: "vendor_asset_id", label: "Stratus Asset ID" },
  { key: "counterparty_name", label: "고객사명" },
  { key: "site", label: "설치사업장" },
  { key: "product_name", label: "제품명" },
  { key: "product_family", label: "제품군" },
  { key: "product_model", label: "모델명" },
  { key: "software_version", label: "SW버전" },
  { key: "protection_mode", label: "보호모드" },
  { key: "operating_system", label: "OS" },
  { key: "management_ip", label: "관리IP" },
  { key: "serial_number", label: "시리얼번호" },
  { key: "status", label: "자산상태" },
  { key: "contract_status", label: "고객계약상태" },
  { key: "contract_number", label: "고객계약번호" },
  { key: "support_provider", label: "지원공급자" },
  { key: "support_level", label: "지원등급" },
  { key: "support_started_at", label: "지원시작일" },
  { key: "support_until", label: "지원종료일" },
  { key: "vendor_contract_status", label: "벤더계약상태" },
  { key: "vendor_support_until", label: "벤더지원종료일" },
  { key: "next_inspection_date", label: "다음점검일" },
  { key: "business_system", label: "업무시스템" },
  { key: "environment", label: "환경" },
  { key: "hardware_vendor", label: "HW제조사" },
  { key: "rack_location", label: "랙위치" },
  { key: "assigned_engineer_name", label: "담당엔지니어" },
  { key: "node_count", label: "노드수" },
  { key: "vm_count", label: "VM수" },
  { key: "open_case_count", label: "진행케이스수" },
  { key: "notes", label: "비고" },
];

export async function GET() {
  try {
    const session = await getCurrentSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });
    const assets = await listAssets(session.companyId);

    const csvContent = serializeCsv(exportColumns, assets);

    const filename = `moarix_assets_${new Date().toISOString().slice(0, 10)}.csv`;

    return new NextResponse(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new NextResponse("Export failed", { status: 500 });
  }
}

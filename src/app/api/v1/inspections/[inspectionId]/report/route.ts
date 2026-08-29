import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/current";
import { getInspectionReportData } from "@/lib/services/operations-service";
import { generateInspectionCsvReport, generateInspectionHtmlReport } from "@/lib/services/inspection-report";
import { generateInspectionExcelXml, generateInspectionPdf } from "@/lib/services/report-files";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ inspectionId: string }> }) {
  try {
    const session = await requireSession();
    const { inspectionId } = await context.params;
    const format = request.nextUrl.searchParams.get("format") ?? "html";
    const data = await getInspectionReportData(session.companyId, inspectionId);

    if (format === "csv") {
      const csv = generateInspectionCsvReport(data);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${data.number}_inspection.csv"`,
        },
      });
    }
    if (format === "excel") {
      const excel = generateInspectionExcelXml(data);
      return new NextResponse(excel, {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": `attachment; filename="${data.number}_inspection.xml"`,
        },
      });
    }
    if (format === "pdf") {
      const pdf = generateInspectionPdf(data);
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${data.number}_inspection.pdf"`,
        },
      });
    }

    const html = generateInspectionHtmlReport(data);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch {
    return new NextResponse("보고서를 만들 수 없습니다.", { status: 404 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/current";
import { getInspectionReportData } from "@/lib/services/operations-service";
import { generateInspectionCsvReport, generateInspectionHtmlReport } from "@/lib/services/inspection-report";
import { generateInspectionExcelXml, generateInspectionPdf } from "@/lib/services/report-files";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ inspectionId: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });
    const { inspectionId } = await context.params;
    const format = request.nextUrl.searchParams.get("format") ?? "html";
    const data = await getInspectionReportData(session.companyId, inspectionId);
    const downloadStem = safeDownloadName(data.number);

    if (format === "csv") {
      const csv = generateInspectionCsvReport(data);
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": contentDisposition(`${downloadStem}_inspection.csv`),
        },
      });
    }
    if (format === "excel") {
      const excel = generateInspectionExcelXml(data);
      return new NextResponse(excel, {
        headers: {
          "Content-Type": "application/vnd.ms-excel; charset=utf-8",
          "Content-Disposition": contentDisposition(`${downloadStem}_inspection.xml`),
        },
      });
    }
    if (format === "pdf") {
      const pdf = generateInspectionPdf(data);
      return new NextResponse(pdf, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": contentDisposition(`${downloadStem}_inspection.pdf`),
        },
      });
    }

    const html = generateInspectionHtmlReport(data);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) {
      return new NextResponse("보고서를 찾을 수 없습니다.", { status: 404 });
    }
    return new NextResponse("보고서를 만들 수 없습니다.", { status: 500 });
  }
}

function safeDownloadName(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "_")
    .replace(/^\.+/, "");
  const bounded = Array.from(normalized).slice(0, 100).join("");
  return bounded || "moarix-inspection";
}

function contentDisposition(filename: string) {
  const encoded = encodeURIComponent(filename);
  const asciiFallback = filename.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

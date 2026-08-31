import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/current";
import { documentKindLabels } from "@/lib/services/documents";
import { getDocumentDetail } from "@/lib/services/documents";
import { generateDocumentHtml } from "@/lib/services/document-print";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ documentId: string }> }) {
  try {
    const session = await getCurrentSession();
    if (!session) return new NextResponse("Unauthorized", { status: 401 });
    const { documentId } = await context.params;
    const detail = await getDocumentDetail(session.companyId, documentId);
    if (!detail) return new NextResponse("문서를 찾을 수 없습니다.", { status: 404 });
    const html = generateDocumentHtml({
      kindLabel: documentKindLabels[detail.document.kind],
      number: detail.document.number,
      counterpartyName: detail.document.counterparty_name,
      issueDate: detail.document.issue_date,
      dueDate: detail.document.due_date,
      notes: detail.document.notes,
      currency: detail.document.currency,
      grandTotal: detail.document.grand_total,
      lines: detail.lines.map((line) => ({
        name: line.name_snapshot,
        sku: line.sku_snapshot,
        quantity: line.quantity,
        unitPrice: line.unit_price,
        taxRate: line.tax_rate,
        grossAmount: line.gross_amount,
      })),
    });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch {
    return new NextResponse("인쇄본을 만들 수 없습니다.", { status: 500 });
  }
}

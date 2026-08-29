import { formatMoney } from "@/lib/domain/money";

export type DocumentPrintLine = {
  name: string;
  sku?: string | null;
  quantity: string;
  unitPrice: string;
  taxRate: string;
  grossAmount: string;
};

export type DocumentPrintData = {
  kindLabel: string;
  number: string;
  counterpartyName: string;
  issueDate: string;
  dueDate?: string | null;
  notes?: string | null;
  currency: string;
  subtotal?: string;
  taxTotal?: string;
  grandTotal: string;
  lines: DocumentPrintLine[];
};

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function generateDocumentHtml(data: DocumentPrintData) {
  const rows = data.lines.map((line) => `<tr><td>${escapeHtml(line.sku ?? "")}</td><td>${escapeHtml(line.name)}</td><td>${escapeHtml(line.quantity)}</td><td>${escapeHtml(line.unitPrice)}</td><td>${escapeHtml(line.taxRate)}%</td><td>${escapeHtml(line.grossAmount)}</td></tr>`).join("");
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8" /><title>${escapeHtml(data.kindLabel)} ${escapeHtml(data.number)}</title>
<style>body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;padding:40px;color:#111}h1{border-bottom:2px solid #111;padding-bottom:8px}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #ccc;padding:8px;text-align:left;font-size:13px}th{background:#eee}.totals{margin-top:16px;text-align:right}@media print{body{padding:0}}</style></head>
<body><h1>${escapeHtml(data.kindLabel)}</h1><p>문서번호 <strong>${escapeHtml(data.number)}</strong></p>
<p>거래처 ${escapeHtml(data.counterpartyName)} · 발행 ${escapeHtml(data.issueDate)}${data.dueDate ? ` · 만기 ${escapeHtml(data.dueDate)}` : ""}</p>
<table><thead><tr><th>SKU</th><th>품목</th><th>수량</th><th>단가</th><th>세율</th><th>합계</th></tr></thead><tbody>${rows}</tbody></table>
<p class="totals">합계 ${escapeHtml(formatMoney(data.grandTotal, data.currency))}</p>
${data.notes ? `<p>비고: ${escapeHtml(data.notes)}</p>` : ""}
</body></html>`;
}

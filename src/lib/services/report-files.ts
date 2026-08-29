import type { InspectionReportData } from "./inspection-report";

function xml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function text(value: unknown) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export function generateInspectionExcelXml(data: InspectionReportData) {
  const rows = [
    ["점검번호", data.number],
    ["고객사", data.customer_name],
    ["사업장", data.site_name],
    ["자산", data.asset_tag],
    ["제품", data.product_name],
    ["점검일", data.scheduled_date],
    ["엔지니어", data.engineer_name],
    ["시스템 건전성", data.system_health],
    ["Protection", data.protection_status],
    ["Sync", data.sync_status],
    ["Service", data.service_status],
    ["CPU", data.cpu_percent],
    ["Memory", data.memory_percent],
    ["Disk", data.disk_percent],
    ["발견 사항", data.findings],
    ["조치 사항", data.action_items],
    ["고객 확인자", data.customer_confirmed_by],
    ...data.checks.map((check) => [check.label, `${check.result} ${check.observed_value ?? ""}`]),
  ];
  const body = rows.map(([label, value]) => `<Row><Cell><Data ss:Type="String">${xml(text(label))}</Data></Cell><Cell><Data ss:Type="String">${xml(text(value))}</Data></Cell></Row>`).join("");
  return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Inspection"><Table><Row><Cell><Data ss:Type="String">항목</Data></Cell><Cell><Data ss:Type="String">내용</Data></Cell></Row>${body}</Table></Worksheet></Workbook>`;
}

function pdfEscape(value: string) {
  return text(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function generateInspectionPdf(data: InspectionReportData) {
  const lines = [
    "MOARIX INSPECTION REPORT",
    `Number: ${data.number}`,
    `Customer: ${data.customer_name}`,
    `Site: ${data.site_name}`,
    `Asset: ${data.asset_tag}`,
    `Product: ${data.product_name}`,
    `Date: ${data.scheduled_date}`,
    `Engineer: ${data.engineer_name}`,
    `Health: ${data.system_health}`,
    `Protection: ${data.protection_status} / Sync: ${data.sync_status} / Service: ${data.service_status}`,
    `CPU: ${data.cpu_percent ?? "-"}%  Memory: ${data.memory_percent ?? "-"}%  Disk: ${data.disk_percent ?? "-"}%`,
    `Findings: ${data.findings ?? "-"}`,
    `Actions: ${data.action_items ?? "-"}`,
    `Customer confirmation: ${data.customer_confirmed_by ?? "Not confirmed"}`,
    ...data.checks.map((check) => `Check ${check.label}: ${check.result} ${check.observed_value ?? ""}`),
  ];
  const stream = ["BT", "/F1 10 Tf", "50 760 Td", ...lines.flatMap((line, index) => [index === 0 ? "/F1 16 Tf" : "/F1 10 Tf", `(${pdfEscape(line)}) Tj`, "0 -18 Td"]), "ET"].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index++) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index++) pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Uint8Array(Buffer.from(pdf, "latin1"));
}

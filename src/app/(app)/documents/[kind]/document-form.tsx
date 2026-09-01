"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createBrowserId } from "@/lib/browser-id";
import type { CounterpartyRow, ItemRow, WarehouseRow } from "@/lib/services/master-data";
import type { DocumentKind } from "@/lib/services/documents";
import { createDocumentAction, updateDraftDocumentAction } from "./actions";

type LineDraft = {
  key: string;
  itemId: string;
  quantity: string;
  unitPrice: string;
  discountRate: string;
  taxRate: string;
};

export type DocumentFormInitial = {
  documentId: string;
  expectedVersion: number;
  counterpartyId: string;
  warehouseId: string;
  issueDate: string;
  dueDate: string;
  notes: string;
  lines: Array<Omit<LineDraft, "key"> & { key: string }>;
};

function emptyLine(key = createBrowserId()): LineDraft {
  return { key, itemId: "", quantity: "1", unitPrice: "0", discountRate: "0", taxRate: "10" };
}

export function DocumentForm({
  kind,
  counterparties,
  items,
  warehouses,
  today,
  initial,
}: {
  kind: DocumentKind;
  counterparties: CounterpartyRow[];
  items: ItemRow[];
  warehouses: WarehouseRow[];
  today: string;
  initial?: DocumentFormInitial;
}) {
  const [state, action] = useActionState(initial ? updateDraftDocumentAction : createDocumentAction, initialFormState);
  const [lines, setLines] = useState<LineDraft[]>(() => initial?.lines ?? [emptyLine("draft-line")]);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.status === "success") formRef.current?.closest("details")?.removeAttribute("open");
  }, [state]);

  return <form ref={formRef} action={action} className="form-grid">
    <input type="hidden" name="kind" value={kind} />
    {initial ? <><input type="hidden" name="documentId" value={initial.documentId} /><input type="hidden" name="expectedVersion" value={initial.expectedVersion} /></> : null}
    <label className="full"><span>거래처 *</span><select name="counterpartyId" required defaultValue={initial?.counterpartyId ?? ""}><option value="" disabled>거래처 선택</option>{counterparties.map((row) => <option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <label><span>발행일 *</span><input name="issueDate" type="date" defaultValue={initial?.issueDate ?? today} required /></label>
    <label><span>납기·지급 예정일</span><input name="dueDate" type="date" defaultValue={initial?.dueDate ?? ""} /></label>
    <label className="full"><span>창고{kind === "shipment" || kind === "receipt" || kind === "sales_order" ? " · 확정 시 필수" : ""}</span><select name="warehouseId" defaultValue={initial?.warehouseId ?? ""}><option value="">미지정</option>{warehouses.map((row) => <option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select></label>
    <div className="full document-lines">
      <header className="card-header"><div><h3>품목 행</h3><p>여러 품목을 한 문서에 등록합니다. 할인율은 행 단위입니다.</p></div><div className="row-actions"><span className="muted">{lines.length}/50행</span><button type="button" className="button small" disabled={lines.length >= 50} onClick={() => setLines((current) => [...current, emptyLine()])}>행 추가</button></div></header>
      {lines.map((line, index) => (
        <fieldset key={line.key} className="document-line-row">
          <legend>행 {index + 1}</legend>
          <label><span>품목 *</span><select name={`lines.${index}.itemId`} required defaultValue={line.itemId}><option value="" disabled>품목 선택</option>{items.map((row) => <option value={row.id} key={row.id}>{row.sku} · {row.name}</option>)}</select></label>
          <label><span>수량 *</span><input name={`lines.${index}.quantity`} inputMode="decimal" defaultValue={line.quantity} required /></label>
          <label><span>단가 *</span><input name={`lines.${index}.unitPrice`} inputMode="decimal" defaultValue={line.unitPrice} required /></label>
          <label><span>할인율(%)</span><input name={`lines.${index}.discountRate`} inputMode="decimal" defaultValue={line.discountRate} required /></label>
          <label><span>부가세율(%)</span><input name={`lines.${index}.taxRate`} inputMode="decimal" defaultValue={line.taxRate} required /></label>
          {lines.length > 1 ? <button type="button" className="button small danger" onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}>행 제외</button> : null}
        </fieldset>
      ))}
    </div>
    <label className="full"><span>비고</span><textarea name="notes" maxLength={2000} defaultValue={initial?.notes ?? ""} placeholder="거래 조건, 설치 범위 등" /></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>{initial ? "초안 수정" : "문서 작성"}</SubmitButton></div>
  </form>;
}

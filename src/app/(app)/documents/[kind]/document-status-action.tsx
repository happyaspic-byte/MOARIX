"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { DocumentStatus } from "@/lib/domain/document-state";
import type { DocumentKind } from "@/lib/services/documents";
import type { WarehouseRow } from "@/lib/services/master-data";
import { transitionDocumentAction } from "./actions";

export function DocumentStatusAction({
  id,
  kind,
  status,
  label,
  danger = false,
  warehouseId,
  warehouses = [],
}: {
  id: string;
  kind: DocumentKind;
  status: DocumentStatus;
  label: string;
  danger?: boolean;
  warehouseId?: string | null;
  warehouses?: WarehouseRow[];
}) {
  const [state, action] = useActionState(transitionDocumentAction, initialFormState);
  const choosesWarehouse = status === "posted" && (kind === "shipment" || kind === "receipt");
  return <form action={action} className="inline-action-form">
    <input type="hidden" name="documentId" value={id} />
    <input type="hidden" name="kind" value={kind} />
    <input type="hidden" name="nextStatus" value={status} />
    {choosesWarehouse ? <select name="warehouseId" defaultValue={warehouseId ?? ""} aria-label={`${label} 창고`} required><option value="" disabled>창고 선택</option>{warehouses.map((row) => <option value={row.id} key={row.id}>{row.code} · {row.name}</option>)}</select> : null}
    <SubmitButton className={`button small${danger ? " danger" : ""}`}>{label}</SubmitButton>
    <FormMessage state={state} />
  </form>;
}

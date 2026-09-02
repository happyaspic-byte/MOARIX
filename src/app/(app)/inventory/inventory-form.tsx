"use client";

import { useActionState, useRef } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { ItemRow, WarehouseRow } from "@/lib/services/master-data";
import { createClientKey } from "@/lib/client-key";
import { postInventoryMovementAction } from "./actions";

export function InventoryForm({ items, warehouses, idempotencyKey }: { items: ItemRow[]; warehouses: WarehouseRow[]; idempotencyKey: string }) {
  const [state, action] = useActionState(postInventoryMovementAction, initialFormState);
  const idempotencyInput = useRef<HTMLInputElement>(null);

  return (
    <form
      action={action}
      className="form-grid"
      onSubmit={() => {
        if (state.status === "success" && idempotencyInput.current) {
          idempotencyInput.current.value = createClientKey();
        }
      }}
    >
      <input ref={idempotencyInput} type="hidden" name="idempotencyKey" defaultValue={idempotencyKey} />
      <label><span>창고 *</span><select name="warehouseId" required defaultValue=""><option value="" disabled>창고 선택</option>{warehouses.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
      <label><span>품목 *</span><select name="itemId" required defaultValue=""><option value="" disabled>품목 선택</option>{items.filter((row) => row.track_inventory).map((row) => <option key={row.id} value={row.id}>{row.sku} · {row.name}</option>)}</select></label>
      <label><span>변동 유형 *</span><select name="movementType" defaultValue="receipt"><option value="receipt">입고</option><option value="issue">출고</option><option value="adjustment">실사 조정</option></select></label>
      <label><span>수량 *</span><input name="quantity" inputMode="decimal" defaultValue="1" required /><small className="helper-text">조정만 음수 입력이 가능합니다.</small></label>
      <label><span>단가</span><input name="unitCost" inputMode="decimal" defaultValue="0" required /></label>
      <label className="full"><span>사유 *</span><textarea name="reason" maxLength={300} placeholder="입고·출고 또는 조정 사유" required /></label>
      <div className="full"><FormMessage state={state} /></div>
      <div className="form-actions"><SubmitButton>원장 반영</SubmitButton></div>
    </form>
  );
}

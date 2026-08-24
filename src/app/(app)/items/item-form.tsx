"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createItemAction } from "./actions";

export function ItemForm() {
  const [state, action] = useActionState(createItemAction, initialFormState);
  return <form action={action} className="form-grid">
    <label><span>품목 코드 *</span><input name="sku" placeholder="ITEM-001" maxLength={50} required /></label>
    <label><span>유형 *</span><select name="kind" defaultValue="product"><option value="product">상품</option><option value="material">원재료</option><option value="service">서비스</option></select></label>
    <label className="full"><span>품목명 *</span><input name="name" maxLength={160} required /></label>
    <label><span>단위 *</span><input name="unit" defaultValue="EA" maxLength={12} required /></label>
    <label><span>부가세율(%)</span><input name="taxRate" inputMode="decimal" defaultValue="10" required /></label>
    <label><span>판매 단가</span><input name="salePrice" inputMode="decimal" defaultValue="0" required /></label>
    <label><span>구매 단가</span><input name="purchasePrice" inputMode="decimal" defaultValue="0" required /></label>
    <label><span>재주문 기준</span><input name="reorderPoint" inputMode="decimal" defaultValue="0" required /></label>
    <label className="checkbox-field"><input name="trackInventory" type="checkbox" defaultChecked /><span>재고 수량 추적</span></label>
    <div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>품목 등록</SubmitButton></div>
  </form>;
}

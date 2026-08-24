"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { createWarehouseAction } from "./actions";

export function WarehouseForm() { const [state, action] = useActionState(createWarehouseAction, initialFormState); return <form action={action} className="form-grid"><label><span>창고 코드 *</span><input name="code" placeholder="MAIN" maxLength={30} required /></label><label><span>창고명 *</span><input name="name" maxLength={100} required /></label><label className="full"><span>위치</span><input name="location" maxLength={200} placeholder="주소 또는 현장 위치" /></label><div className="full"><FormMessage state={state} /></div><div className="form-actions"><SubmitButton>창고 등록</SubmitButton></div></form>; }

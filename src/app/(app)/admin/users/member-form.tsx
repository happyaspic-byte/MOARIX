"use client";

import { useActionState } from "react";
import { FormMessage, initialFormState } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import type { MemberRow } from "@/lib/services/admin";
import type { Role } from "@/lib/security/permissions";
import { createMemberAction, updateMemberAction } from "./actions";

const roleLabels: Record<Role, string> = { owner: "소유자", admin: "관리자", manager: "매니저", member: "실무자", viewer: "조회자" };
const editableRoles: Role[] = ["owner", "admin", "manager", "member", "viewer"];

export function MemberForm({ canAssignOwner }: { canAssignOwner: boolean }) {
  const [state, action] = useActionState(createMemberAction, initialFormState);
  return <form action={action} className="form-grid">
    <label><span>이름 *</span><input name="name" maxLength={100} required /></label>
    <label><span>이메일 *</span><input name="email" type="email" maxLength={254} required /></label>
    <label><span>초기 비밀번호 *</span><input name="password" type="password" minLength={12} maxLength={128} autoComplete="new-password" required /><small className="helper-text">12자 이상, 별도 보안 채널로 전달하세요.</small></label>
    <label><span>역할 *</span><select name="role" defaultValue="member">{editableRoles.filter((role) => canAssignOwner || role !== "owner").map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}</select></label>
    <div className="full"><FormMessage state={state} /></div>
    <div className="form-actions"><SubmitButton>사용자 추가</SubmitButton></div>
  </form>;
}

export function MemberSettingsForm({ member, canAssignOwner, disabled }: { member: MemberRow; canAssignOwner: boolean; disabled: boolean }) {
  const [state, action] = useActionState(updateMemberAction, initialFormState);
  if (disabled) return <span className="helper-text">소유자만 변경 가능</span>;
  return <form action={action} className="inline-admin-form">
    <input type="hidden" name="userId" value={member.user_id} />
    <select aria-label={`${member.name} 역할`} name="role" defaultValue={member.role}>{editableRoles.filter((role) => canAssignOwner || role !== "owner").map((role) => <option value={role} key={role}>{roleLabels[role]}</option>)}</select>
    <select aria-label={`${member.name} 상태`} name="isActive" defaultValue={String(member.is_active)}><option value="true">활성</option><option value="false">비활성</option></select>
    <SubmitButton className="button small">저장</SubmitButton>
    <FormMessage state={state} />
  </form>;
}

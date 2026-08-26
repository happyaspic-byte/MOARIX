import type { Permission, Role } from "@/lib/security/permissions";
import { hasPermission } from "@/lib/security/permissions";
import { hasApiTokenScope } from "@/lib/auth/api-token";
import { ApiError } from "./errors";

export function assertApiCommandAccess(
  actor: { role: Role; scopes: readonly string[] },
  requirement: { permission: Permission; scope: string },
) {
  if (!hasPermission(actor.role, requirement.permission) || !hasApiTokenScope(actor.scopes, requirement.scope)) {
    throw new ApiError("FORBIDDEN", 403, "이 명령을 실행할 권한 또는 API 토큰 범위가 없습니다.");
  }
}

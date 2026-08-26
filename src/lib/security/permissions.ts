export const roles = ["owner", "admin", "manager", "member", "viewer"] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "dashboard:read",
  "master:read",
  "master:write",
  "documents:read",
  "documents:write",
  "documents:approve",
  "inventory:read",
  "inventory:write",
  "assets:read",
  "assets:write",
  "service:read",
  "service:write",
  "trips:read",
  "trips:write",
  "trips:approve",
  "reports:read",
  "users:read",
  "users:manage",
  "settings:manage",
  "audit:read",
] as const;

export type Permission = (typeof permissions)[number];

const readOnly = new Set<Permission>([
  "dashboard:read",
  "master:read",
  "documents:read",
  "inventory:read",
  "assets:read",
  "service:read",
  "trips:read",
  "reports:read",
]);

const rolePermissions: Record<Role, ReadonlySet<Permission>> = {
  owner: new Set(permissions),
  admin: new Set(permissions.filter((permission) => permission !== "settings:manage")),
  manager: new Set([
    ...readOnly,
    "master:write",
    "documents:write",
    "documents:approve",
    "inventory:write",
    "assets:write",
    "service:write",
    "trips:write",
    "trips:approve",
    "users:read",
    "audit:read",
  ]),
  member: new Set([
    ...readOnly,
    "master:write",
    "documents:write",
    "inventory:write",
    "assets:write",
    "service:write",
    "trips:write",
  ]),
  viewer: readOnly,
};

export function hasPermission(role: Role, permission: Permission) {
  return rolePermissions[role].has(permission);
}

export function assertPermission(role: Role, permission: Permission) {
  if (!hasPermission(role, permission)) {
    throw new Error(`Permission denied: ${permission}`);
  }
}

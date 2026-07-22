import type { Permission, Role, User } from "../shared/types";

export const rolePermissions: Record<Role, Permission[]> = {
  seller: [
    "products:read",
    "stock:move",
    "inventory:write",
    "labels:print"
  ],
  admin: [
    "products:read",
    "products:write",
    "stock:move",
    "inventory:write",
    "reports:read",
    "imports:write",
    "merge:write",
    "schedule:manage",
    "staff:manage",
    "saby:manage",
    "users:manage",
    "techlog:read",
    "labels:print"
  ],
  super_admin: [
    "products:read",
    "products:write",
    "stock:move",
    "inventory:write",
    "reports:read",
    "imports:write",
    "merge:write",
    "schedule:manage",
    "staff:manage",
    "saby:manage",
    "users:manage",
    "roles:manage",
    "techlog:read",
    "labels:print"
  ]
};

export function hasPermission(user: User, permission: Permission) {
  return user.status === "active" && (user.permissions.includes(permission) || rolePermissions[user.role].includes(permission));
}

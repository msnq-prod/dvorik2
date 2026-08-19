import type { User } from "../shared/types";
import { hasPermission } from "./permissions";

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown
  ) {
    super(message);
  }
}

export function requirePermission(user: User, permission: Parameters<typeof hasPermission>[1]) {
  if (!hasPermission(user, permission)) {
    throw new DomainError("FORBIDDEN", "Недостаточно прав", 403, { permission });
  }
}

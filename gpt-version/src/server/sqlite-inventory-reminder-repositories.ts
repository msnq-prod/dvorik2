import type { DatabaseContext } from "./database";
import type { InventoryReminderRepositories } from "./inventory-reminder-service";
import { createSqliteIdempotencyRepository } from "./sqlite-idempotency-repository";
import { createAuditRepository, createNotificationsRepository, createOutboxRepository } from "./sqlite-stock-command-repositories";

export function createSqliteInventoryReminderRepositories(database: DatabaseContext): InventoryReminderRepositories {
  return {
    inventory: { active() { const row = database.query<{ id: string; started_at: string }>("SELECT id,started_at FROM inventory_sessions WHERE status IN ('active','closing') ORDER BY started_at,id LIMIT 1")[0]; return row ? { id: row.id, startedAt: row.started_at } : undefined; } },
    recipients: { activeManagerIds() { return database.query<{ id: string }>("SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.role_id IN ('admin','super_admin') WHERE u.status='active' AND (SELECT count(*) FROM user_roles x WHERE x.user_id=u.id)=1 ORDER BY u.id").map((row) => row.id); } },
    notifications: createNotificationsRepository(database),
    outbox: createOutboxRepository(database),
    audit: createAuditRepository(database),
    idempotency: createSqliteIdempotencyRepository(database)
  };
}

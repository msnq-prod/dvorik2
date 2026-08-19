import { nanoid } from "nanoid";
import type { CashEvent, EventDeliveryResult } from "../../contracts/events";
import type { DatabaseAdapter } from "../../server/database";

export class PlatformCashEventService {
  constructor(private readonly database: DatabaseAdapter, private readonly now: () => string = () => new Date().toISOString()) {}

  apply(event: CashEvent): EventDeliveryResult {
    return this.database.transaction((db) => {
      const existing = db.query<{ status: string; result_code: string | null }>(
        "SELECT status,result_code FROM integration_inbox WHERE event_id=?",
        [event.eventId]
      )[0];
      if (existing) {
        return {
          eventId: event.eventId,
          status: existing.status === "requires_action" ? "requires_action" : "duplicate",
          ...(existing.result_code ? { code: existing.result_code } : {})
        };
      }

      const requiresAction = event.eventType === "CashExceptionRaised";
      const at = this.now();
      db.execute(`INSERT INTO integration_inbox(event_id,producer,event_type,event_version,aggregate_id,payload_json,status,result_code,received_at,completed_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [
        event.eventId, event.producer, event.eventType, event.eventVersion, event.aggregateId,
        JSON.stringify(event.payload), requiresAction ? "requires_action" : "applied",
        requiresAction ? "CASH_EXCEPTION" : null, at, at
      ]);

      if (requiresAction) {
        const managers = db.query<{ id: string }>(
          "SELECT DISTINCT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id WHERE u.status='active' AND ur.role_id IN ('admin','super_admin')"
        );
        const payload = JSON.stringify({
          schemaVersion: 1,
          value: { schemaVersion: 1, eventType: "cash.exception", sourceEventId: event.eventId, ...event.payload }
        });
        for (const manager of managers) {
          db.execute(
            "INSERT INTO webapp_notifications(id,recipient_user_id,type,payload_json,is_read,created_at,version,updated_at) VALUES (?,?, 'cash.exception',?,0,?,0,?)",
            [nanoid(), manager.id, payload, at, at]
          );
          db.execute(`INSERT INTO outbox_messages(id,channel,recipient_user_id,type,payload_json,status,idempotency_key,attempt_count,max_attempts,available_at,created_at,version,updated_at)
            VALUES (?,'telegram',?,'cash.exception',?,'pending',?,0,8,?,?,0,?) ON CONFLICT DO NOTHING`, [
            nanoid(), manager.id, payload, `cash-exception:${event.eventId}:${manager.id}`, at, at, at
          ]);
        }
      }

      return {
        eventId: event.eventId,
        status: requiresAction ? "requires_action" : "applied",
        ...(requiresAction ? { code: "CASH_EXCEPTION" } : {})
      };
    }, { mode: "immediate" });
  }
}

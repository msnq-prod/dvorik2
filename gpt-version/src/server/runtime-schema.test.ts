import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDatabase } from "./database";
import { applyMigrations } from "./migrations";

const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-runtime-schema-")), "runtime.sqlite");
const database = openDatabase(file);
applyMigrations(database);

const requiredColumns: Record<string, readonly string[]> = {
  users: ["version"],
  sessions: ["token_hash", "version", "updated_at"],
  shifts: ["start_time", "end_time", "version", "updated_at"],
  shift_swap_requests: ["version", "updated_at", "resolved_at", "resolved_by_user_id", "source_shift_version"],
  imports: ["source_json", "migration_batch_id", "version", "updated_at"],
  import_rows: ["version", "updated_at"],
  merge_jobs: ["version", "updated_at"],
  label_jobs: ["version", "updated_at"],
  notification_preferences: ["version", "updated_at"],
  outbox_messages: ["max_attempts", "lease_owner", "lease_token", "lease_expires_at", "last_error_code", "failed_at", "version", "updated_at"],
  audit_entries: ["request_id", "version", "updated_at"],
  idempotency_keys: ["request_hash", "response_json", "version", "updated_at"],
  migration_batches: ["source_type", "source_ref", "source_checksum", "report_json", "version", "updated_at"],
  telegram_updates: ["payload_json", "status", "attempt_count", "last_error_code", "version", "updated_at"],
  webapp_notifications: ["recipient_user_id", "payload_json", "is_read", "read_at", "version", "updated_at"]
  ,employee_profiles: ["user_id", "position", "hired_on", "dismissed_on", "status", "version", "updated_at"]
  ,hr_events: ["user_id", "type", "start_date", "end_date", "shift_id", "minutes_late", "created_by_user_id"]
  ,shift_exchange_requests: ["from_shift_id", "to_shift_id", "from_user_id", "to_user_id", "from_shift_version", "to_shift_version", "warning_json", "version"]
};

for (const [table, required] of Object.entries(requiredColumns)) {
  const actual = new Set(database.query<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`).map((row) => row.name));
  assert.deepEqual(required.filter((column) => !actual.has(column)), [], `${table} missing mapper/runtime columns`);
}
assert.equal(database.query("PRAGMA foreign_key_check").length, 0);
database.close();
fs.rmSync(path.dirname(file), { recursive: true, force: true });
console.log("runtime schema tests passed");

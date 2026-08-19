import assert from "node:assert/strict";
import { assertDeferredWorkerType, deferredLaunchFeatureForRoute } from "./launch-scope";

assert.equal(deferredLaunchFeatureForRoute("/api/imports/preview"), "imports");
assert.equal(deferredLaunchFeatureForRoute("/api/merges/candidates"), "merge");
assert.equal(deferredLaunchFeatureForRoute("/api/schedule/rotation/commit"), "schedule_rotation");
assert.equal(deferredLaunchFeatureForRoute("/api/reports/low/telegram"), "telegram_report_delivery");
assert.equal(deferredLaunchFeatureForRoute("/api/reports/low/pdf"), undefined);
assert.equal(deferredLaunchFeatureForRoute("/api/media/upload"), undefined);
assert.equal(assertDeferredWorkerType("telegram_calendar"), false);
assert.equal(assertDeferredWorkerType("daily_digest"), false);
assert.equal(assertDeferredWorkerType("telegram_onboarding_approve"), true);

console.log("launch scope tests passed");

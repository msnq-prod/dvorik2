import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { SwapShiftSelector, exchangeTargetShiftOptions, ownScheduledShiftOptions } from "./SchedulePage";

const shifts = [
  { id: "own", date: "2026-07-11", start: "00:00", end: "23:59", locationId: "loc-main", employeeIds: ["seller"], status: "scheduled" as const, comment: "mine" },
  { id: "foreign", date: "2026-07-11", start: "00:00", end: "23:59", locationId: "loc-house", employeeIds: ["admin"], status: "scheduled" as const, comment: "private" },
  { id: "cancelled", date: "2026-07-11", start: "00:00", end: "23:59", locationId: "loc-main", employeeIds: ["seller"], status: "cancelled" as const, comment: "old" }
];
assert.deepEqual(ownScheduledShiftOptions(shifts, "seller").map((shift) => shift.id), ["own"]);
assert.deepEqual(exchangeTargetShiftOptions(shifts, "seller").map((shift) => shift.id), ["foreign"]);
assert.deepEqual(ownScheduledShiftOptions(shifts, "without-shifts"), []);
const empty = renderToStaticMarkup(<SwapShiftSelector shifts={shifts} userId="without-shifts" users={[]} locations={[]} value="" onChange={() => undefined} />);
assert.match(empty, /Нет своих смен для обмена/);
assert.doesNotMatch(empty, /foreign|private|loc-house/);
const own = renderToStaticMarkup(<SwapShiftSelector shifts={shifts} userId="seller" users={[]} locations={[]} value="own" onChange={() => undefined} />);
assert.match(own, /value="own"/);
assert.doesNotMatch(own, /value="foreign"/);
console.log("schedule page tests passed");

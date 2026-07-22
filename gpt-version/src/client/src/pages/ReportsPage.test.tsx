import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MovementReportTable } from "./ReportsPage";

const row = { id: "row-1", occurredAt: "2026-07-11T12:34:56.000Z", type: "receipt", productId: "p-1", productName: "Тестовый товар", fromLocationId: null, fromLocationName: null, toLocationId: "loc-main", toLocationName: "Склад", quantity: 2, actorId: "u-admin", actorName: "Админ", reason: "Тест", reversedOperationId: null, inventoryExpected: null, inventoryActual: null, inventoryDelta: null };
const rendered = renderToStaticMarkup(<MovementReportTable rows={[row]} />);
assert.match(rendered, /2026-07-11 12:34/);
assert.match(rendered, /Тестовый товар/);
assert.match(rendered, /Тест/);
assert.match(renderToStaticMarkup(<MovementReportTable rows={[]} />), /Движений нет/);
console.log("reports page tests passed");

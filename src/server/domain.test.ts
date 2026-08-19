import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { signTelegramInitData, verifyTelegramInitData } from "./auth";
import { buildBarcode, encodeCode128B, encodeEan13, isValidEan13 } from "./barcodes";
import {
  acceptSwap,
  applyBufferedStockOperations,
  applyInventory,
  applyStockOperation,
  commitCsvImport,
  commitFutureReplacement,
  commitRotation,
  commitProductMerge,
  cancelSwap,
  copyShift,
  createShift,
  createSwapRequest,
  declineSwap,
  detectImportColumnMapping,
  detectImportHeaderRow,
  DomainError,
  inventorySnapshot,
  listInventoryDiscrepancies,
  listVisibleScheduleShifts,
  listVisibleScheduleSwaps,
  parseImportRows,
  previewCsvImport,
  previewFutureReplacement,
  previewRotation,
  previewProductMerge,
  refreshScheduleState,
  reverseOperation,
  setScheduleDay,
  undoCsvImport,
  undoProductMerge,
  updateShift
} from "./domain";
import { createBackup, db, findBalance, listBackups, loadState, restoreBackup, saveState } from "./store";
import { approveTelegramOnboarding, handleTelegramUpdate, setNotificationPreference } from "./telegram";
import { dispatchOutbox } from "./outbox";
import { dispatchTelegramOutbox } from "./telegram-worker";
import { queueReportTelegram, renderReportPdf, reportRows } from "./reports";

const admin = db.users.find((user) => user.id === "u-admin")!;
const seller = db.users.find((user) => user.id === "u-seller")!;
const sellerWithoutShifts = { ...seller, id: "u-seller-without-shifts" };
assert.deepEqual(listVisibleScheduleShifts(sellerWithoutShifts), db.shifts);
assert.deepEqual(listVisibleScheduleSwaps(sellerWithoutShifts), []);
assert.ok(listVisibleScheduleShifts(admin).some((shift) => !shift.employeeIds.includes(seller.id)));
db.swaps.unshift({ id: "privacy-swap", fromShiftId: "shift-2", fromUserId: admin.id, toUserId: sellerWithoutShifts.id, status: "pending", createdAt: "2026-07-11T00:00:00.000Z" });
const privacySwap = listVisibleScheduleSwaps(sellerWithoutShifts)[0];
assert.ok(privacySwap);
assert.equal("fromShiftId" in privacySwap, false);
assert.equal(privacySwap.id, "privacy-swap");
assert.equal(listVisibleScheduleShifts(sellerWithoutShifts).some((shift) => shift.id === "shift-2"), true);
const swapsBeforeForeignRequest = db.swaps.length;
const outboxBeforeForeignRequest = db.outbox.length;
assert.throws(() => createSwapRequest(sellerWithoutShifts, "shift-2", admin.id), /только свою смену/);
assert.equal(db.swaps.length, swapsBeforeForeignRequest);
assert.equal(db.outbox.length, outboxBeforeForeignRequest);

assert.equal(isValidEan13("2000000000022"), true);
assert.equal(isValidEan13("4601234567890"), false);
assert.equal(buildBarcode("2000000000022", "p-2").type, "ean13");
assert.ok(encodeEan13("2000000000022").startsWith("101"));
assert.equal(buildBarcode("A-100", "p-1").type, "code128");
assert.ok(encodeCode128B("A-100").length > 60);

db.products.push({ id: "p-drift", officialName: "Drift fixture", localName: "Drift", unit: "кг", photoUrl: "", category: "test", tags: [], status: "active", identifiers: [], lowStockThreshold: 0 });
db.balances.push({ productId: "p-drift", locationId: "loc-main", quantity: 0, version: 0 });
const driftOperationsBefore = db.operations.length;
const driftAuditBefore = db.audit.length;
for (let index = 0; index < 1_000; index += 1) {
  applyStockOperation({ user: admin, type: "receipt", productId: "p-drift", toLocationId: "loc-main", quantity: 0.001, reason: "drift fixture", idempotencyKey: `drift-${index}` });
}
assert.equal(findBalance("p-drift", "loc-main").quantity, 1);
db.operations.splice(0, db.operations.length - driftOperationsBefore);
db.audit.splice(0, db.audit.length - driftAuditBefore);
for (let index = 0; index < 1_000; index += 1) delete db.idempotency[`stock:drift-${index}`];
db.balances.splice(db.balances.findIndex((balance) => balance.productId === "p-drift"), 1);
db.products.splice(db.products.findIndex((product) => product.id === "p-drift"), 1);

const before = findBalance("p-1", "loc-main").quantity;
const op = applyStockOperation({
  user: seller,
  type: "transfer",
  productId: "p-1",
  fromLocationId: "loc-main",
  toLocationId: "loc-counter",
  quantity: 1,
  reason: "test",
  idempotencyKey: "test-transfer"
});
const duplicate = applyStockOperation({
  user: seller,
  type: "transfer",
  productId: "p-1",
  fromLocationId: "loc-main",
  toLocationId: "loc-counter",
  quantity: 1,
  reason: "test",
  idempotencyKey: "test-transfer"
});
assert.equal(op.id, duplicate.id);
assert.equal(findBalance("p-1", "loc-main").quantity, before - 1);

applyStockOperation({
  user: seller,
  type: "receipt",
  productId: "p-1",
  toLocationId: "loc-counter",
  quantity: 1,
  reason: "shared idempotency stock",
  idempotencyKey: "shared-key"
});
const sharedInventoryResult = applyInventory(admin, inventorySnapshot("loc-counter").map((row) => ({ ...row, actual: row.expected })), "shared idempotency inventory", "shared-key");
assert.ok(Array.isArray(sharedInventoryResult));

assert.throws(
  () =>
    applyStockOperation({
      user: seller,
      type: "write_off",
      productId: "p-1",
      fromLocationId: "loc-counter",
      quantity: 9999,
      reason: "test",
      idempotencyKey: "test-negative"
    }),
  DomainError
);

const rollbackBalance = findBalance("p-1", "loc-counter");
const rollbackBefore = { quantity: rollbackBalance.quantity, version: rollbackBalance.version, operations: db.operations.length, audit: db.audit.length };
assert.throws(() => applyStockOperation({
  user: seller,
  type: "write_off",
  productId: "p-1",
  fromLocationId: "loc-counter",
  quantity: rollbackBalance.quantity + 1,
  reason: "transaction rollback",
  idempotencyKey: "test-stock-rollback"
}), /Остаток не может стать отрицательным/);
assert.deepEqual({ quantity: rollbackBalance.quantity, version: rollbackBalance.version, operations: db.operations.length, audit: db.audit.length }, rollbackBefore);
assert.equal(db.idempotency["stock:test-stock-rollback"], undefined);

const tabletBatch = applyBufferedStockOperations(admin, [
  { id: "tablet-transfer", type: "transfer", productId: "p-1", fromLocationId: "loc-main", toLocationId: "loc-counter", quantity: 1, reason: "Планшет: перемещение" },
  { id: "tablet-inventory", type: "inventory", productId: "p-1", toLocationId: "loc-counter", actual: findBalance("p-1", "loc-counter").quantity + 1, reason: "Планшет: пересчёт" }
], "tablet-buffer-success");
assert.deepEqual(tabletBatch.map((item) => item.status), ["applied", "applied"]);
const tabletStopped = applyBufferedStockOperations(admin, [
  { id: "tablet-fail", type: "write_off", productId: "p-1", fromLocationId: "loc-counter", quantity: 999999, reason: "Недопустимо" },
  { id: "tablet-not-run", type: "write_off", productId: "p-1", fromLocationId: "loc-counter", quantity: 1, reason: "Не выполнять" }
], "tablet-buffer-failed");
assert.deepEqual(tabletStopped.map((item) => item.status), ["failed"]);

assert.throws(
  () =>
    applyStockOperation({
      user: seller,
      type: "receipt",
      productId: "missing-product",
      toLocationId: "loc-main",
      quantity: 1,
      reason: "test",
      idempotencyKey: "test-missing-product"
    }),
  /Товар не найден/
);

assert.throws(
  () =>
    applyStockOperation({
      user: seller,
      type: "receipt",
      productId: "p-1",
      toLocationId: "missing-location",
      quantity: 1,
      reason: "test",
      idempotencyKey: "test-missing-location"
    }),
  /Локация не найдена/
);

const snapshot = inventorySnapshot("loc-main");
applyStockOperation({
  user: seller,
  type: "receipt",
  productId: "p-2",
  toLocationId: "loc-main",
  quantity: 1,
  reason: "conflict",
  idempotencyKey: "test-conflict"
});
assert.throws(
  () => applyInventory(admin, snapshot.map((row) => ({ ...row, actual: row.expected })), "test", "test-inventory"),
  /Остатки изменились/
);

assert.throws(
  () => applyInventory(admin, snapshot.map((row) => ({ ...row, actual: row.expected })), "test", ""),
  /Нужен idempotency key/
);

const freshSnapshot = inventorySnapshot("loc-counter");
assert.throws(
  () => applyInventory(admin, freshSnapshot.map((row) => ({ ...row, actual: -1 })), "test", "test-negative-inventory"),
  /Фактический остаток/
);

const discrepancySnapshot = inventorySnapshot("loc-counter").filter((row) => row.productId === "p-1");
const discrepancyOperations = applyInventory(
  admin,
  discrepancySnapshot.map((row) => ({ ...row, actual: row.expected + 2 })),
  "count variance",
  "test-inventory-discrepancy"
);
assert.equal(discrepancyOperations.length, 1);
const discrepancies = listInventoryDiscrepancies(admin, { productId: "p-1", locationId: "loc-counter" });
const discrepancy = discrepancies.find((item) => item.id === discrepancyOperations[0]?.id)!;
assert.deepEqual(
  { expected: discrepancy.expected, actual: discrepancy.actual, delta: discrepancy.delta, quantity: discrepancy.quantity },
  { expected: discrepancySnapshot[0]?.expected, actual: discrepancySnapshot[0]!.expected + 2, delta: 2, quantity: 2 }
);

assert.throws(
  () => reverseOperation(admin, "op-seed-1", ""),
  /Нужен idempotency key/
);

const reversed = reverseOperation(admin, op.id, "test-reverse-op");
assert.throws(
  () => reverseOperation(admin, reversed.id, "test-reverse-reversal"),
  /Нельзя отменить операцию отмены/
);

assert.throws(
  () => createSwapRequest(seller, "shift-1", "u-blocked"),
  /не найден или не активен/
);

assert.throws(
  () => createSwapRequest(seller, "shift-1", "u-seller"),
  /самому себе/
);

const swapToCancel = createSwapRequest(seller, "shift-1", "u-admin");
assert.equal(swapToCancel.status, "pending");
assert.throws(() => cancelSwap(admin, swapToCancel.id), /только инициатор/);
assert.equal(cancelSwap(seller, swapToCancel.id).status, "cancelled");

const swapToDecline = createSwapRequest(seller, "shift-1", "u-admin");
assert.throws(() => declineSwap(seller, swapToDecline.id), /только выбранный сотрудник/);
assert.equal(declineSwap(admin, swapToDecline.id).status, "declined");

const cancelledShift = db.shifts.find((shift) => shift.id === "shift-2")!;
cancelledShift.status = "cancelled";
assert.throws(() => createSwapRequest(admin, "shift-2", "u-seller"), /запланированной смены/);
cancelledShift.status = "scheduled";

assert.throws(
  () => createShift(seller, { date: "2026-06-28", start: "09:00", end: "12:00", locationId: "loc-main", employeeIds: ["u-seller"], status: "scheduled" }),
  /Недостаточно прав/
);
assert.throws(
  () => createShift(admin, { date: "2026-06-26", start: "10:00", end: "12:00", locationId: "loc-main", employeeIds: ["u-seller"], status: "scheduled" }),
  /смена в этот день/
);
const multiEmployeeShift = createShift(admin, { date: "2026-06-30", start: "09:00", end: "12:00", locationId: "loc-main", employeeIds: ["u-seller", "u-admin"], status: "scheduled" });
assert.deepEqual(multiEmployeeShift.employeeIds, ["u-seller", "u-admin"]);
const closedDay = setScheduleDay(admin, { date: "2026-07-01", locationId: "loc-main", status: "closed", comment: "выходной" });
assert.equal(closedDay.status, "closed");
assert.throws(() => createShift(admin, { date: "2026-07-01", start: "00:00", end: "23:59", locationId: "loc-main", employeeIds: ["u-seller"], status: "scheduled" }), /Локация закрыта/);
assert.throws(() => setScheduleDay(admin, { date: "2026-06-30", locationId: "loc-main", status: "closed" }), /Нельзя закрыть день с назначенными сменами/);
setScheduleDay(admin, { date: "2026-07-03", locationId: "loc-house", status: "closed" });
const rotationPreview = previewRotation(admin, { startDate: "2026-07-02", endDate: "2026-07-04", locationId: "loc-house", employeeIds: ["u-seller"] });
assert.deepEqual(rotationPreview.skippedClosedDays, ["2026-07-03"]);
assert.equal(rotationPreview.shifts.length, 2);
const rotationCommitted = commitRotation(admin, { startDate: "2026-07-02", endDate: "2026-07-04", locationId: "loc-house", employeeIds: ["u-seller"], idempotencyKey: "test-rotation" });
assert.equal(rotationCommitted.shiftIds.length, 2);
assert.deepEqual(commitRotation(admin, { startDate: "2026-07-02", endDate: "2026-07-04", locationId: "loc-house", employeeIds: ["u-seller"], idempotencyKey: "test-rotation" }).shiftIds, rotationCommitted.shiftIds);
const futureShift = createShift(admin, { date: "2031-02-01", start: "00:00", end: "23:59", locationId: "loc-house", employeeIds: ["u-seller"], status: "scheduled" });
const replacementPreview = previewFutureReplacement(admin, { fromUserId: "u-seller", toUserId: "u-admin", startDate: "2031-02-01", endDate: "2031-02-02" });
assert.deepEqual(replacementPreview.replacements.map((item) => item.shiftId), [futureShift.id]);
assert.equal(commitFutureReplacement(admin, { fromUserId: "u-seller", toUserId: "u-admin", startDate: "2031-02-01", endDate: "2031-02-02", idempotencyKey: "test-future-replacement" }).replacements.length, 1);
assert.equal(db.shifts.find((shift) => shift.id === futureShift.id)?.employeeIds[0], "u-admin");
const createdShift = createShift(admin, { date: "2026-06-28", start: "09:00", end: "12:00", locationId: "loc-main", employeeIds: ["u-seller"], status: "scheduled", comment: "test shift" });
assert.equal(createdShift.status, "scheduled");
assert.equal(createdShift.start, "10:00");
assert.equal(createdShift.end, "21:00");
assert.throws(() => updateShift(admin, createdShift.id, { date: "2026-06-26", start: "10:00", end: "12:00" }), /смена в этот день/);
const copiedShift = copyShift(admin, createdShift.id, "2026-06-29");
assert.equal(copiedShift.start, createdShift.start);
assert.equal(copiedShift.employeeIds[0], "u-seller");

const acceptedSwap = createSwapRequest(seller, "shift-1", "u-admin");
const acceptedResult = acceptSwap(admin, acceptedSwap.id);
assert.equal(acceptedResult.swap.status, "accepted");
assert.ok(acceptedResult.shift.employeeIds.includes("u-admin"));
assert.throws(() => acceptSwap(admin, acceptedSwap.id), /Заявка уже обработана/);

const swapToCancelledShift = createSwapRequest(seller, createdShift.id, "u-admin");
assert.equal(cancelSwap(seller, swapToCancelledShift.id).status, "cancelled");
assert.throws(() => acceptSwap(admin, swapToCancelledShift.id), /Заявка уже обработана/);

const conflictingTargetSwap = createShift(admin, {
  date: "2026-06-27",
  start: "09:00",
  end: "12:00",
  locationId: "loc-main",
  employeeIds: ["u-seller"],
  status: "scheduled",
  comment: "swap conflict source"
});
const conflictingSwap = createSwapRequest(seller, conflictingTargetSwap.id, "u-admin");
assert.throws(() => acceptSwap(admin, conflictingSwap.id), /У сотрудника уже есть смена в этот день/);

const autoShift = createShift(admin, { date: "2030-01-02", start: "09:00", end: "12:00", locationId: "loc-main", employeeIds: ["u-seller"], status: "scheduled", comment: "auto shift" });
const expiringSwap = createSwapRequest(seller, autoShift.id, "u-admin");
assert.equal(refreshScheduleState(new Date("2030-01-02T10:00:00+10:00"), "test-system").some((item) => item.id === autoShift.id && item.to === "in_progress"), true);
assert.equal(autoShift.status, "in_progress");
assert.equal(expiringSwap.status, "expired");
assert.throws(() => acceptSwap(admin, expiringSwap.id), /Заявка уже обработана/);
refreshScheduleState(new Date("2030-01-03T00:10:00+10:00"), "test-system");
assert.equal(autoShift.status, "completed");

const missedShift = createShift(admin, { date: "2030-01-03", start: "09:00", end: "10:00", locationId: "loc-main", employeeIds: ["u-seller"], status: "scheduled", comment: "missed shift" });
refreshScheduleState(new Date("2030-01-04T00:10:00+10:00"), "test-system");
assert.equal(missedShift.status, "completed");

const tmpState = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-state-")), "state.json");
saveState(tmpState);
const restored = loadState(tmpState);
assert.equal(restored.operations[0]?.id, db.operations[0]?.id);
assert.equal(restored.balances.find((item) => item.productId === "p-1" && item.locationId === "loc-main")?.quantity, findBalance("p-1", "loc-main").quantity);

const backupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dvorik-backup-"));
const backupStatePath = path.join(backupRoot, "state.json");
saveState(backupStatePath);
const backupDir = path.join(backupRoot, "backups");
const backup = createBackup(new Date("2026-06-26T00:00:00.000Z"), backupStatePath, backupDir);
assert.ok(fs.existsSync(backup.path));
assert.ok(backup.bytes > 0);
assert.equal(listBackups(backupDir).length, 1);
const beforeRestoreProductCount = db.products.length;
db.products.pop();
restoreBackup(path.basename(backup.path), backupDir);
assert.equal(db.products.length, beforeRestoreProductCount);

const importDraft = previewCsvImport(admin, "test.csv", "name,sku,quantity,unit\nИмпорт тест,SKU-IMP,2,шт");
const committedImport = commitCsvImport(admin, importDraft.id, "loc-main", "test-import");
assert.equal(committedImport.status, "committed");
assert.equal(committedImport.result?.createdProducts, 1);
assert.equal(commitCsvImport(admin, importDraft.id, "loc-main", "test-import").id, committedImport.id);
const importedProductId = committedImport.result?.productIds?.[0] || "";
assert.ok(db.products.some((product) => product.id === importedProductId));
const revertedImport = undoCsvImport(admin, importDraft.id, "test-import-undo");
assert.equal(revertedImport.status, "reverted");
assert.equal(undoCsvImport(admin, importDraft.id, "test-import-undo").status, "reverted");
assert.equal(db.products.some((product) => product.id === importedProductId), false);

const importWithSupplierMetadata = previewCsvImport(
  admin,
  "supplier-metadata.csv",
  "name,sku,quantity,unit\nПоставка с метаданными,SUP-META-1,3,шт",
  { supplierName: "  ООО Поставщик  ", invoiceNumber: "  НК-2026-001  " }
);
assert.equal(importWithSupplierMetadata.supplierName, "ООО Поставщик");
assert.equal(importWithSupplierMetadata.invoiceNumber, "НК-2026-001");
assert.equal(importWithSupplierMetadata.rows[0]?.sku, "SUP-META-1");

assert.deepEqual(detectImportColumnMapping(["Наименование товара", "Артикул", "Кол-во", "Ед. изм."]), {
  name: "Наименование товара",
  sku: "Артикул",
  quantity: "Кол-во",
  unit: "Ед. изм."
});
assert.deepEqual(detectImportHeaderRow([["Накладная № 8"], [], ["Product name", "Vendor code", "Qty", "UOM"], ["Tea", "T-1", "2", "pcs"]]), {
  headerRowIndex: 2,
  columnMapping: { name: "Product name", sku: "Vendor code", quantity: "Qty", unit: "UOM" }
});
const autoMappedImport = previewCsvImport(
  admin,
  "supplier-semicolon.csv",
  "Счёт поставщика;Июль\n\nНаименование товара;Артикул;Количество;Единица измерения\nЧай;TEA-001;4;шт"
);
assert.deepEqual(autoMappedImport.columnMapping, {
  name: "Наименование товара",
  sku: "Артикул",
  quantity: "Количество",
  unit: "Единица измерения"
});
assert.equal(autoMappedImport.rows.length, 1);
assert.equal(autoMappedImport.rows[0]?.["Наименование товара"], "Чай");
const autoMappedCommit = commitCsvImport(admin, autoMappedImport.id, "loc-main", "test-auto-header-import");
assert.equal(autoMappedCommit.result?.receipts, 1);

const importWithMovement = previewCsvImport(admin, "test-move.csv", "name,sku,quantity,unit\nИмпорт движение,SKU-MOVE,2,шт");
const committedWithMovement = commitCsvImport(admin, importWithMovement.id, "loc-main", "test-import-move");
const movedProductId = committedWithMovement.result?.productIds?.[0] || "";
applyStockOperation({
  user: admin,
  type: "transfer",
  productId: movedProductId,
  fromLocationId: "loc-main",
  toLocationId: "loc-counter",
  quantity: 1,
  reason: "dependent movement",
  idempotencyKey: "test-import-dependent-move"
});
assert.throws(() => undoCsvImport(admin, importWithMovement.id, "test-import-move-undo"), /После импорта были движения/);

const productCountBeforeBadImport = db.products.length;
const badImport = previewCsvImport(admin, "bad.csv", "name,quantity,unit\nХорошая строка,1,шт\nПлохая строка,-1,шт");
assert.equal(badImport.rejectedRows?.length, 1);
const partiallyCommittedImport = commitCsvImport(admin, badImport.id, "loc-main", "test-bad-import");
assert.equal(partiallyCommittedImport.status, "committed");
assert.equal(partiallyCommittedImport.result?.rejectedRows, 1);
assert.equal(db.products.length, productCountBeforeBadImport + 1);
const supplierSkuImport = previewCsvImport(admin, "supplier.csv", "Товар;Артикул;Кол-во;Ед. изм\nПоставочный товар;SUP-42;2;шт", { supplierName: "ООО Поставщик" });
const committedSupplierSku = commitCsvImport(admin, supplierSkuImport.id, "loc-main", "test-supplier-sku");
const supplierSkuProduct = db.products.find((product) => product.id === committedSupplierSku.result?.productIds?.[0]);
assert.match(String(supplierSkuProduct?.identifiers[0]?.supplierId), /^supplier:/);

const xlsxRows = parseImportRows("supply.xlsx", minimalXlsxBase64());
assert.equal(xlsxRows[0].name, "XLSX товар");
assert.equal(xlsxRows[0].quantity, "3");
const xlsRows = parseImportRows("supply.xls", minimalXlsBase64());
assert.equal(xlsRows[0].name, "XLS product");
assert.equal(xlsRows[0].quantity, "4");
assert.equal(xlsRows[0].unit, "шт");

const telegramInitData = signTelegramInitData({
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: 1002, first_name: "Олег" })
}, "dev-token");
assert.equal(verifyTelegramInitData(telegramInitData, "dev-token").id, 1002);
assert.throws(() => verifyTelegramInitData(telegramInitData.replace("1002", "9999"), "dev-token"), /Некорректная подпись/);

const telegramResult = handleTelegramUpdate({ update_id: 991, message: { text: "/start", from: { id: 991, first_name: "Тест" } } });
assert.equal("status" in telegramResult && telegramResult.status, "pending");
assert.equal(db.users.find((user) => user.id === "tg-991")?.status, "pending");
const outboxCount = db.outbox.length;
const duplicateTelegramResult = handleTelegramUpdate({ update_id: 991, message: { text: "/start", from: { id: 991, first_name: "Тест" } } });
assert.equal("userId" in duplicateTelegramResult && duplicateTelegramResult.userId, "tg-991");
assert.equal(db.outbox.length, outboxCount);
const dispatched = await dispatchOutbox(async () => undefined, new Date("2035-01-01T00:00:00.000Z"));
assert.ok(dispatched.sent >= 1);
assert.equal(db.outbox.filter((message) => message.status === "pending").length, 0);
const superAdmin = db.users.find((user) => user.id === "u-super")!;
assert.equal(approveTelegramOnboarding(superAdmin, "tg-991", "seller").status, "active");
assert.throws(() => setNotificationPreference(db.users.find((user) => user.id === "tg-991")!, { channel: "telegram", eventType: "stock_low", deliveryMode: "daily" }), /Daily digest отключён/);
handleTelegramUpdate({ update_id: 992, message: { text: "Мой график", from: { id: 1003, first_name: "Маша" } } });
const firstCalendar = db.outbox.find((message) => message.idempotencyKey === "tg-calendar:992");
assert.equal(firstCalendar?.type, "telegram_calendar");
assert.equal(Array.isArray((firstCalendar?.payload.reply_markup as { inline_keyboard?: unknown[] } | undefined)?.inline_keyboard), true);
handleTelegramUpdate({ update_id: 993, callback_query: { data: "cal:next", from: { id: 1003, first_name: "Маша" } } });
const nextCalendar = db.outbox.find((message) => message.idempotencyKey === "tg-calendar:993");
assert.match(String(nextCalendar?.payload.text), /^График на \d{4}-\d{2}$/);
handleTelegramUpdate({ update_id: 994, callback_query: { data: "cal:2026-06-26", from: { id: 1002, first_name: "Олег" } } });
const dayCalendar = db.outbox.find((message) => message.idempotencyKey === "tg-calendar:994");
assert.match(String(dayCalendar?.payload.text), /2026-06-26:/);
assert.match(String(dayCalendar?.payload.text), /За стойкой/);
const telegramSwapShift = createShift(admin, { date: "2026-08-12", start: "14:00", end: "18:00", locationId: "loc-main", employeeIds: ["u-seller"], status: "scheduled" });
const telegramSwap = createSwapRequest(seller, telegramSwapShift.id, "u-admin");
const swapRequest = db.outbox.find((message) => message.idempotencyKey === `tg-swap-request:${telegramSwap.id}`);
assert.equal(swapRequest?.type, "telegram_swap_request");
assert.equal(Array.isArray((swapRequest?.payload.reply_markup as { inline_keyboard?: unknown[] } | undefined)?.inline_keyboard), true);
handleTelegramUpdate({ update_id: 995, callback_query: { data: `swap:accept:${telegramSwap.id}`, from: { id: 1002, first_name: "Олег" } } });
assert.equal(db.swaps.find((swap) => swap.id === telegramSwap.id)?.status, "accepted");
assert.deepEqual(db.shifts.find((shift) => shift.id === telegramSwapShift.id)?.employeeIds, ["u-admin"]);
process.env.TELEGRAM_BOT_TOKEN = "test-token";
assert.ok((await dispatchTelegramOutbox(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))).sent >= 1);
db.outbox.push({ id: "outbox-retry", channel: "telegram", userId: "u-admin", type: "telegram_message", payload: { text: "retry" }, status: "pending", attemptCount: 0, availableAt: "2035-01-01T00:00:00.000Z", createdAt: "2035-01-01T00:00:00.000Z" });
assert.equal((await dispatchOutbox(async () => { throw new Error("transport down"); }, new Date("2035-01-01T00:00:00.000Z"))).failed, 1);
assert.equal(db.outbox.find((message) => message.id === "outbox-retry")?.attemptCount, 1);
assert.throws(() => verifyTelegramInitData("auth_date=1&user=%7B%7D&hash=bad", "dev-token"), /Некорректная подпись/);

const reportPdf = await renderReportPdf(admin, "all");
assert.ok(reportPdf.subarray(0, 4).equals(Buffer.from("%PDF")));
assert.ok(reportRows(admin, "discrepancies").every((row) => "expected" in row));
const reportOutbox = await queueReportTelegram(admin, "low");
assert.equal(reportOutbox.type, "report_pdf");
assert.match(String(reportOutbox.payload.documentBase64), /^[A-Za-z0-9+/]+=*$/);
let telegramDocumentUrl = "";
await dispatchTelegramOutbox(async (url) => {
  telegramDocumentUrl = String(url);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
});
assert.match(telegramDocumentUrl, /sendDocument$/);

const mixedUnitMerge = previewProductMerge(admin, "p-2", "p-1");
assert.throws(() => commitProductMerge(admin, mixedUnitMerge.id), (error) => error instanceof DomainError && error.code === "MERGE_UNIT_MISMATCH");
db.products.find((product) => product.id === "p-2")!.unit = "кг";
const sourceOperation = applyStockOperation({
  user: admin,
  type: "receipt",
  productId: "p-2",
  toLocationId: "loc-main",
  quantity: 1,
  reason: "merge source op",
  idempotencyKey: "test-merge-source-operation"
});
const mergePreview = previewProductMerge(admin, "p-2", "p-1", { localName: "source", category: "source" });
const committedMerge = commitProductMerge(admin, mergePreview.id);
assert.equal(committedMerge.status, "committed");
assert.equal(db.products.find((product) => product.id === "p-2")?.status, "deleted");
assert.equal(db.products.find((product) => product.id === "p-1")?.localName, "Пастила яблоко");
assert.equal(db.operations.find((operation) => operation.id === sourceOperation.id)?.productId, "p-1");
const revertedMerge = undoProductMerge(admin, mergePreview.id);
assert.equal(revertedMerge.status, "reverted");
assert.equal(db.products.find((product) => product.id === "p-2")?.status, "active");
assert.equal(db.operations.find((operation) => operation.id === sourceOperation.id)?.productId, "p-2");

const conflictMergePreview = previewProductMerge(admin, "p-3", "p-1");
db.products.find((product) => product.id === "p-3")!.unit = "кг";
commitProductMerge(admin, conflictMergePreview.id);
applyStockOperation({
  user: admin,
  type: "receipt",
  productId: "p-1",
  toLocationId: "loc-main",
  quantity: 1,
  reason: "merge dependent op",
  idempotencyKey: "test-merge-dependent-operation"
});
assert.throws(() => undoProductMerge(admin, conflictMergePreview.id), /После merge были движения/);

console.log("domain tests passed");

function minimalXlsxBase64() {
  const entries = [
    zipEntry(
      "xl/workbook.xml",
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
    ),
    zipEntry("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    zipEntry(
      "xl/sharedStrings.xml",
      "<sst><si><t>name</t></si><si><t>sku</t></si><si><t>quantity</t></si><si><t>unit</t></si><si><t>XLSX товар</t></si><si><t>XLS-1</t></si><si><t>3</t></si><si><t>шт</t></si></sst>"
    ),
    zipEntry(
      "xl/worksheets/sheet1.xml",
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row><row r="2"><c r="A2" t="s"><v>4</v></c><c r="B2" t="s"><v>5</v></c><c r="C2" t="s"><v>6</v></c><c r="D2" t="s"><v>7</v></c></row></sheetData></worksheet>'
    )
  ];
  return Buffer.concat(entries).toString("base64");
}

function zipEntry(name: string, text: string) {
  const source = Buffer.from(text);
  const compressed = zlib.deflateRawSync(source);
  const nameBuffer = Buffer.from(name);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(source.length, 22);
  header.writeUInt16LE(nameBuffer.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, nameBuffer, compressed]);
}

function minimalXlsBase64() {
  const strings = ["name", "sku", "quantity", "unit", "XLS product", "XLS-1", "4", "шт"];
  const sheet = Buffer.concat([
    biffRecord(0x0809, Buffer.from([0x00, 0x06, 0x10, 0x00, 0xdb, 0x07, 0xcc, 0x07])),
    ...strings.map((_, index) => biffLabelSst(index < 4 ? 0 : 1, index % 4, index)),
    biffRecord(0x000a, Buffer.alloc(0))
  ]);
  const workbookBof = biffRecord(0x0809, Buffer.from([0x00, 0x06, 0x05, 0x00, 0xdb, 0x07, 0xcc, 0x07]));
  const sst = biffRecord(0x00fc, Buffer.concat([uint32(strings.length), uint32(strings.length), ...strings.map(biffString)]));
  const placeholderGlobals = Buffer.concat([workbookBof, biffBoundSheet(0), sst, biffRecord(0x000a, Buffer.alloc(0))]);
  const workbook = Buffer.concat([workbookBof, biffBoundSheet(placeholderGlobals.length), sst, biffRecord(0x000a, Buffer.alloc(0)), sheet]);
  return oleWorkbook(workbook).toString("base64");
}

function biffRecord(type: number, data: Buffer) {
  const header = Buffer.alloc(4);
  header.writeUInt16LE(type, 0);
  header.writeUInt16LE(data.length, 2);
  return Buffer.concat([header, data]);
}

function biffString(value: string) {
  const utf16 = [...value].some((char) => char.charCodeAt(0) > 255);
  const text = Buffer.from(value, utf16 ? "utf16le" : "latin1");
  const header = Buffer.alloc(3);
  header.writeUInt16LE(value.length, 0);
  header[2] = utf16 ? 1 : 0;
  return Buffer.concat([header, text]);
}

function biffBoundSheet(sheetOffset: number) {
  const name = Buffer.from("Sheet1", "latin1");
  const data = Buffer.alloc(8 + name.length);
  data.writeUInt32LE(sheetOffset, 0);
  data[4] = 0;
  data[5] = 0;
  data[6] = name.length;
  data[7] = 0;
  name.copy(data, 8);
  return biffRecord(0x0085, data);
}

function biffLabelSst(row: number, column: number, sstIndex: number) {
  const data = Buffer.alloc(10);
  data.writeUInt16LE(row, 0);
  data.writeUInt16LE(column, 2);
  data.writeUInt16LE(0, 4);
  data.writeUInt32LE(sstIndex, 6);
  return biffRecord(0x00fd, data);
}

function uint32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
}

function oleWorkbook(workbook: Buffer) {
  const sectorSize = 512;
  const workbookSize = 4096;
  const paddedWorkbook = Buffer.concat([workbook, Buffer.alloc(workbookSize - workbook.length)]);
  const fat = Buffer.alloc(sectorSize, 0xff);
  const fatEntries = [-3, -2, 3, 4, 5, 6, 7, 8, 9, -2];
  fatEntries.forEach((entry, index) => fat.writeInt32LE(entry, index * 4));
  const directory = Buffer.alloc(sectorSize);
  writeDirectoryEntry(directory, 0, "Root Entry", 5, -2, 0);
  writeDirectoryEntry(directory, 128, "Workbook", 2, 2, workbookSize);
  const header = Buffer.alloc(sectorSize, 0xff);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(header, 0);
  header.writeUInt16LE(0x003e, 24);
  header.writeUInt16LE(0x0003, 26);
  header.writeUInt16LE(0xfffe, 28);
  header.writeUInt16LE(9, 30);
  header.writeUInt16LE(6, 32);
  header.writeUInt32LE(1, 44);
  header.writeInt32LE(1, 48);
  header.writeUInt32LE(4096, 56);
  header.writeInt32LE(-2, 60);
  header.writeUInt32LE(0, 64);
  header.writeInt32LE(-2, 68);
  header.writeUInt32LE(0, 72);
  header.writeInt32LE(0, 76);
  return Buffer.concat([header, fat, directory, paddedWorkbook]);
}

function writeDirectoryEntry(directory: Buffer, offset: number, name: string, type: number, startSector: number, size: number) {
  const nameBuffer = Buffer.from(`${name}\0`, "utf16le");
  nameBuffer.copy(directory, offset);
  directory.writeUInt16LE(nameBuffer.length, offset + 64);
  directory[offset + 66] = type;
  directory[offset + 67] = 1;
  directory.writeInt32LE(-1, offset + 68);
  directory.writeInt32LE(-1, offset + 72);
  directory.writeInt32LE(-1, offset + 76);
  directory.writeInt32LE(startSector, offset + 116);
  directory.writeUInt32LE(size, offset + 120);
}

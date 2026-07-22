import PDFDocument from "pdfkit";
import type { MovementReportRow } from "../shared/types";

export const reportTypes = ["low", "zero", "all", "archive", "movements", "discrepancies"] as const;
export type ReportType = (typeof reportTypes)[number];
export type ReportQuery = Readonly<{ from?: string; to?: string; productId?: string; locationId?: string }>;
export type ReportRow = Record<string, string | number | null | undefined>;
export const movementReportColumns: Array<keyof MovementReportRow> = [
  "id", "occurredAt", "type", "productId", "productName", "fromLocationId", "fromLocationName",
  "toLocationId", "toLocationName", "quantity", "actorId", "actorName", "reason", "reversedOperationId",
  "inventoryExpected", "inventoryActual", "inventoryDelta"
];

const titles: Record<ReportType, string> = {
  low: "Низкий остаток", zero: "Нулевой остаток", all: "Все товары", archive: "Архив",
  movements: "Движения склада", discrepancies: "Расхождения инвентаризации"
};
const fontPath = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf";

export function isReportType(value: string): value is ReportType {
  return (reportTypes as readonly string[]).includes(value);
}

export function reportTitle(type: ReportType) {
  return titles[type];
}

function displayCell(value: unknown) {
  if (value === null || value === undefined) return "-";
  return String(value).replace(/[\r\n]+/g, " ");
}

export async function renderReportPdfRows(type: ReportType, rows: readonly ReportRow[], query: ReportQuery = {}) {
  const document = new PDFDocument({ size: "A4", margin: 36 });
  const chunks: Buffer[] = [];
  document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  const pdf = new Promise<Buffer>((resolve, reject) => {
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
  });
  document.font(fontPath).fontSize(16).fillColor("#111111").text(`Отчёт: ${reportTitle(type)}`);
  const period = [query.from, query.to].filter(Boolean).join(" - ");
  if (period) document.moveDown(0.25).fontSize(9).text(`Период: ${period}`);
  document.moveDown(0.7);
  if (!rows.length) document.fontSize(10).text("Нет данных за выбранный период.");
  else {
    document.fontSize(8);
    rows.forEach((row, index) => {
      const line = Object.entries(row).map(([key, value]) => `${key}: ${displayCell(value)}`).join(" | ");
      const needed = document.heightOfString(`${index + 1}. ${line}`, { width: 523 });
      if (document.y + needed > document.page.height - 36) document.addPage();
      document.text(`${index + 1}. ${line}`, { width: 523 });
    });
  }
  document.end();
  return pdf;
}

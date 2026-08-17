import { readSheet } from "read-excel-file/node";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export type SupplyFileRow = Readonly<{
  sourceName: string;
  sourceArticle?: string;
  packageCount?: number;
  packageMassGrams?: number;
  purchaseCostKopecks?: number;
}>;

export type SupplyColumnMapping = Readonly<Partial<Record<"name" | "article" | "count" | "mass" | "total" | "unitPrice", number>>>;
export type SupplyFilePreview = Readonly<{
  headerRow: number;
  headers: string[];
  rows: string[][];
  suggestedMapping: SupplyColumnMapping;
  needsMapping: boolean;
}>;

const aliases = {
  name: ["наименование", "наименование товара", "название", "товар", "name", "product", "product name"],
  article: ["артикул", "код", "код товара", "sku", "article", "product code"],
  count: ["упаковок", "количество упаковок", "кол во упаковок", "количество", "кол во", "qty", "quantity", "count"],
  mass: ["масса упаковки", "вес упаковки", "масса пачки", "вес пачки", "масса г", "вес г", "package mass", "weight grams"],
  total: ["стоимость", "сумма", "стоимость строки", "итого", "total", "line total", "amount"],
  unitPrice: ["цена", "цена за упаковку", "purchase price", "unit price", "price"]
} as const;

export async function inspectSupplyFile(fileName: string, content: string): Promise<SupplyFilePreview> {
  const rows = await readRows(fileName, content);
  return previewFromRows(rows);
}

function previewFromRows(rows: unknown[][]): SupplyFilePreview {
  const detectedHeader = findBestHeaderRow(rows);
  const headerRow = detectedHeader.index >= 0 ? detectedHeader.index : rows.findIndex((row) => row.some((value) => String(value ?? "").trim()));
  if (headerRow < 0) throw new Error("SUPPLY_FILE_EMPTY");
  const headers = rows[headerRow].map((value, index) => String(value ?? "").trim() || `Колонка ${index + 1}`);
  const normalizedHeaders = headers.map(normalize);
  const suggestedMapping = mappingFromHeaders(normalizedHeaders);
  return {
    headerRow,
    headers,
    rows: rows.slice(headerRow + 1, headerRow + 11).map((row) => headers.map((_header, index) => String(row[index] ?? "").trim())),
    suggestedMapping,
    needsMapping: suggestedMapping.name === undefined && suggestedMapping.article === undefined
  };
}

export async function parseSupplyFile(fileName: string, content: string, mapping?: SupplyColumnMapping): Promise<SupplyFileRow[]> {
  const rows = await readRows(fileName, content);
  const preview = previewFromRows(rows);
  const indexes = { ...preview.suggestedMapping, ...(mapping ?? {}) };
  if (indexes.name === undefined && indexes.article === undefined) throw new Error("SUPPLY_FILE_PRODUCT_COLUMN_REQUIRED");
  const result = rows.slice(preview.headerRow + 1).flatMap((row) => {
    const sourceName = cell(row, indexes.name);
    const sourceArticle = cell(row, indexes.article);
    if (!sourceName && !sourceArticle) return [];
    const packageCount = positiveInteger(cell(row, indexes.count));
    const packageMassGrams = positiveInteger(cell(row, indexes.mass));
    const total = moneyKopecks(cell(row, indexes.total));
    const unitPrice = moneyKopecks(cell(row, indexes.unitPrice));
    const purchaseCostKopecks = total ?? (unitPrice !== undefined && packageCount !== undefined ? unitPrice * packageCount : undefined);
    return [{ sourceName: sourceName || sourceArticle, ...(sourceArticle ? { sourceArticle } : {}), ...(packageCount ? { packageCount } : {}), ...(packageMassGrams ? { packageMassGrams } : {}), ...(purchaseCostKopecks !== undefined ? { purchaseCostKopecks } : {}) }];
  });
  if (!result.length) throw new Error("SUPPLY_FILE_EMPTY");
  return result;
}

async function readRows(fileName: string, content: string) {
  const lower = fileName.toLocaleLowerCase("ru-RU");
  let rows: unknown[][];
  if (lower.endsWith(".xlsx")) {
    const buffer = Buffer.from(content.trim(), "base64");
    if (!buffer.length || buffer.length > MAX_FILE_BYTES) throw new Error("SUPPLY_FILE_SIZE_INVALID");
    rows = await readSheet(buffer) as unknown[][];
  } else if (lower.endsWith(".csv")) {
    if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) throw new Error("SUPPLY_FILE_SIZE_INVALID");
    rows = parseCsv(content);
  } else {
    throw new Error("SUPPLY_FILE_TYPE_INVALID");
  }
  return rows;
}

function mappingFromHeaders(headers: string[]): SupplyColumnMapping {
  const indexes = {
    name: columnIndex(headers, aliases.name),
    article: columnIndex(headers, aliases.article),
    count: columnIndex(headers, aliases.count),
    mass: columnIndex(headers, aliases.mass),
    total: columnIndex(headers, aliases.total),
    unitPrice: columnIndex(headers, aliases.unitPrice)
  };
  return Object.fromEntries(Object.entries(indexes).filter(([, index]) => index >= 0)) as SupplyColumnMapping;
}

function parseCsv(content: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  const separator = detectSeparator(lines[0] || "");
  return lines.map((line) => splitCsvLine(line, separator));
}

function detectSeparator(line: string): "," | ";" | "\t" {
  const counts = ([",", ";", "\t"] as const).map((separator) => ({ separator, count: line.split(separator).length }));
  return counts.sort((a, b) => b.count - a.count)[0]?.separator || ",";
}

function splitCsvLine(line: string, separator: "," | ";" | "\t") {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "\"") {
      if (quoted && line[index + 1] === "\"") { current += "\""; index += 1; }
      else quoted = !quoted;
    } else if (character === separator && !quoted) {
      values.push(current.trim());
      current = "";
    } else current += character;
  }
  values.push(current.trim());
  return values;
}

function findBestHeaderRow(rows: Array<Array<unknown>>) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 20).forEach((row, index) => {
    const normalized = row.map((value) => normalize(String(value ?? "")));
    const score = Object.values(aliases).filter((candidates) => columnIndex(normalized, candidates) >= 0).length;
    if (score > best.score) best = { index, score };
  });
  return best;
}

function columnIndex(headers: string[], candidates: readonly string[]) {
  const normalizedCandidates = new Set(candidates.map(normalize));
  return headers.findIndex((header) => normalizedCandidates.has(header));
}

function normalize(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

function cell(row: Array<unknown>, index?: number) {
  return index === undefined || index < 0 ? "" : String(row[index] ?? "").trim();
}

function positiveInteger(value: string) {
  const parsed = Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function moneyKopecks(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : undefined;
}

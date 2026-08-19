import { useEffect, useMemo, useState } from "react";
import type { Location, MovementReportRow, Product } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { operationLabels, operationTone } from "../constants";
import { formatProductQuantity, safeLabel } from "../presentation";
import { ActionMenu, DataTable, Field, Notice, PageHeader, Panel, Skeleton, StatusBadge } from "../ui";

type BalanceRow = { productId?: string; locationId?: string; quantity: number; productName: string; productStatus: string; threshold: number; locationName: string };
type DiscrepancyRow = { createdAt: string; productName: string; locationName: string; expected: number | null; actual: number | null; delta: number | null };
type BalanceFilter = "all" | "low" | "zero" | "archive";
type ReportSection = "balances" | "movements" | "discrepancies";
type DiscrepancyResult = "all" | "shortage" | "surplus" | "match" | "incomplete";
type RuntimeCapabilities = { warehouseWriteMode: "legacy" | "fifo" };
type WarehouseCatalogProduct = { id: string; officialName: string; localName: string; article: string; inventoryKind: "piece" | "weight"; packageMassGrams?: number; status: Product["status"] };
type WarehouseBalance = { productId: string; accountingQuantityMinor: number; remainingPackageMilli: number; inventoryKind: "piece" | "weight" };
type WarehouseJournalRow = { occurredAt: string; type: string; productId: string; productName: string; quantityPackageMilli: number; reason: string };

export function MovementReportTable({ rows, products }: { rows: MovementReportRow[]; products?: Product[] }) {
  return <DataTable rows={rows} empty="Движений нет" columns={[
    { key: "date", header: "Дата", render: (row) => row.occurredAt ? row.occurredAt.slice(0, 16).replace("T", " ") : "Дата неизвестна" },
    { key: "type", header: "Тип", render: (row) => <StatusBadge tone={operationTone[row.type] || "neutral"}>{safeLabel(operationLabels, row.type, "Другая операция")}</StatusBadge> },
    { key: "product", header: "Товар", render: (row) => row.productName },
    { key: "location", header: "Точка", render: (row) => [row.fromLocationName, row.toLocationName].filter(Boolean).join(" → ") || "Точка неизвестна" },
    { key: "qty", header: "Количество", render: (row) => row.quantity === null || row.quantity === undefined ? "Неизвестно" : formatProductQuantity(products?.find((product) => product.id === row.productId), row.quantity) },
    { key: "reason", header: "Основание", render: (row) => row.reason || "—" }
  ]} />;
}

export function ReportsPage({ client }: PageProps) {
  const [section, setSection] = useState<ReportSection>("balances");
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>("low");
  const [balanceRows, setBalanceRows] = useState<BalanceRow[]>([]);
  const [movementRows, setMovementRows] = useState<MovementReportRow[]>([]);
  const [discrepancyRows, setDiscrepancyRows] = useState<DiscrepancyRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [discrepancyResult, setDiscrepancyResult] = useState<DiscrepancyResult>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reportType = section === "balances" ? balanceFilter : section;
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const capabilities = await client.request<RuntimeCapabilities>("/api/runtime/capabilities");
      const fifo = capabilities.warehouseWriteMode === "fifo";
      const [nextProducts, nextLocations, rows] = fifo
        ? await Promise.all([
          client.request<WarehouseCatalogProduct[]>("/api/warehouse/catalog").then((items) => ({ items: items.map(warehouseProduct) })),
          Promise.resolve<Location[]>([{ id: "warehouse-fifo", code: "FIFO", name: "FIFO-склад", type: "warehouse", status: "active" }]),
          section === "movements"
            ? client.request<WarehouseJournalRow[]>(`/api/warehouse/journal${warehouseDateQuery(from, to)}`).then((items) => items.map((item) => ({ id: `${item.occurredAt}:${item.productId}:${item.reason}`, occurredAt: item.occurredAt, type: item.type, productId: item.productId, productName: item.productName, quantity: item.quantityPackageMilli / 1000, reason: item.reason } as MovementReportRow)))
            : section === "discrepancies"
              ? Promise.resolve<DiscrepancyRow[]>([])
              : client.request<WarehouseBalance[]>("/api/warehouse/balances").then((items) => items.map((item) => ({ productId: item.productId, locationId: "warehouse-fifo", quantity: item.inventoryKind === "weight" ? item.accountingQuantityMinor / 1000 : item.remainingPackageMilli / 1000, productName: "", productStatus: "active", threshold: item.inventoryKind === "weight" ? 1 : 3, locationName: "FIFO-склад" })))
        ])
        : await Promise.all([
          products.length ? Promise.resolve({ items: products }) : client.request<{ items: Product[] }>("/api/products?status=all&limit=100"),
          locations.length ? Promise.resolve(locations) : client.request<Location[]>("/api/locations"),
          client.request<BalanceRow[] | MovementReportRow[] | DiscrepancyRow[]>(`/api/reports/${reportType}${reportQuery(from, to, locationId, section)}`)
        ]);
      if (fifo && section === "balances") {
        const names = new Map(nextProducts.items.map((product) => [product.id, product.localName || product.officialName]));
        for (const row of rows as BalanceRow[]) row.productName = names.get(row.productId || "") || row.productId || "—";
      }
      setProducts(nextProducts.items);
      setLocations(nextLocations);
      if (section === "movements") setMovementRows(rows as MovementReportRow[]);
      else if (section === "discrepancies") setDiscrepancyRows(rows as DiscrepancyRow[]);
      else setBalanceRows(rows as BalanceRow[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [section, balanceFilter, from, to, locationId]);

  const selectedLocation = locations.find((location) => location.id === locationId);
  const filteredBalances = useMemo(() => balanceRows.filter((row) => locationId === "all" || row.locationId === locationId || row.locationName === selectedLocation?.name), [balanceRows, locationId, selectedLocation?.name]);
  const filteredMovements = useMemo(() => movementRows.filter((row) => Boolean(row.occurredAt) && (!from || String(row.occurredAt) >= from) && (!to || String(row.occurredAt).slice(0, 10) <= to) && (locationId === "all" || row.fromLocationId === locationId || row.toLocationId === locationId)), [from, locationId, movementRows, to]);
  const filteredDiscrepancies = useMemo(() => discrepancyRows.filter((row) => (!from || row.createdAt >= from) && (!to || row.createdAt.slice(0, 10) <= to) && (locationId === "all" || row.locationName === selectedLocation?.name) && discrepancyMatches(row.delta, discrepancyResult)), [discrepancyRows, discrepancyResult, from, locationId, selectedLocation?.name, to]);

  if (loading && !balanceRows.length && !movementRows.length && !discrepancyRows.length) return <Skeleton />;
  const exportSuffix = reportQuery(from, to, locationId, section);
  const exportCsv = () => window.open(`/api/reports/${reportType}/export${exportSuffix}`, "_blank", "noopener,noreferrer");
  const exportPdf = () => window.open(`/api/reports/${reportType}/pdf${exportSuffix}`, "_blank", "noopener,noreferrer");

  return <section className="stack admin-page reports-page">
    <PageHeader title="Отчёты" description="Остатки, движения и результаты проверок." actions={<ActionMenu className="export-menu" label="Экспорт"><button className="secondary" onClick={exportCsv}>CSV</button><button className="secondary" onClick={exportPdf}>PDF</button></ActionMenu>} />
    <div className="section-tabs" role="tablist" aria-label="Тип отчёта">
      <button className={section === "balances" ? "active" : "secondary"} onClick={() => setSection("balances")}>Остатки</button>
      <button className={section === "movements" ? "active" : "secondary"} onClick={() => setSection("movements")}>Движения</button>
      <button className={section === "discrepancies" ? "active" : "secondary"} onClick={() => setSection("discrepancies")}>Расхождения</button>
    </div>
    <Panel className="report-filters">
      <div className="toolbar">
        {section === "balances" && <Field label="Состояние"><select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value as BalanceFilter)}><option value="all">Все товары</option><option value="low">Заканчиваются</option><option value="zero">Нет в наличии</option><option value="archive">Архив</option></select></Field>}
        {section !== "balances" && <><Field label="С"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="По"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field></>}
        <Field label="Точка"><select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="all">Все точки</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></Field>
        {section === "discrepancies" && <Field label="Результат"><select value={discrepancyResult} onChange={(event) => setDiscrepancyResult(event.target.value as DiscrepancyResult)}><option value="all">Все результаты</option><option value="shortage">Недостача</option><option value="surplus">Излишек</option><option value="match">Совпадение</option><option value="incomplete">Не заполнено</option></select></Field>}
      </div>
    </Panel>
    {error && <Notice tone="danger">Не удалось загрузить отчёт: {error}</Notice>}
    {!error && <Panel className="primary-panel" title={section === "balances" ? "Остатки" : section === "movements" ? "Движения" : "Расхождения"}>
      {section === "movements" ? <MovementReportTable rows={filteredMovements} products={products} /> : section === "discrepancies" ? <DataTable rows={filteredDiscrepancies} empty="Расхождений нет" columns={[
        { key: "date", header: "Дата", render: (row) => new Date(row.createdAt).toLocaleString("ru-RU") },
        { key: "product", header: "Товар", render: (row) => row.productName },
        { key: "location", header: "Точка", render: (row) => row.locationName },
        { key: "expected", header: "Учёт", render: (row) => row.expected === null ? "—" : formatProductQuantity(products.find((product) => product.localName === row.productName || product.officialName === row.productName), row.expected) },
        { key: "actual", header: "Факт", render: (row) => row.actual === null ? "—" : formatProductQuantity(products.find((product) => product.localName === row.productName || product.officialName === row.productName), row.actual) },
        { key: "delta", header: "Разница", render: (row) => row.delta === null ? "—" : formatProductQuantity(products.find((product) => product.localName === row.productName || product.officialName === row.productName), row.delta) }
      ]} /> : <DataTable rows={filteredBalances} empty="Нет строк" columns={[
        { key: "product", header: "Товар", render: (row) => row.productName },
        { key: "location", header: "Точка", render: (row) => row.locationName },
        { key: "quantity", header: "Остаток", render: (row) => formatProductQuantity(productForReport(products, row), row.quantity) },
        { key: "threshold", header: "Порог", render: (row) => formatProductQuantity(productForReport(products, row), row.threshold) },
        { key: "status", header: "Статус", render: (row) => <StatusBadge tone={row.productStatus === "archived" ? "neutral" : row.quantity === 0 ? "danger" : row.quantity <= row.threshold ? "warn" : "good"}>{balanceStatus(row)}</StatusBadge> }
      ]} />}
    </Panel>}
  </section>;
}

function warehouseDateQuery(from: string, to: string) {
  const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); return params.size ? `?${params}` : "";
}

function warehouseProduct(product: WarehouseCatalogProduct): Product {
  return { id: product.id, officialName: product.officialName, localName: product.localName, unit: product.inventoryKind === "weight" ? "кг" : "шт", photoUrl: "", category: "Складская номенклатура", tags: [], status: product.status, identifiers: product.article ? [{ id: `article-${product.id}`, productId: product.id, type: "supplier_article", value: product.article }] : [], lowStockThreshold: product.inventoryKind === "weight" ? 1 : 3, inventoryKind: product.inventoryKind, packageMassGrams: product.packageMassGrams, article: product.article };
}

function productForReport(products: Product[], row: { productId?: string; productName: string }) {
  return products.find((product) => product.id === row.productId || product.localName === row.productName || product.officialName === row.productName);
}

function reportQuery(from: string, to: string, locationId: string, section: ReportSection) {
  if (section === "balances") return "";
  const params = new URLSearchParams(); if (from) params.set("from", from); if (to) params.set("to", to); if (locationId !== "all") params.set("locationId", locationId);
  return params.size ? `?${params}` : "";
}

function balanceStatus(row: BalanceRow) {
  if (row.productStatus === "archived") return "Архив";
  if (row.quantity === 0) return "Нет в наличии";
  return row.quantity <= row.threshold ? "Заканчивается" : "В норме";
}

function discrepancyMatches(delta: number | null, result: DiscrepancyResult) {
  if (result === "all") return true; if (result === "incomplete") return delta === null; if (delta === null) return false;
  if (result === "shortage") return delta < 0; if (result === "surplus") return delta > 0; return delta === 0;
}

import { useEffect, useMemo, useState } from "react";
import type { Location, MovementReportRow, Product } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { operationLabels, operationTone, reportProductStatusLabels } from "../constants";
import { formatProductQuantity, safeLabel } from "../presentation";
import { DataTable, Field, Notice, PageHeader, Panel, Skeleton, StatusBadge } from "../ui";

type BalanceRow = { productId: string; locationId: string; quantity: number; productName: string; productStatus: string; threshold: number; locationName: string };
type DiscrepancyRow = { createdAt: string; productName: string; locationName: string; expected: number | null; actual: number | null; delta: number | null };
type BalanceFilter = "all" | "low" | "zero" | "archive";
type ReportSection = "balances" | "movements" | "discrepancies";

export function MovementReportTable({ rows, products }: { rows: MovementReportRow[]; products?: Product[] }) {
  return <DataTable rows={rows} empty="Движений нет" columns={[
    { key: "date", header: "Дата", render: (row) => row.occurredAt ? row.occurredAt.slice(0, 16).replace("T", " ") : "Дата неизвестна" },
    { key: "type", header: "Тип", render: (row) => <StatusBadge tone={operationTone[row.type] || "neutral"}>{safeLabel(operationLabels, row.type, "Другая операция")}</StatusBadge> },
    { key: "product", header: "Товар", render: (row) => row.productName },
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reportType = section === "balances" ? balanceFilter : section;
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextProducts, nextLocations, rows] = await Promise.all([
        products.length ? Promise.resolve({ items: products }) : client.request<{ items: Product[] }>("/api/products?status=all&limit=100"),
        locations.length ? Promise.resolve(locations) : client.request<Location[]>("/api/locations"),
        client.request<BalanceRow[] | MovementReportRow[] | DiscrepancyRow[]>(`/api/reports/${reportType}`)
      ]);
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

  useEffect(() => { void load(); }, [section, balanceFilter]);

  const filteredBalances = useMemo(() => balanceRows.filter((row) => locationId === "all" || row.locationId === locationId), [balanceRows, locationId]);
  const filteredMovements = useMemo(() => movementRows.filter((row) => Boolean(row.occurredAt) && (!from || String(row.occurredAt) >= from) && (!to || String(row.occurredAt).slice(0, 10) <= to)), [from, movementRows, to]);
  const filteredDiscrepancies = useMemo(() => discrepancyRows.filter((row) => (!from || row.createdAt >= from) && (!to || row.createdAt.slice(0, 10) <= to) && (locationId === "all" || row.locationName === locations.find((location) => location.id === locationId)?.name)), [discrepancyRows, from, locationId, locations, to]);

  if (loading && !balanceRows.length && !movementRows.length && !discrepancyRows.length) return <Skeleton />;
  const exportCsv = () => window.open(`/api/reports/${reportType}/export`, "_blank", "noopener,noreferrer");
  const exportPdf = () => window.open(`/api/reports/${reportType}/pdf`, "_blank", "noopener,noreferrer");

  return <section className="stack admin-page reports-page">
    <PageHeader title="Отчёты" description="Остатки, движения и результаты проверок." actions={<details className="action-menu export-menu"><summary>Экспорт</summary><div className="action-menu-popover"><button className="secondary" onClick={exportCsv}>CSV</button><button className="secondary" onClick={exportPdf}>PDF</button></div></details>} />
    <div className="section-tabs" role="tablist" aria-label="Тип отчёта">
      <button className={section === "balances" ? "active" : "secondary"} onClick={() => setSection("balances")}>Остатки</button>
      <button className={section === "movements" ? "active" : "secondary"} onClick={() => setSection("movements")}>Движения</button>
      <button className={section === "discrepancies" ? "active" : "secondary"} onClick={() => setSection("discrepancies")}>Расхождения</button>
    </div>
    <Panel className="report-filters">
      <div className="toolbar">
        {section === "balances" && <Field label="Состояние"><select value={balanceFilter} onChange={(event) => setBalanceFilter(event.target.value as BalanceFilter)}><option value="all">Все товары</option><option value="low">Заканчиваются</option><option value="zero">Нет в наличии</option><option value="archive">Архив</option></select></Field>}
        {section !== "balances" && <><Field label="С"><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="По"><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field></>}
        {section !== "movements" && <Field label="Точка"><select value={locationId} onChange={(event) => setLocationId(event.target.value)}><option value="all">Все точки</option>{locations.map((location) => <option value={location.id} key={location.id}>{location.name}</option>)}</select></Field>}
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
        { key: "quantity", header: "Остаток", render: (row) => formatProductQuantity(products.find((product) => product.id === row.productId), row.quantity) },
        { key: "threshold", header: "Порог", render: (row) => formatProductQuantity(products.find((product) => product.id === row.productId), row.threshold) },
        { key: "status", header: "Статус", render: (row) => <StatusBadge tone={row.quantity === 0 ? "danger" : row.quantity <= row.threshold ? "warn" : "good"}>{safeLabel(reportProductStatusLabels, row.productStatus)}</StatusBadge> }
      ]} />}
    </Panel>}
  </section>;
}

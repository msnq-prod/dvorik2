import { useEffect, useMemo, useState } from "react";
import type { Product, StockBalance } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { ApiError } from "../api";
import { ProductPicker } from "../components/ProductPicker";
import { DataTable, Field, Notice, Panel, Skeleton, StatusBadge, Toolbar, useConfirm } from "../ui";
import { formatProductQuantity } from "../presentation";

type Session = { id: string; status: string; actorId: string; startedAt: string; version: number };
type SessionRow = { sessionId: string; productId: string; expected: number; actual?: number; version: number };
type ActiveInventory = { session: Session; rows: SessionRow[] } | null;
type Consumption = { id: string; productId: string; quantity: number; source: string; comment: string; createdAt: string };
type RuntimeCapabilities = { warehouseWriteMode: "legacy" | "fifo" };
type WarehouseLot = { productId: string; remainingPackageMilli: number };
type WarehouseCatalogProduct = { id: string; officialName: string; localName: string; article: string; inventoryKind: "piece" | "weight"; packageMassGrams?: number; status: Product["status"] };
type WarehouseBalance = { productId: string; accountingQuantityMinor: number; remainingPackageMilli: number; inventoryKind: "piece" | "weight" };
type InventoryOperation = "inventory" | "consumption" | "adjustment";
type CountFilter = "all" | "pending" | "difference";
type ProductPage = { items: Product[]; total: number; page: number; limit: number };

export async function loadAllActiveProducts(client: PageProps["client"]) {
  const first = await client.request<ProductPage>("/api/products?status=active&page=1&limit=100");
  const pageCount = Math.ceil(first.total / first.limit);
  if (pageCount <= 1) return first.items;
  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      client.request<ProductPage>(`/api/products?status=active&page=${index + 2}&limit=100`)
    )
  );
  return [first, ...remaining].flatMap((page) => page.items);
}

export function isMissingActiveInventory(error: unknown) {
  return error instanceof ApiError && (error.status === 404 || error.code === "NOT_FOUND");
}

export function InventoryPage({ client, session, intent, onIntentHandled }: PageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [active, setActive] = useState<ActiveInventory>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [inventoryComment, setInventoryComment] = useState("");
  const [consumptionReason, setConsumptionReason] = useState("");
  const [q, setQ] = useState("");
  const [countFilter, setCountFilter] = useState<CountFilter>("all");
  const [manualProductId, setManualProductId] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [adjustmentDelta, setAdjustmentDelta] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [warehouseMode, setWarehouseMode] = useState(false);
  const [warehouseLots, setWarehouseLots] = useState<WarehouseLot[]>([]);
  const [adjustmentCostRubles, setAdjustmentCostRubles] = useState(0);
  const [operation, setOperation] = useState<InventoryOperation>("inventory");
  const canApply = session.permissions.includes("inventory:write");
  const canAdjust = session.user.role !== "seller";
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const capabilities = await client.request<RuntimeCapabilities>("/api/runtime/capabilities");
      const fifo = capabilities.warehouseWriteMode === "fifo";
      const [nextProducts, nextActive, nextConsumptions, nextBalances, nextLots] = fifo
        ? await Promise.all([
          client.request<WarehouseCatalogProduct[]>("/api/warehouse/catalog").then((items) => items.filter((item) => item.status === "active").map(warehouseProduct)),
          Promise.resolve<ActiveInventory>(null), Promise.resolve<Consumption[]>([]),
          client.request<WarehouseBalance[]>("/api/warehouse/balances").then((items) => items.map((item) => ({ productId: item.productId, locationId: "warehouse-fifo", quantity: item.inventoryKind === "weight" ? item.accountingQuantityMinor / 1000 : item.remainingPackageMilli / 1000, version: 0 }))),
          client.request<WarehouseLot[]>("/api/warehouse/lots")
        ])
        : await Promise.all([
          loadAllActiveProducts(client),
          client.request<ActiveInventory>("/api/inventory/session/active").catch((error) => { if (isMissingActiveInventory(error)) return null; throw error; }),
          client.request<Consumption[]>("/api/consumption"), client.request<StockBalance[]>("/api/balances"), client.request<WarehouseLot[]>("/api/warehouse/lots").catch(() => [])
        ]);
      setProducts(nextProducts);
      setActive(nextActive);
      setRows(nextActive?.rows.map((row) => ({ ...row })) ?? []);
      setConsumptions(nextConsumptions);
      setBalances(nextBalances);
      setWarehouseMode(fifo);
      setWarehouseLots(nextLots);
      setManualProductId((current) => current || nextProducts[0]?.id || "");
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [client]);
  useEffect(() => {
    if (intent === "inventory-start") { void start(); onIntentHandled?.(); }
  }, [intent, onIntentHandled]);
  useEffect(() => {
    if (warehouseMode && operation === "inventory") setOperation("consumption");
  }, [warehouseMode, operation]);

  const start = async () => {
    if (warehouseMode) { setMessage("Legacy-инвентаризация отключена: остаток ведётся по FIFO-партиям"); return; }
    if (!canApply || saving) return;
    const approved = await confirm({ title: "Начать общий пересчёт?", description: "До завершения пересчёта перемещения, расход и корректировки будут временно заблокированы.", confirmLabel: "Начать пересчёт", tone: "warn" });
    if (!approved) return;
    setSaving(true); setMessage("");
    try {
      await client.request("/api/inventory/sessions", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: "{}" });
      setMessage("Инвентаризация запущена");
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };

  const close = async () => {
    if (warehouseMode) { setMessage("Legacy-инвентаризация отключена: остаток ведётся по FIFO-партиям"); return; }
    if (!active || active.session.actorId !== session.user.id) return;
    const approved = await confirm({ title: "Завершить инвентаризацию?", description: "Общий остаток будет заменён физическим фактом. Размещение по полкам не изменится.", confirmLabel: "Завершить", tone: "warn" });
    if (!approved) return;
    setSaving(true); setMessage("");
    try {
      await client.request(`/api/inventory/sessions/${active.session.id}/close`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ rows: rows.map((row) => ({ productId: row.productId, actual: row.actual })), comment: inventoryComment }) });
      setMessage("Инвентаризация завершена");
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };

  const submitManual = async (kind: "consumption" | "adjustment") => {
    if (!manualProductId || active) return;
    const selectedProduct = products.find((product) => product.id === manualProductId);
    const available = warehouseMode
      ? warehouseLots.filter((item) => item.productId === manualProductId).reduce((sum, item) => sum + item.remainingPackageMilli / 1000, 0)
      : balances.filter((item) => item.productId === manualProductId).reduce((sum, item) => sum + item.quantity, 0);
    const reason = kind === "consumption" ? consumptionReason.trim() : adjustmentReason.trim() || "Инвентаризационная корректировка";
    if (kind === "consumption") {
      if (!consumptionReason.trim()) { setMessage("Укажите причину расхода"); return; }
      if (manualQuantity > available) { setMessage("Расход превышает доступный остаток"); return; }
      const approved = await confirm({ title: "Списать расход?", description: `${selectedProduct?.localName || "Товар"}: доступно ${formatProductQuantity(selectedProduct, available)} → списывается ${formatProductQuantity(selectedProduct, manualQuantity)} → останется ${formatProductQuantity(selectedProduct, available - manualQuantity)}. Причина: ${consumptionReason.trim()}.`, confirmLabel: "Списать расход", tone: "danger" });
      if (!approved) return;
    } else {
      const approved = await confirm({ title: "Применить корректировку?", description: `${selectedProduct?.localName || "Товар"}: изменить остаток на ${formatProductQuantity(selectedProduct, adjustmentDelta)}. Основание: ${reason}.`, confirmLabel: "Применить корректировку", tone: "warn" });
      if (!approved) return;
    }
    setSaving(true); setMessage("");
    try {
      if (warehouseMode) {
        if (kind === "consumption") {
          await client.request("/api/warehouse/write-offs", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ productId: manualProductId, quantityPackageMilli: Math.round(manualQuantity * 1000), reason: consumptionReason }) });
        } else {
          if (adjustmentDelta > 0 && adjustmentCostRubles < 0) { setMessage("Укажите себестоимость корректировки"); return; }
          await client.request("/api/warehouse/adjustments", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ productId: manualProductId, deltaPackageMilli: Math.round(adjustmentDelta * 1000), ...(adjustmentDelta > 0 ? { totalCostKopecks: Math.round(adjustmentCostRubles * 100) } : {}), reason }) });
        }
      } else await client.request(kind === "consumption" ? "/api/consumption" : "/api/stock/adjustments", {
        method: "POST", headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(kind === "consumption" ? { productId: manualProductId, quantity: manualQuantity, comment: reason } : { productId: manualProductId, delta: adjustmentDelta, comment: reason })
      });
      setMessage(kind === "consumption" ? "Расход зарегистрирован" : "Корректировка применена");
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const availableByProduct = useMemo(() => {
    const next = new Map<string, number>();
    if (warehouseMode) {
      for (const lot of warehouseLots) next.set(lot.productId, (next.get(lot.productId) || 0) + lot.remainingPackageMilli / 1000);
    } else {
      for (const balance of balances) next.set(balance.productId, (next.get(balance.productId) || 0) + balance.quantity);
    }
    return next;
  }, [balances, warehouseLots, warehouseMode]);
  const visibleRows = useMemo(() => {
    const search = q.trim().toLocaleLowerCase("ru-RU");
    return rows
      .map((row, index) => ({ row, index, product: productById.get(row.productId) }))
      .filter((item) => {
        if (countFilter === "pending" && item.row.actual !== undefined) return false;
        if (countFilter === "difference" && (item.row.actual === undefined || item.row.actual === item.row.expected)) return false;
        if (!search) return true;
        const product = item.product;
        return [
          product?.localName,
          product?.officialName,
          product?.article,
          ...(product?.identifiers.map((identifier) => identifier.value) || [])
        ].filter(Boolean).join(" ").toLocaleLowerCase("ru-RU").includes(search);
      });
  }, [countFilter, productById, q, rows]);
  const completedCount = rows.filter((row) => row.actual !== undefined).length;
  const differenceCount = rows.filter((row) => row.actual !== undefined && row.actual !== row.expected).length;
  const manualProduct = productById.get(manualProductId);
  const manualAvailable = availableByProduct.get(manualProductId) || 0;

  const confirmVisibleByAccounting = () => {
    const visibleIds = new Set(visibleRows.map((item) => item.row.productId));
    setRows((current) => current.map((row) =>
      visibleIds.has(row.productId) && row.actual === undefined ? { ...row, actual: row.expected } : row
    ));
  };

  if (loading && !products.length) return <Skeleton />;
  return (
    <>
      <section className="stack seller-page admin-page inventory-page">
        {message && <Notice tone={message.includes("завершена") || message.includes("зарегистрирован") || message.includes("применена") || message.includes("запущена") ? "good" : "danger"}>{message}</Notice>}

        <div className="inventory-workspace">
          <nav className="inventory-operation-menu" aria-label="Операция с остатками">
            {!warehouseMode && <button className={operation === "inventory" ? "active" : "secondary"} onClick={() => setOperation("inventory")}>Проверка</button>}
            <button className={operation === "consumption" ? "active" : "secondary"} onClick={() => setOperation("consumption")}>Списание</button>
            {canAdjust && <button className={operation === "adjustment" ? "active" : "secondary"} onClick={() => setOperation("adjustment")}>Корректировка</button>}
          </nav>

          {operation === "inventory" && !warehouseMode && (!active ? (
            <Panel className="inventory-start-card">
              <div>
                <h2>Проверка не начата</h2>
                <p>Сверьте фактический остаток с учётом.</p>
              </div>
              <button onClick={() => void start()} disabled={!canApply || saving}>Начать проверку</button>
            </Panel>
          ) : (
            <Panel className="primary-panel inventory-count-panel" title={`Проверено ${completedCount} из ${rows.length}`}>
              {active.session.actorId !== session.user.id && <Notice tone="warn">Сессию заполняет сотрудник, который её начал.</Notice>}
              <Toolbar className="inventory-count-toolbar">
                <input type="search" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Название, артикул или штрихкод" />
                <select value={countFilter} onChange={(event) => setCountFilter(event.target.value as CountFilter)} aria-label="Фильтр позиций">
                  <option value="all">Все позиции</option>
                  <option value="pending">Не проверены ({rows.length - completedCount})</option>
                  <option value="difference">Расхождения ({differenceCount})</option>
                </select>
                <button className="secondary" type="button" disabled={active.session.actorId !== session.user.id || !visibleRows.some((item) => item.row.actual === undefined)} onClick={confirmVisibleByAccounting}>Совпадает с учётом</button>
              </Toolbar>
              <DataTable rows={visibleRows} empty="Позиции не найдены" columns={[
                { key: "product", header: "Товар", render: (item) => <span className="inventory-product-cell"><strong>{item.product?.localName || item.product?.officialName || item.row.productId}</strong>{item.product?.article && <small>{item.product.article}</small>}</span> },
                { key: "expected", header: "Учёт", render: (item) => formatProductQuantity(item.product, item.row.expected) },
                { key: "actual", header: "Факт", render: (item) => <input className="table-input" type="number" min="0" step="1" disabled={active.session.actorId !== session.user.id} value={item.row.actual ?? ""} placeholder="—" aria-label={`Фактический остаток: ${item.product?.localName || item.row.productId}`} onChange={(event) => { const value = event.target.value; setRows((current) => current.map((row, index) => index === item.index ? { ...row, actual: value === "" ? undefined : Number(value) } : row)); }} /> },
                { key: "delta", header: "Разница", render: (item) => item.row.actual === undefined ? <span className="inventory-muted">—</span> : <StatusBadge tone={item.row.actual < item.row.expected ? "danger" : item.row.actual > item.row.expected ? "warn" : "good"}>{item.row.actual - item.row.expected}</StatusBadge> }
              ]} />
              <div className="inventory-finish">
                <Field label="Комментарий"><input value={inventoryComment} onChange={(event) => setInventoryComment(event.target.value)} placeholder="Необязательно" /></Field>
                <button onClick={() => void close()} disabled={saving || active.session.actorId !== session.user.id || completedCount !== rows.length || rows.some((row) => !Number.isInteger(row.actual) || Number(row.actual) < 0)}>Завершить проверку</button>
              </div>
            </Panel>
          ))}

          {operation === "consumption" && <Panel className="inventory-operation-form" title="Списание">
            {active && <Notice tone="warn">Списание заблокировано до завершения проверки.</Notice>}
            <div className="inventory-command-form">
              <Field label="Товар">
                <ProductPicker products={products} value={manualProductId} onChange={setManualProductId} disabled={Boolean(active)} getMeta={(product) => formatProductQuantity(product, availableByProduct.get(product.id) || 0)} />
              </Field>
              {manualProduct && <div className="inventory-selected-product"><strong>{manualProduct.localName || manualProduct.officialName}</strong><span>Доступно: {formatProductQuantity(manualProduct, manualAvailable)}</span></div>}
              <div className="form-grid">
                <Field label="Количество" hint={manualProduct ? `Останется ${formatProductQuantity(manualProduct, Math.max(0, manualAvailable - manualQuantity))}` : undefined}><input type="number" min="1" max={manualAvailable} step="1" value={manualQuantity} onChange={(event) => setManualQuantity(Number(event.target.value))} /></Field>
                <Field label="Причина"><input value={consumptionReason} onChange={(event) => setConsumptionReason(event.target.value)} placeholder="Например, дегустация" /></Field>
              </div>
              <div className="inventory-submit-row"><button disabled={Boolean(active) || saving || !manualProduct || manualQuantity <= 0 || manualQuantity > manualAvailable || !consumptionReason.trim()} onClick={() => void submitManual("consumption")}>Списать {manualProduct ? formatProductQuantity(manualProduct, manualQuantity) : ""}</button></div>
            </div>
          </Panel>}

          {operation === "adjustment" && canAdjust && <Panel className="inventory-operation-form" title="Корректировка">
            {active && <Notice tone="warn">Корректировка заблокирована до завершения проверки.</Notice>}
            <div className="inventory-command-form">
              <Field label="Товар">
                <ProductPicker products={products} value={manualProductId} onChange={setManualProductId} disabled={Boolean(active)} getMeta={(product) => formatProductQuantity(product, availableByProduct.get(product.id) || 0)} />
              </Field>
              {manualProduct && <div className="inventory-selected-product"><strong>{manualProduct.localName || manualProduct.officialName}</strong><span>Сейчас: {formatProductQuantity(manualProduct, manualAvailable)}</span></div>}
              <div className="form-grid">
                <Field label="Изменить на" hint="Минус уменьшает остаток, плюс увеличивает."><input type="number" step="1" value={adjustmentDelta} onChange={(event) => setAdjustmentDelta(Number(event.target.value))} /></Field>
                <Field label="Основание"><input value={adjustmentReason} onChange={(event) => setAdjustmentReason(event.target.value)} placeholder="Например, расхождение по акту" /></Field>
                {warehouseMode && adjustmentDelta > 0 && <Field label="Себестоимость добавленных упаковок, ₽"><input type="number" min="0" step="0.01" value={adjustmentCostRubles} onChange={(event) => setAdjustmentCostRubles(Number(event.target.value))} /></Field>}
              </div>
              <div className="inventory-submit-row"><button disabled={Boolean(active) || saving || !manualProduct || adjustmentDelta === 0 || (warehouseMode && adjustmentDelta > 0 && adjustmentCostRubles < 0)} onClick={() => void submitManual("adjustment")}>Применить</button></div>
            </div>
          </Panel>}

          {operation === "consumption" && consumptions.length > 0 && <details className="inventory-history">
            <summary>Последние списания</summary>
            <DataTable rows={consumptions.slice(0, 20)} empty="Расходов нет" columns={[
              { key: "product", header: "Товар", render: (row) => productById.get(row.productId)?.localName || row.productId },
              { key: "quantity", header: "Количество", render: (row) => formatProductQuantity(productById.get(row.productId), row.quantity) },
              { key: "source", header: "Источник", render: (row) => row.source },
              { key: "comment", header: "Комментарий", render: (row) => row.comment || "—" }
            ]} />
          </details>}
        </div>
      </section>
      {confirmDialog}
    </>
  );
}

function warehouseProduct(product: WarehouseCatalogProduct): Product {
  return { id: product.id, officialName: product.officialName, localName: product.localName, unit: product.inventoryKind === "weight" ? "кг" : "шт", photoUrl: "", category: "Складская номенклатура", tags: [], status: product.status, identifiers: product.article ? [{ id: `article-${product.id}`, productId: product.id, type: "supplier_article", value: product.article }] : [], lowStockThreshold: product.inventoryKind === "weight" ? 1 : 3, inventoryKind: product.inventoryKind, packageMassGrams: product.packageMassGrams, article: product.article };
}

import { useEffect, useMemo, useRef, useState } from "react";
import type { InventoryBalance, Location, Product, StockBalance, StockOperation, StockOperationType } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { operationLabels, operationTone, stockOperationOptions } from "../constants";
import { formatIdentifiers, formatProductQuantity } from "../presentation";
import { DataTable, Field, Metric, Notice, PageHeader, Panel, Skeleton, StatusBadge, Toolbar, formatDateTime, useConfirm } from "../ui";

type StockForm = {
  type: StockOperationType;
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  reason: string;
};

type StockRow = {
  balance: StockBalance;
  product?: Product;
  location?: Location;
};

type StockView = "locations" | "low" | "zero" | "journal";

type BufferedOperation = {
  id: string;
  type: "transfer" | "write_off" | "inventory";
  productId: string;
  fromLocationId: string;
  toLocationId: string;
  quantity: number;
  actual: number;
  reason: string;
};

type BufferApplyResult = { id: string; status: "applied" | "failed"; error?: string };

export function StockPage({ client, session, intent, onIntentHandled }: PageProps) {
  const deferredTabletBufferEnabled = false;
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [operations, setOperations] = useState<StockOperation[]>([]);
  const [totals, setTotals] = useState<InventoryBalance[]>([]);
  const [form, setForm] = useState<StockForm>({ productId: "p-1", fromLocationId: "loc-main", toLocationId: "loc-counter", quantity: 1, type: "transfer", reason: "Рабочее перемещение" });
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");
  const [activeLocation, setActiveLocation] = useState("all");
  const [stockView, setStockView] = useState<StockView>("locations");
  const [selectedStockProductId, setSelectedStockProductId] = useState("");
  const sellerDialogRef = useRef<HTMLDivElement>(null);
  const sellerDialogTriggerRef = useRef<HTMLElement | null>(null);
  const [workBuffer, setWorkBuffer] = useState<BufferedOperation[]>(() => readWorkBuffer());
  const [bufferOpen, setBufferOpen] = useState(false);
  const [bufferApplying, setBufferApplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const canMove = session.permissions.includes("stock:move");
  const canInventory = session.permissions.includes("inventory:write");
  const isSeller = session.user.role === "seller";
  const canReverse = session.permissions.includes("techlog:read");
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [p, l, b, o, t] = await Promise.all([
        client.request<{ items: Product[] }>("/api/products?status=all&limit=100"),
        client.request<Location[]>("/api/locations"),
        client.request<StockBalance[]>("/api/balances"),
        client.request<StockOperation[]>("/api/stock/operations"),
        client.request<InventoryBalance[]>("/api/stock/totals")
      ]);
      setProducts(p.items);
      setLocations(l);
      setBalances(b);
      setOperations(o);
      setTotals(t);
      if (!isSeller && activeLocation === "all" && l[0]) setActiveLocation(l[0].id);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  useEffect(() => { localStorage.setItem("stock-work-buffer", JSON.stringify(workBuffer)); }, [workBuffer]);

  useEffect(() => {
    if (intent === "stock-receipt") {
      startReceipt();
      onIntentHandled?.();
    }
    if (intent === "stock-search") {
      setShowForm(false);
      setStockView("locations");
      setActiveLocation("all");
      setQ("");
      setSelectedStockProductId("");
      onIntentHandled?.();
    }
  }, [intent, onIntentHandled]);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const locationById = useMemo(() => new Map(locations.map((location) => [location.id, location])), [locations]);

  const rows = useMemo<StockRow[]>(() => {
    const query = q.trim().toLowerCase();
    return balances
      .map((balance) => ({
        balance,
        product: productById.get(balance.productId),
        location: locationById.get(balance.locationId)
      }))
      .filter((row) => row.location?.status !== "archived")
      .filter((row) => activeLocation === "all" || row.balance.locationId === activeLocation)
      .filter((row) => {
        if (!query) return true;
        return [row.product?.localName, row.product?.officialName, row.product?.identifiers.map((item) => item.value).join(" "), row.location?.name, row.location?.code]
          .join(" ")
          .toLowerCase()
          .includes(query);
      });
  }, [activeLocation, balances, locationById, productById, q]);

  const lowRows = rows.filter((row) => row.product && row.balance.quantity <= row.product.lowStockThreshold);
  const zeroRows = products
    .map((product) => ({ product, total: totals.find((item) => item.productId === product.id)?.quantity || 0 }))
    .filter((item) => item.total <= 0 && (!q || [item.product.localName, item.product.officialName, item.product.identifiers.map((id) => id.value).join(" ")].join(" ").toLowerCase().includes(q.toLowerCase())));
  const visibleRows = stockView === "low" ? lowRows : rows;
  const locationGroups = locations
    .filter((location) => location.status === "active")
    .filter((location) => activeLocation === "all" || location.id === activeLocation)
    .map((location) => {
      const groupRows = visibleRows.filter((row) => row.balance.locationId === location.id).sort((a, b) => productTitle(a).localeCompare(productTitle(b), "ru"));
      return {
        location,
        rows: groupRows,
        total: groupRows.reduce((sum, row) => sum + row.balance.quantity, 0),
        low: groupRows.filter((row) => row.product && row.balance.quantity <= row.product.lowStockThreshold).length
      };
    });
  const activeLocations = locations.filter((location) => location.status === "active");
  const sellerLocationCards = activeLocations.map((location) => {
    const locationRows = rowsForLocation(location.id, balances, productById).filter((row) => row.balance.quantity > 0);
    return {
      location,
      rows: locationRows,
      total: locationRows.reduce((sum, row) => sum + row.balance.quantity, 0)
    };
  });
  const sellerLocationRows = rows.filter((row) => row.balance.quantity > 0).sort((a, b) => productTitle(a).localeCompare(productTitle(b), "ru"));
  const sellerSearchResults = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return [];
    return products
      .map((product) => ({
        product,
        stock: productStockLines(product.id, balances, locations),
        total: totals.find((item) => item.productId === product.id)?.quantity || 0
      }))
      .filter((item) => productSearchText(item.product).includes(query))
      .sort((a, b) => Number(b.total > 0) - Number(a.total > 0) || a.product.localName.localeCompare(b.product.localName, "ru"));
  }, [balances, locations, products, q, totals]);

  const selectedProduct = products.find((item) => item.id === form.productId);
  const fromBalance = balances.find((item) => item.productId === form.productId && item.locationId === form.fromLocationId);
  const toBalance = balances.find((item) => item.productId === form.productId && item.locationId === form.toLocationId);
  const projectedFrom = form.type === "receipt" || form.type === "correction" ? undefined : (fromBalance?.quantity || 0) - form.quantity;
  const projectedTo = form.type === "write_off" ? undefined : (toBalance?.quantity || 0) + form.quantity;
  const selectedStockProduct = products.find((item) => item.id === selectedStockProductId);
  const selectedStockLines = selectedStockProduct ? productStockLines(selectedStockProduct.id, balances, locations) : [];
  const selectedSourceRows = selectedStockProduct ? rowsForProduct(selectedStockProduct.id, balances, locationById).filter((row) => row.balance.quantity > 0) : [];
  const selectedSourceBalance = balances.find((balance) => balance.productId === selectedStockProductId && balance.locationId === form.fromLocationId);
  const sellerMaxQty = selectedSourceBalance?.quantity || 0;
  const sellerDestinationLocations = activeLocations.filter((location) => location.id !== form.fromLocationId);

  function startReceipt() {
    setForm((current) => ({
      ...current,
      type: "receipt",
      productId: current.productId || products[0]?.id || "p-1",
      toLocationId: current.toLocationId || locations[0]?.id || "loc-main",
      quantity: 1,
      reason: "Приход товара"
    }));
    setShowForm(true);
  }

  const startRowAction = (row: StockRow, type: "transfer" | "write_off") => {
    const fallbackTarget = locations.find((location) => location.id !== row.balance.locationId)?.id || row.balance.locationId;
    setForm({
      type,
      productId: row.balance.productId,
      fromLocationId: row.balance.locationId,
      toLocationId: fallbackTarget,
      quantity: Math.min(1, Math.max(1, row.balance.quantity)),
      reason: type === "transfer" ? "Перемещение" : "Списание"
    });
    setShowForm(true);
  };

  const startCorrection = (row: StockRow) => {
    setForm({ type: "correction", productId: row.balance.productId, fromLocationId: "", toLocationId: row.balance.locationId, quantity: 1, reason: "Корректировка остатка" });
    setShowForm(true);
  };

  const toggleBuffer = (row: StockRow) => setWorkBuffer((items) => {
    const existing = items.find((item) => item.productId === row.balance.productId && item.fromLocationId === row.balance.locationId);
    if (existing) return items.filter((item) => item.id !== existing.id);
    const target = activeLocations.find((location) => location.id !== row.balance.locationId)?.id || "";
    return [...items, {
      id: crypto.randomUUID(),
      type: "transfer",
      productId: row.balance.productId,
      fromLocationId: row.balance.locationId,
      toLocationId: target,
      quantity: 1,
      actual: row.balance.quantity,
      reason: "Планшет: перемещение"
    }];
  });

  const updateBufferedOperation = (id: string, patch: Partial<BufferedOperation>) => {
    setWorkBuffer((items) => items.map((item) => item.id === id ? { ...item, ...patch } : item));
  };

  const applyWorkBuffer = async () => {
    if (!workBuffer.length || bufferApplying || !canMove) return;
    setBufferApplying(true);
    setMessage("");
    try {
      const response = await client.request<{ results: BufferApplyResult[] }>("/api/stock/buffer/apply", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ entries: workBuffer })
      });
      const appliedIds = new Set(response.results.filter((item) => item.status === "applied").map((item) => item.id));
      const failed = response.results.find((item) => item.status === "failed");
      setWorkBuffer((items) => items.filter((item) => !appliedIds.has(item.id)));
      await load();
      setMessage(failed
        ? `Применено: ${appliedIds.size}. Остановка: ${failed.error || "ошибка операции"}`
        : `Буфер применён: ${appliedIds.size} операций`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBufferApplying(false);
    }
  };

  const postOperation = async (payload: StockForm) => {
    await client.request("/api/stock/operations", {
      method: "POST",
      headers: { "idempotency-key": crypto.randomUUID() },
      body: JSON.stringify(payload)
    });
  };

  const openSellerProduct = (productId: string, sourceLocationId?: string) => {
    sellerDialogTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const source = sourceLocationId || balances.find((balance) => balance.productId === productId && balance.quantity > 0)?.locationId || "";
    const destination = activeLocations.find((location) => location.id !== source)?.id || "";
    setSelectedStockProductId(productId);
    setForm({
      type: "transfer",
      productId,
      fromLocationId: source,
      toLocationId: destination,
      quantity: 1,
      reason: "Перемещение"
    });
  };

  const closeSellerProduct = () => {
    setSelectedStockProductId("");
    queueMicrotask(() => sellerDialogTriggerRef.current?.focus());
  };

  useEffect(() => {
    if (!selectedStockProductId || !sellerDialogRef.current) return;
    const dialog = sellerDialogRef.current;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])"));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSellerProduct();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedStockProductId]);

  const changeSellerSource = (sourceLocationId: string) => {
    const destination = form.toLocationId && form.toLocationId !== sourceLocationId
      ? form.toLocationId
      : activeLocations.find((location) => location.id !== sourceLocationId)?.id || "";
    const nextBalance = balances.find((balance) => balance.productId === selectedStockProductId && balance.locationId === sourceLocationId);
    setForm({
      ...form,
      fromLocationId: sourceLocationId,
      toLocationId: destination,
      quantity: normalizeQty(form.quantity, nextBalance?.quantity || 0)
    });
  };

  const changeSellerQuantity = (quantity: number) => {
    setForm({ ...form, quantity: selectedStockProduct?.inventoryKind === "weight" ? 1 : normalizeQty(Math.floor(quantity), sellerMaxQty) });
  };

  const applySellerMove = async (type: "transfer" | "write_off") => {
    if (!selectedStockProduct || !canMove || saving) return;
    if (!form.fromLocationId) {
      setMessage("Выберите источник");
      return;
    }
    if (type === "transfer" && (!form.toLocationId || form.toLocationId === form.fromLocationId)) {
      setMessage("Выберите другую точку");
      return;
    }
    if (form.quantity <= 0 || sellerMaxQty < form.quantity) {
      setMessage("Недостаточно остатка");
      return;
    }
    if (type === "write_off") {
      const quantity = selectedStockProduct.inventoryKind === "weight" ? 1 : form.quantity;
      const approved = await confirm({
        title: "Списать брак?",
        description: `${selectedStockProduct.localName}: ${formatProductQuantity(selectedStockProduct, quantity)}. После операции останется ${formatProductQuantity(selectedStockProduct, sellerMaxQty - quantity)}.`,
        confirmLabel: "Списать брак",
        tone: "danger"
      });
      if (!approved) return;
    }
    setSaving(true);
    setMessage("");
    try {
      await postOperation({
        type,
        productId: selectedStockProduct.id,
        fromLocationId: form.fromLocationId,
        toLocationId: type === "transfer" ? form.toLocationId : "",
        quantity: selectedStockProduct.inventoryKind === "weight" ? 1 : form.quantity,
        reason: type === "transfer" ? "Перемещение" : "Брак"
      });
      setMessage(type === "transfer" ? "Товар перемещен" : "Брак зарегистрирован");
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const submit = async () => {
    if (!canMove) return;
    setSaving(true);
    setMessage("");
    try {
      await postOperation(form);
      setMessage("Операция применена");
      await load();
      setShowForm(false);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const reverse = async (operation: StockOperation) => {
    const confirmed = await confirm({
      title: "Отменить складскую операцию?",
      description: `Будет создана обратная операция для "${operationLabels[operation.type] || operation.type}".`,
      confirmLabel: "Отменить операцию",
      tone: "warn"
    });
    if (!confirmed) return;
    setMessage("");
    try {
      await client.request(`/api/stock/operations/${operation.id}/reverse`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() }
      });
      setMessage("Операция отменена");
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  if (loading && !balances.length) return <Skeleton />;

  if (isSeller) {
    return (
      <section className="stack seller-page">
        {message && <Notice tone={message.includes("перемещ") || message.includes("зал") ? "good" : "danger"}>{message}</Notice>}

        <Panel>
          <Toolbar className="seller-toolbar">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Товар, артикул, штрихкод" />
            {activeLocation !== "all" && <div className="selected-location"><strong>{locationName(activeLocation, locations)}</strong><button className="secondary small" onClick={() => setActiveLocation("all")}>Сменить</button></div>}
          </Toolbar>
        </Panel>

        {!q.trim() && activeLocation === "all" && (
          <div className="seller-location-grid">
            {sellerLocationCards.map((group) => (
              <button className="seller-location-card" key={group.location.id} onClick={() => setActiveLocation(group.location.id)}>
                <strong>{group.location.name}</strong>
                <small>{group.rows.length} поз.</small>
                <span>Низкий остаток: {group.rows.filter((row) => row.product && row.balance.quantity <= row.product.lowStockThreshold).length}</span>
              </button>
            ))}
          </div>
        )}

        {q.trim() && (
          <Panel title="Поиск">
            <div className="product-result-list">
              {sellerSearchResults.length ? sellerSearchResults.map(({ product, stock }) => (
                <article className="product-result-card" key={product.id}>
                  <div className="product-result-head">
                    {product.photoUrl && <img src={product.photoUrl} alt="" />}
                    <div>
                      <h2>{product.localName || product.officialName}</h2>
                      <p>{product.officialName}</p>
                      <small>{identifierValues(product)}</small>
                    </div>
                  </div>
                  <div className="stock-lines">
                    {stock.length ? stock.map((line) => (
                      <div className="stock-line" key={line.locationId}>
                        <span>{line.locationName}</span>
                        <strong>{formatProductQuantity(product, line.quantity)}</strong>
                      </div>
                    )) : <span className="muted-line">Нет в наличии</span>}
                  </div>
                  <button className="secondary small" onClick={() => openSellerProduct(product.id, stock[0]?.locationId)}>Действия</button>
                </article>
              )) : <Notice>Товары не найдены.</Notice>}
            </div>
          </Panel>
        )}

        {!q.trim() && activeLocation !== "all" && (
          <Panel
            title={`Товары: ${locationName(activeLocation, locations)}`}
          >
            <div className="bot-stock-list">
              {sellerLocationRows.length ? sellerLocationRows.map((row) => (
                <button className="bot-stock-row" key={`${row.balance.productId}:${row.balance.locationId}`} onClick={() => openSellerProduct(row.balance.productId, row.balance.locationId)}>
                  <span>
                    <strong>{productTitle(row)}</strong>
                    <small>{identifierSummary(row.product)}</small>
                  </span>
                  <b>{formatProductQuantity(row.product, row.balance.quantity)}</b>
                </button>
              )) : <Notice>В этой точке пусто.</Notice>}
            </div>
          </Panel>
        )}

        {selectedStockProduct && (
          <>
          <button className="seller-sheet-backdrop" aria-label="Закрыть действия с товаром" onClick={closeSellerProduct} />
          <div ref={sellerDialogRef} className="seller-stock-sheet" role="dialog" aria-modal="true" aria-label={`Действия с товаром ${selectedStockProduct.localName || selectedStockProduct.officialName}`}>
          <Panel
            title={selectedStockProduct.localName || selectedStockProduct.officialName}
            actions={<button className="icon-button secondary" onClick={closeSellerProduct} aria-label="Закрыть">×</button>}
          >
            <div className="seller-product-workbench">
              <div className="seller-product-info">
                {selectedStockProduct.photoUrl && <img src={selectedStockProduct.photoUrl} alt="" />}
                <div>
                  <p>{selectedStockProduct.officialName}</p>
                  <small>{identifierValues(selectedStockProduct)}</small>
                </div>
              </div>

              <div className="stock-lines">
                {selectedStockLines.length ? selectedStockLines.map((line) => (
                  <div className="stock-line" key={line.locationId}>
                    <span>{line.locationName}</span>
                    <strong>{formatProductQuantity(selectedStockProduct, line.quantity)}</strong>
                  </div>
                )) : <span className="muted-line">Нет в наличии</span>}
              </div>

              {selectedSourceRows.length > 0 && (
                <div className="seller-move-box">
                  <div className="form-grid">
                    <Field label="Откуда">
                      <select value={form.fromLocationId} onChange={(event) => changeSellerSource(event.target.value)}>
                        {selectedSourceRows.map((row) => (
                          <option key={row.balance.locationId} value={row.balance.locationId}>
                            {locationName(row.balance.locationId, locations)} · {formatProductQuantity(selectedStockProduct, row.balance.quantity)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Куда">
                      <select value={form.toLocationId} onChange={(event) => setForm({ ...form, toLocationId: event.target.value })}>
                        {sellerDestinationLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                      </select>
                    </Field>
                  </div>

                  {selectedStockProduct.inventoryKind === "weight" ? <Notice>Операция выполняется с одной пачкой: {formatProductQuantity(selectedStockProduct, 1)}.</Notice> : (
                    <div className="qty-stepper">
                      <button className="secondary" onClick={() => changeSellerQuantity(form.quantity - 1)} disabled={saving || form.quantity <= 1}>−</button>
                      <input type="number" min="1" step="1" value={form.quantity} onChange={(event) => changeSellerQuantity(Number(event.target.value))} />
                      <button className="secondary" onClick={() => changeSellerQuantity(form.quantity + 1)} disabled={saving || form.quantity >= sellerMaxQty}>+</button>
                    </div>
                  )}

                  <div className="inline-actions seller-actions">
                    <div className="operation-summary">Переместить {formatProductQuantity(selectedStockProduct, selectedStockProduct.inventoryKind === "weight" ? 1 : form.quantity)} из «{locationName(form.fromLocationId, locations)}» в «{locationName(form.toLocationId, locations)}».</div>
                    <button disabled={saving || !form.toLocationId || form.toLocationId === form.fromLocationId || form.quantity <= 0 || form.quantity > sellerMaxQty} onClick={() => applySellerMove("transfer")}>
                      Переместить
                    </button>
                    <button className="danger-secondary" disabled={saving || form.quantity <= 0 || form.quantity > sellerMaxQty} onClick={() => applySellerMove("write_off")}>
                      Списать брак
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Panel>
          </div>
          </>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="stack admin-page stock-page">
        <PageHeader
          title="Склад"
          description="Остатки по локациям, быстрые корректировки и перемещения."
          actions={(
            <>
              <button className="secondary" onClick={load} disabled={loading}>Обновить</button>
              {deferredTabletBufferEnabled && <button className="secondary" onClick={() => setBufferOpen((value) => !value)}>Буфер: {workBuffer.length}</button>}
              {canMove && <button onClick={startReceipt}>Приход</button>}
            </>
          )}
        />
        {message && <Notice tone={message.includes("примен") || message.includes("отмен") || message.includes("обнов") ? "good" : "danger"}>{message}</Notice>}

        <div className="metric-grid compact secondary-metrics">
          <Metric title="Локаций" value={locations.length} />
          <Metric title="Позиций" value={balances.filter((balance) => balance.quantity > 0).length} />
          <Metric title="Низкий остаток" value={lowRows.length} tone={lowRows.length ? "warn" : "good"} />
          <Metric title="Без остатка" value={zeroRows.length} tone={zeroRows.length ? "danger" : "good"} />
        </div>

        <Panel className="primary-panel">
          <div className="stock-nav">
            <button className={stockView === "locations" ? "active" : ""} onClick={() => setStockView("locations")}>Локации</button>
            <button className={stockView === "low" ? "active" : ""} onClick={() => setStockView("low")}>Заканчиваются · {lowRows.length}</button>
            <button className={stockView === "zero" ? "active" : ""} onClick={() => setStockView("zero")}>Нулевые · {zeroRows.length}</button>
            <button className={stockView === "journal" ? "active" : ""} onClick={() => setStockView("journal")}>Журнал</button>
          </div>
          <Toolbar>
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск товара или локации" />
            <select value={activeLocation} onChange={(event) => setActiveLocation(event.target.value)}>
              <option value="all">Все локации</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </Toolbar>
        </Panel>

        {canMove && showForm && (
          <Panel className="primary-actions" title={operationTitle(form.type)} description={operationDescription(form.type)} actions={<button className="secondary small" onClick={() => setShowForm(false)}>Скрыть</button>}>
            <div className="form-grid">
              <Field label="Тип">
                <select value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as StockOperationType })}>
                  {stockOperationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <Field label="Товар">
                <select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>
                  {products.map((product) => <option key={product.id} value={product.id}>{product.localName}</option>)}
                </select>
              </Field>
              {form.type !== "receipt" && form.type !== "correction" && (
                <Field label="Откуда" hint={`Сейчас: ${fromBalance?.quantity ?? 0}; после: ${projectedFrom ?? "—"}`}>
                  <select value={form.fromLocationId} onChange={(event) => setForm({ ...form, fromLocationId: event.target.value })}>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </Field>
              )}
              {form.type !== "write_off" && (
                <Field label="Куда" hint={`Сейчас: ${toBalance?.quantity ?? 0}; после: ${projectedTo ?? "—"}`}>
                  <select value={form.toLocationId} onChange={(event) => setForm({ ...form, toLocationId: event.target.value })}>
                    {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Количество" hint={selectedProduct && `Шаг: ${selectedProduct.inventoryKind === "weight" ? "1 пачка" : selectedProduct.unit}`}>
                <input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} />
              </Field>
              <Field label="Основание">
                <input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
              </Field>
            </div>
            {projectedFrom !== undefined && projectedFrom < 0 && <Notice tone="danger">Остаток источника станет отрицательным.</Notice>}
            {form.type === "transfer" && form.fromLocationId === form.toLocationId && <Notice tone="danger">Источник и назначение должны отличаться.</Notice>}
            <button onClick={submit} disabled={saving || form.quantity <= 0 || !form.reason.trim() || (projectedFrom !== undefined && projectedFrom < 0) || (form.type === "transfer" && form.fromLocationId === form.toLocationId)}>
              {saving ? "Проведение..." : "Провести"}
            </button>
          </Panel>
        )}

        {deferredTabletBufferEnabled && bufferOpen && (
          <Panel
            title="Буфер планшета"
            description="Операции выполняются строго по порядку. При ошибке выполнение остановится, неприменённые строки останутся в буфере."
            actions={<button className="secondary small" onClick={() => setWorkBuffer([])} disabled={!workBuffer.length || bufferApplying}>Очистить</button>}
          >
            {!workBuffer.length ? <Notice>Добавьте товар в буфер из карточки остатка.</Notice> : (
              <div className="stack">
                {workBuffer.map((item, index) => (
                  <div className="form-grid" key={item.id}>
                    <strong>{index + 1}.</strong>
                    <Field label="Операция">
                      <select value={item.type} onChange={(event) => updateBufferedOperation(item.id, { type: event.target.value as BufferedOperation["type"] })} disabled={bufferApplying}>
                        <option value="transfer">Перемещение</option>
                        <option value="write_off">Списание</option>
                        {canInventory && <option value="inventory">Инвентаризация</option>}
                      </select>
                    </Field>
                    <Field label="Товар">
                      <select value={item.productId} onChange={(event) => updateBufferedOperation(item.id, { productId: event.target.value })} disabled={bufferApplying}>
                        {products.map((product) => <option key={product.id} value={product.id}>{product.localName}</option>)}
                      </select>
                    </Field>
                    {item.type !== "inventory" && <Field label="Откуда">
                      <select value={item.fromLocationId} onChange={(event) => updateBufferedOperation(item.id, { fromLocationId: event.target.value })} disabled={bufferApplying}>
                        {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                      </select>
                    </Field>}
                    {item.type === "transfer" && <Field label="Куда">
                      <select value={item.toLocationId} onChange={(event) => updateBufferedOperation(item.id, { toLocationId: event.target.value })} disabled={bufferApplying}>
                        {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                      </select>
                    </Field>}
                    {item.type === "inventory" && <Field label="Локация">
                      <select value={item.toLocationId} onChange={(event) => updateBufferedOperation(item.id, { toLocationId: event.target.value })} disabled={bufferApplying}>
                        {activeLocations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                      </select>
                    </Field>}
                    <Field label={item.type === "inventory" ? "Фактический остаток" : "Количество"}>
                      <input type="number" min="0" step="0.001" value={item.type === "inventory" ? item.actual : item.quantity} onChange={(event) => updateBufferedOperation(item.id, item.type === "inventory" ? { actual: Number(event.target.value) } : { quantity: Number(event.target.value) })} disabled={bufferApplying} />
                    </Field>
                    <Field label="Основание">
                      <input value={item.reason} onChange={(event) => updateBufferedOperation(item.id, { reason: event.target.value })} disabled={bufferApplying} />
                    </Field>
                    <button className="secondary small" onClick={() => setWorkBuffer((items) => items.filter((entry) => entry.id !== item.id))} disabled={bufferApplying}>Убрать</button>
                  </div>
                ))}
                <button onClick={applyWorkBuffer} disabled={bufferApplying || !workBuffer.length}>{bufferApplying ? "Применение..." : `Применить ${workBuffer.length} операций`}</button>
              </div>
            )}
          </Panel>
        )}

        {stockView === "zero" && (
          <Panel title="Нулевой остаток">
            <DataTable
              rows={zeroRows}
              empty="Нулевых остатков нет"
              columns={[
                { key: "product", header: "Товар", render: (row) => row.product.localName },
                { key: "official", header: "Официально", render: (row) => row.product.officialName },
                { key: "category", header: "Категория", render: (row) => row.product.category },
                { key: "actions", header: "Действия", render: (row) => canMove ? <button className="secondary small" onClick={() => { setForm({ type: "receipt", productId: row.product.id, fromLocationId: "", toLocationId: activeLocation === "all" ? locations[0]?.id || "" : activeLocation, quantity: 1, reason: "Приход товара" }); setShowForm(true); }}>Добавить</button> : "—" }
              ]}
            />
          </Panel>
        )}

        {stockView !== "zero" && stockView !== "journal" && (
          <div className="location-grid">
            {locationGroups.map((group) => (
              <section className="location-card" key={group.location.id} id={`loc-${group.location.id}`}>
                <div className="location-head">
                  <div>
                    <h2>{group.location.name}</h2>
                  </div>
                  <div className="location-summary">
                    <strong>{group.rows.length} поз.</strong>
                    <span>товары в наличии</span>
                  </div>
                </div>
                {group.low > 0 && <Notice tone="warn">Низкий остаток: {group.low}</Notice>}
                <div className="location-stock-list">
                  {group.rows.length ? group.rows.map((row) => (
                    <article className="location-stock-row" key={`${row.balance.productId}:${row.balance.locationId}`}>
                      <div className="stock-product-name">
                        <strong>{productTitle(row)}</strong>
                        <span>{formatIdentifiers(row.product || { identifiers: [] })}</span>
                      </div>
                      <div className="stock-qty-control"><strong>{formatProductQuantity(row.product, row.balance.quantity)}</strong>{row.product && <StatusBadge tone={row.balance.quantity <= row.product.lowStockThreshold ? "warn" : "good"}>{row.balance.quantity <= row.product.lowStockThreshold ? "Заканчивается" : "В норме"}</StatusBadge>}</div>
                      <div className="stock-row-actions">
                        {deferredTabletBufferEnabled && <button className="secondary small" onClick={() => toggleBuffer(row)}>{workBuffer.some((item) => item.productId === row.balance.productId && item.fromLocationId === row.balance.locationId) ? "Убрать" : "В буфер"}</button>}
                        <button className="small" disabled={!canMove || saving || row.balance.quantity <= 0} onClick={() => startRowAction(row, "transfer")}>Переместить</button>
                        <details className="action-menu"><summary aria-label={`Другие действия с ${productTitle(row)}`}>⋯</summary><div className="action-menu-popover"><button className="danger small" disabled={!canMove || saving || row.balance.quantity <= 0} onClick={() => startRowAction(row, "write_off")}>Списать</button><button className="secondary small" disabled={!canMove || saving} onClick={() => startCorrection(row)}>Корректировать</button></div></details>
                      </div>
                    </article>
                  )) : <Notice>Нет наличия.</Notice>}
                </div>
              </section>
            ))}
          </div>
        )}

        {stockView === "journal" && (
          <Panel title="Журнал операций">
            <DataTable
              rows={operations}
              columns={[
                { key: "date", header: "Время", render: (row) => formatDateTime(row.createdAt) },
                { key: "type", header: "Тип", render: (row) => <StatusBadge tone={operationTone[row.type] || "neutral"}>{operationLabels[row.type] || row.type}</StatusBadge> },
                { key: "product", header: "Товар", render: (row) => products.find((item) => item.id === row.productId)?.localName || row.productId },
                { key: "route", header: "Маршрут", render: (row) => `${locationName(row.fromLocationId, locations)} → ${locationName(row.toLocationId, locations)}` },
                { key: "qty", header: "Количество", render: (row) => formatProductQuantity(products.find((item) => item.id === row.productId), row.quantity) },
                { key: "actor", header: "Автор", render: (row) => row.actorId },
                { key: "reason", header: "Основание", render: (row) => row.reason },
                { key: "actions", header: "Действия", render: (row) => canReverse && row.type !== "reversal" ? <button className="secondary small" onClick={() => reverse(row)}>Отменить</button> : "—" }
              ]}
            />
          </Panel>
        )}
      </section>
      {confirmDialog}
    </>
  );
}

function productTitle(row: StockRow) {
  return row.product?.localName || row.product?.officialName || row.balance.productId;
}

function identifierSummary(product?: Product) {
  return product?.identifiers.slice(0, 2).map((item) => item.value).join(" · ") || "—";
}

function identifierValues(product: Product) {
  return product.identifiers.map((item) => item.value).join(" · ") || "Без артикула";
}

function productSearchText(product: Product) {
  return [
    product.localName,
    product.officialName,
    product.category,
    ...product.tags,
    ...product.identifiers.map((identifier) => identifier.value)
  ].join(" ").toLowerCase();
}

function totalForProduct(productId: string, balances: StockBalance[]) {
  return balances.filter((balance) => balance.productId === productId).reduce((sum, balance) => sum + balance.quantity, 0);
}

function rowsForLocation(locationId: string, balances: StockBalance[], productById: Map<string, Product>) {
  return balances
    .filter((balance) => balance.locationId === locationId)
    .map((balance) => ({ balance, product: productById.get(balance.productId) }));
}

function rowsForProduct(productId: string, balances: StockBalance[], locationById: Map<string, Location>) {
  return balances
    .filter((balance) => balance.productId === productId)
    .map((balance) => ({ balance, location: locationById.get(balance.locationId) }));
}

function productStockLines(productId: string, balances: StockBalance[], locations: Location[]) {
  return balances
    .filter((balance) => balance.productId === productId && balance.quantity > 0)
    .map((balance) => ({
      locationId: balance.locationId,
      locationName: locations.find((location) => location.id === balance.locationId)?.name || balance.locationId,
      quantity: balance.quantity
    }))
    .sort((a, b) => a.locationName.localeCompare(b.locationName, "ru"));
}

function normalizeQty(value: number, max: number) {
  const positive = Math.max(0.001, Number.isFinite(value) ? value : 1);
  return max > 0 ? Math.min(positive, max) : positive;
}

function formatQty(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
}

function operationTitle(type: StockOperationType) {
  if (type === "receipt") return "Приход";
  if (type === "transfer") return "Перемещение";
  if (type === "write_off") return "Списание";
  return "Корректировка";
}

function operationDescription(type: StockOperationType) {
  if (type === "receipt") return "Добавить товар на выбранную локацию.";
  if (type === "transfer") return "Переместить товар между локациями.";
  if (type === "write_off") return "Списать товар с выбранной локации.";
  return "Изменить остаток вручную.";
}

function locationName(id: string | undefined, locations: Location[]) {
  if (!id) return "—";
  return locations.find((item) => item.id === id)?.name || id;
}

function readWorkBuffer(): BufferedOperation[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem("stock-work-buffer") || "[]");
    if (!Array.isArray(raw)) return [];
    // Old versions stored only product ids. They cannot safely be applied without a source location.
    return raw.filter((item): item is BufferedOperation => Boolean(item) && typeof item === "object" && "id" in item && "productId" in item && "type" in item) as BufferedOperation[];
  } catch {
    return [];
  }
}

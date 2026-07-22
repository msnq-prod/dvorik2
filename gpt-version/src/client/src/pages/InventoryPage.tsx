import { useEffect, useMemo, useState } from "react";
import type { Product } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { DataTable, Field, Metric, Notice, PageHeader, Panel, Skeleton, StatusBadge, Toolbar, useConfirm } from "../ui";
import { formatProductQuantity } from "../presentation";

type Session = { id: string; status: string; actorId: string; startedAt: string; version: number };
type SessionRow = { sessionId: string; productId: string; expected: number; actual?: number; version: number };
type ActiveInventory = { session: Session; rows: SessionRow[] } | null;
type Consumption = { id: string; productId: string; quantity: number; source: string; comment: string; createdAt: string };

export function InventoryPage({ client, session, intent, onIntentHandled }: PageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [active, setActive] = useState<ActiveInventory>(null);
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [consumptions, setConsumptions] = useState<Consumption[]>([]);
  const [comment, setComment] = useState("");
  const [q, setQ] = useState("");
  const [manualProductId, setManualProductId] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [adjustmentDelta, setAdjustmentDelta] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const canApply = session.permissions.includes("inventory:write");
  const canAdjust = session.user.role !== "seller";
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    try {
      const [productResponse, nextActive, nextConsumptions] = await Promise.all([
        client.request<{ items: Product[] }>("/api/products?status=active&limit=100"),
        client.request<ActiveInventory>("/api/inventory/session/active"),
        client.request<Consumption[]>("/api/consumption")
      ]);
      setProducts(productResponse.items);
      setActive(nextActive);
      setRows(nextActive?.rows.map((row) => ({ ...row, actual: row.actual ?? row.expected })) ?? []);
      setConsumptions(nextConsumptions);
      setManualProductId((current) => current || productResponse.items[0]?.id || "");
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [client]);
  useEffect(() => {
    if (intent === "inventory-start") { void start(); onIntentHandled?.(); }
  }, [intent, onIntentHandled]);

  const start = async () => {
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
    if (!active || active.session.actorId !== session.user.id) return;
    const approved = await confirm({ title: "Завершить инвентаризацию?", description: "Общий остаток будет заменён физическим фактом. Размещение по полкам не изменится.", confirmLabel: "Завершить", tone: "warn" });
    if (!approved) return;
    setSaving(true); setMessage("");
    try {
      await client.request(`/api/inventory/sessions/${active.session.id}/close`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ rows: rows.map((row) => ({ productId: row.productId, actual: row.actual })), comment }) });
      setMessage("Инвентаризация завершена");
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };

  const submitManual = async (kind: "consumption" | "adjustment") => {
    if (!manualProductId || active) return;
    const selectedProduct = products.find((product) => product.id === manualProductId);
    if (kind === "consumption") {
      const approved = await confirm({ title: "Списать расход?", description: `${selectedProduct?.localName || "Товар"}: ${formatProductQuantity(selectedProduct, manualQuantity)}.${comment.trim() ? ` Причина: ${comment.trim()}.` : ""}`, confirmLabel: "Списать расход", tone: "danger" });
      if (!approved) return;
    }
    setSaving(true); setMessage("");
    try {
      await client.request(kind === "consumption" ? "/api/consumption" : "/api/stock/adjustments", {
        method: "POST", headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(kind === "consumption" ? { productId: manualProductId, quantity: manualQuantity, comment } : { productId: manualProductId, delta: adjustmentDelta, comment })
      });
      setMessage(kind === "consumption" ? "Расход зарегистрирован" : "Корректировка применена");
      await load();
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const visibleRows = rows.map((row, index) => ({ row, index, product: productById.get(row.productId) })).filter((item) => !q || `${item.product?.localName} ${item.product?.officialName}`.toLowerCase().includes(q.toLowerCase()));
  const changed = rows.filter((row) => row.actual !== undefined && row.actual !== row.expected).length;
  const completed = rows.filter((row) => row.actual !== undefined).length;
  const manualProduct = products.find((product) => product.id === manualProductId);

  if (loading && !products.length) return <Skeleton />;
  return (
    <>
      <section className="stack seller-page admin-page inventory-page">
        <PageHeader title="Инвентаризация и расход" description="Общий остаток без распределения расхода по полкам." />
        {message && <Notice tone={message.includes("завершена") || message.includes("зарегистрирован") || message.includes("применена") || message.includes("запущена") ? "good" : "danger"}>{message}</Notice>}

        {session.user.role === "seller" ? <Notice tone={active ? "warn" : "info"}>{active ? `Пересчёт активен: заполнено ${completed} из ${rows.length}` : "Активного пересчёта нет"}</Notice> : <div className="metric-grid compact secondary-metrics"><Metric title="Статус" value={active ? "Активна" : "Нет активной"} /><Metric title="Весовых товаров" value={rows.length} /><Metric title="Расхождений" value={changed} tone={changed ? "warn" : "neutral"} /></div>}

        {!active ? <Panel className="primary-panel"><button onClick={() => void start()} disabled={!canApply || saving}>Начать общий пересчёт</button></Panel> : (
          <Panel className="primary-panel" title="Физический остаток в целых пачках">
            {active.session.actorId !== session.user.id && <Notice tone="warn">Сессию заполняет сотрудник, который её начал.</Notice>}
            <Toolbar><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск товара" /></Toolbar>
            <DataTable rows={visibleRows} empty="Нет весовых товаров" columns={[
              { key: "product", header: "Товар", render: (item) => item.product?.localName || item.product?.officialName || item.row.productId },
              { key: "expected", header: "Учёт", render: (item) => formatProductQuantity(item.product, item.row.expected) },
              { key: "actual", header: "Факт, пачки", render: (item) => <input className="table-input" type="number" min="0" step="1" disabled={active.session.actorId !== session.user.id} value={item.row.actual ?? ""} onChange={(event) => setRows((current) => current.map((row, index) => index === item.index ? { ...row, actual: Number(event.target.value) } : row))} /> },
              { key: "delta", header: "Дельта", render: (item) => <StatusBadge tone={(item.row.actual ?? item.row.expected) < item.row.expected ? "danger" : (item.row.actual ?? item.row.expected) > item.row.expected ? "warn" : "good"}>{(item.row.actual ?? item.row.expected) - item.row.expected}</StatusBadge> }
            ]} />
            <Field label="Комментарий (необязательно)"><input value={comment} onChange={(event) => setComment(event.target.value)} /></Field>
            <button onClick={() => void close()} disabled={saving || active.session.actorId !== session.user.id || rows.some((row) => !Number.isInteger(row.actual) || Number(row.actual) < 0)}>Завершить пересчёт</button>
          </Panel>
        )}

        <Panel className="secondary-panel" title={canAdjust ? "Ручной расход и корректировка" : "Ручной расход"}>
          {active && <Notice tone="warn">Операции заблокированы до завершения инвентаризации.</Notice>}
          <div className="form-grid">
            <Field label="Товар"><select value={manualProductId} onChange={(event) => setManualProductId(event.target.value)}>{products.map((product) => <option key={product.id} value={product.id}>{product.localName || product.officialName}</option>)}</select></Field>
            <Field label="Расход" hint={manualProduct ? `Будет списано: ${formatProductQuantity(manualProduct, manualQuantity)}` : undefined}><input type="number" min="1" step="1" value={manualQuantity} onChange={(event) => setManualQuantity(Number(event.target.value))} /></Field>
            <Field label="Причина"><input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Например, дегустация" /></Field>
            <button disabled={Boolean(active) || saving || manualQuantity <= 0} onClick={() => void submitManual("consumption")}>Списать расход</button>
            {canAdjust && <><Field label="Корректировка (+/−)"><input type="number" step="1" value={adjustmentDelta} onChange={(event) => setAdjustmentDelta(Number(event.target.value))} /></Field><button className="secondary" disabled={Boolean(active) || saving || adjustmentDelta === 0} onClick={() => void submitManual("adjustment")}>Применить корректировку</button></>}
          </div>
        </Panel>

        <Panel className="secondary-panel" title="Последний расход">
          <DataTable rows={consumptions.slice(0, 20)} empty="Расходов нет" columns={[
            { key: "product", header: "Товар", render: (row) => productById.get(row.productId)?.localName || row.productId },
            { key: "quantity", header: "Количество", render: (row) => formatProductQuantity(productById.get(row.productId), row.quantity) },
            { key: "source", header: "Источник", render: (row) => row.source },
            { key: "comment", header: "Комментарий", render: (row) => row.comment || "—" }
          ]} />
        </Panel>
      </section>
      {confirmDialog}
    </>
  );
}

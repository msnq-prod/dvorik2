import { useEffect, useState } from "react";
import type { Product } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { DataTable, Field, Metric, Notice, PageHeader, Panel, Skeleton } from "../ui";

type Mapping = { nomenclatureUuid: string; name: string; barcode: string; article: string; productId: string | null; occurrences: number };
type Status = { availability?: "connected" | "degraded" | "disabled"; enabled: boolean; pointId?: number; pendingSignals?: number; state?: { lastSuccessAt?: string | null; lastErrorCode?: string | null; cursorUpdatedAt?: string | null } };
type WarehouseCatalogProduct = { id: string; officialName: string; localName: string; unit?: Product["unit"]; article: string; inventoryKind: "piece" | "weight"; packageMassGrams?: number; status: Product["status"] };

export function SabyPage({ client }: PageProps) {
  const [status, setStatus] = useState<Status | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextStatus, catalog] = await Promise.all([
        client.request<Status>("/api/cash/status"),
        client.request<WarehouseCatalogProduct[]>("/api/warehouse/catalog").then((items) => ({
          items: items.filter((item) => item.status === "active").map(warehouseProduct)
        }))
      ]);
      const nextMappings = nextStatus.enabled
        ? await client.request<Mapping[]>("/api/saby/mappings")
        : [];
      setStatus(nextStatus);
      setMappings(nextMappings);
      setProducts(catalog.items);
      setSelection(Object.fromEntries(nextMappings.map((item) => [item.nomenclatureUuid, item.productId ?? ""])));
    } catch (error) { setMessage((error as Error).message); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [client]);

  const save = async (item: Mapping) => {
    const productId = selection[item.nomenclatureUuid];
    if (!productId) return setMessage("Выберите товар Dvorik");
    try {
      await client.request("/api/saby/mappings", { method: "PUT", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ nomenclatureUuid: item.nomenclatureUuid, productId }) });
      setMessage("Сопоставление сохранено, накопленные продажи обработаны");
      await load();
    } catch (error) { setMessage((error as Error).message); }
  };

  if (loading) return <Skeleton />;
  return <section className="stack admin-page saby-page">
    <PageHeader title="Saby" description="Состояние синхронизации и сопоставление номенклатуры." actions={<button onClick={load}>Обновить</button>} />
    {message && <Notice tone={status ? "info" : "danger"}>{message}</Notice>}
    {status && !status.enabled && <Notice tone="info">Интеграция Saby не настроена. Сопоставления появятся после подключения.</Notice>}
    {status?.enabled && <div className="metric-grid compact secondary-metrics">
      <Metric title="Точка Saby" value={status.pointId ?? "—"} detail="единственная торговая точка" />
      <Metric title="Сигналы" value={status.pendingSignals ?? 0} detail="ожидают синхронизации" />
      <Metric title="Последняя сверка" value={status.state?.lastSuccessAt ? new Date(status.state.lastSuccessAt).toLocaleString("ru-RU") : "—"} detail={status.state?.lastErrorCode || "без ошибки"} />
    </div>}
    <Panel className="primary-panel" title="Номенклатура Saby" description="UUID Saby связывается ровно с одним товаром Dvorik. Название товара не перезаписывается.">
      <DataTable rows={mappings} empty="Позиции появятся после первой продажи Saby" columns={[
        { key: "external", header: "Saby", render: (item) => <><strong>{item.name || item.nomenclatureUuid}</strong><small>{[item.article, item.barcode].filter(Boolean).join(" · ") || item.nomenclatureUuid}</small></> },
        { key: "count", header: "Продажи", render: (item) => item.occurrences },
        { key: "mapping", header: "Товар Dvorik", render: (item) => <Field label="Сопоставление"><select aria-label={`Товар для ${item.name || item.nomenclatureUuid}`} value={selection[item.nomenclatureUuid] ?? ""} onChange={(event) => setSelection((current) => ({ ...current, [item.nomenclatureUuid]: event.target.value }))}><option value="">Не сопоставлен</option>{products.map((product) => <option key={product.id} value={product.id}>{product.localName || product.officialName}</option>)}</select></Field> },
        { key: "action", header: "", render: (item) => <button onClick={() => save(item)} disabled={!selection[item.nomenclatureUuid] || selection[item.nomenclatureUuid] === item.productId}>Сохранить</button> }
      ]} />
    </Panel>
  </section>;
}

function warehouseProduct(product: WarehouseCatalogProduct): Product {
  return {
    id: product.id,
    officialName: product.officialName,
    localName: product.localName,
    unit: product.unit || (product.inventoryKind === "weight" ? "кг" : "шт"),
    photoUrl: "",
    category: "Складская номенклатура",
    tags: [],
    status: product.status,
    identifiers: [],
    lowStockThreshold: product.inventoryKind === "weight" ? 1 : 3,
    inventoryKind: product.inventoryKind,
    packageMassGrams: product.packageMassGrams,
    article: product.article
  };
}

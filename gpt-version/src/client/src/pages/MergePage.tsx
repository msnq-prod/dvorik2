import { useEffect, useMemo, useState } from "react";
import type { Product, ProductMerge } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { mergeStatusLabels, productStatusLabels } from "../constants";
import { DataTable, Field, Notice, PageHeader, Panel, Skeleton, StatusBadge, Toolbar, formatDateTime, useConfirm } from "../ui";

type CandidateGroup = { key: string; score: number; explanation: string; productIds: string[] };
type FieldResolution = NonNullable<ProductMerge["resolution"]>;
const resolutionFields: Array<keyof FieldResolution> = ["officialName", "localName", "unit", "photoUrl", "category", "tags", "lowStockThreshold"];

export function MergePage({ client, session }: PageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceProductId, setSourceProductId] = useState("p-2");
  const [targetProductId, setTargetProductId] = useState("p-1");
  const [merge, setMerge] = useState<ProductMerge | null>(null);
  const [merges, setMerges] = useState<ProductMerge[]>([]);
  const [candidates, setCandidates] = useState<CandidateGroup[]>([]);
  const [resolution, setResolution] = useState<FieldResolution>({});
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const canMerge = session.permissions.includes("merge:write");
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextProducts, nextMerges, nextCandidates] = await Promise.all([
        client.request<{ items: Product[] }>("/api/products?status=all&limit=100"),
        client.request<ProductMerge[]>("/api/merges"),
        client.request<CandidateGroup[]>("/api/merges/candidates")
      ]);
      setProducts(nextProducts.items);
      setMerges(nextMerges);
      setCandidates(nextCandidates);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  const filteredProducts = useMemo(() => {
    const query = q.toLowerCase();
    return products.filter((product) => !query || [product.localName, product.officialName, product.identifiers.map((item) => item.value).join(" ")].join(" ").toLowerCase().includes(query));
  }, [products, q]);

  const preview = async () => {
    setWorking(true);
    setMessage("");
    try {
      const data = await client.request<ProductMerge>("/api/merges/preview", { method: "POST", body: JSON.stringify({ sourceProductId, targetProductId, resolution }) });
      setMerge(data);
      setMerges((items) => [data, ...items.filter((item) => item.id !== data.id)]);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const commit = async () => {
    if (!merge) return;
    const confirmed = await confirm({
      title: "Объединить товары?",
      description: "Исходный товар будет помечен как удаленный, остатки и операции перейдут к итоговому товару.",
      confirmLabel: "Объединить",
      tone: "danger"
    });
    if (!confirmed) return;
    setWorking(true);
    setMessage("");
    try {
      const data = await client.request<ProductMerge>(`/api/merges/${merge.id}/commit`, { method: "POST" });
      setMerge(data);
      setMerges((items) => items.map((item) => item.id === data.id ? data : item));
      setMessage("Дубли объединены");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const undo = async (item: ProductMerge) => {
    const confirmed = await confirm({
      title: "Откатить объединение?",
      description: `Операция ${item.id} будет отменена.`,
      confirmLabel: "Откатить",
      tone: "warn"
    });
    if (!confirmed) return;
    setWorking(true);
    setMessage("");
    try {
      const data = await client.request<ProductMerge>(`/api/merges/${item.id}/undo`, { method: "POST" });
      setMerge(data);
      setMerges((items) => items.map((candidate) => candidate.id === data.id ? data : candidate));
      setMessage("Объединение отменено");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Skeleton />;

  return (
    <>
      <section className="stack">
      <PageHeader title="Дубли" description="Проверка, применение и откат объединения товаров." actions={<button onClick={load}>Обновить</button>} />
      {message && <Notice tone={message.includes("объедин") || message.includes("отмен") ? "good" : "danger"}>{message}</Notice>}

      <div className="split">
        <Panel title="Пара товаров" description={canMerge ? "Источник будет удален, итоговый товар останется." : "Нет права на объединение."}>
          {canMerge && (
            <>
              <Toolbar><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Фильтр товаров" /></Toolbar>
              <Field label="Источник">
                <select value={sourceProductId} onChange={(event) => setSourceProductId(event.target.value)}>
                  {filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.localName} · {product.identifiers[0]?.value || product.id}</option>)}
                </select>
              </Field>
              <Field label="Итоговый товар">
                <select value={targetProductId} onChange={(event) => setTargetProductId(event.target.value)}>
                  {filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.localName} · {product.identifiers[0]?.value || product.id}</option>)}
                </select>
              </Field>
              <div className="stack">
                <strong>Какие значения оставить</strong>
                {resolutionFields.map((field) => <Field key={field} label={field}>
                  <select value={resolution[field] || "target"} onChange={(event) => setResolution((current) => ({ ...current, [field]: event.target.value as "source" | "target" }))}>
                    <option value="target">Итоговый товар</option>
                    <option value="source">Источник</option>
                  </select>
                </Field>)}
              </div>
              <div className="inline-actions">
                <button onClick={preview} disabled={working || sourceProductId === targetProductId}>Проверить последствия</button>
                <button className="secondary" disabled={working || !merge || merge.status !== "previewed"} onClick={commit}>Объединить</button>
              </div>
            </>
          )}
        </Panel>

        <Panel title="Последствия объединения">
          {merge ? (
            <div className="stack">
              <div className="compare-grid">
                <ProductSummary title="Источник: будет удален" product={merge.snapshot.source} danger />
                <ProductSummary title="Итоговый: останется" product={merge.snapshot.target} />
              </div>
              <DataTable
                rows={merge.snapshot.balances}
                empty="Остатков исходного товара нет"
                columns={[
                  { key: "product", header: "Товар", render: (row) => row.productId },
                  { key: "location", header: "Локация", render: (row) => row.locationId },
                  { key: "qty", header: "Остаток", render: (row) => row.quantity }
                ]}
              />
              <Notice>Будет перепривязано операций: {merge.snapshot.operations?.length || 0}</Notice>
            </div>
          ) : (
            <Notice>Выберите пару и проверьте последствия.</Notice>
          )}
        </Panel>
      </div>

      <Panel title="Группы кандидатов" description="Сгруппированы по нормализованному названию.">
        <DataTable
          rows={candidates}
          empty="Кандидатов не найдено"
          columns={[
            { key: "name", header: "Группа", render: (row) => row.key },
            { key: "reason", header: "Причина", render: (row) => row.explanation },
            { key: "products", header: "Товары", render: (row) => row.productIds.map((id) => productName(id, products)).join(" · ") },
            { key: "action", header: "Действие", render: (row) => <button className="secondary small" disabled={row.productIds.length < 2} onClick={() => { setSourceProductId(row.productIds[1] || ""); setTargetProductId(row.productIds[0] || ""); }}>Выбрать пару</button> }
          ]}
        />
      </Panel>

      <Panel title="История объединений">
        <DataTable
          rows={merges}
          empty="Объединений нет"
          columns={[
            { key: "date", header: "Создано", render: (row) => formatDateTime(row.createdAt) },
            { key: "status", header: "Статус", render: (row) => <StatusBadge tone={row.status === "committed" ? "good" : row.status === "reverted" ? "neutral" : "info"}>{mergeStatusLabels[row.status]}</StatusBadge> },
            { key: "source", header: "Источник", render: (row) => productName(row.sourceProductId, products) },
            { key: "target", header: "Цель", render: (row) => productName(row.targetProductId, products) },
            { key: "committed", header: "Применено", render: (row) => formatDateTime(row.committedAt) },
            { key: "actions", header: "Действия", render: (row) => row.status === "committed" ? <button className="secondary small" disabled={working} onClick={() => undo(row)}>Откатить</button> : "—" }
          ]}
        />
      </Panel>
      </section>
      {confirmDialog}
    </>
  );
}

function ProductSummary({ title, product, danger }: { title: string; product: Product; danger?: boolean }) {
  return (
    <div className={`mini-card ${danger ? "danger" : ""}`}>
      <small>{title}</small>
      <strong>{product.localName}</strong>
      <span>{product.officialName}</span>
      <StatusBadge tone={product.status === "active" ? "good" : "danger"}>{productStatusLabels[product.status]}</StatusBadge>
    </div>
  );
}

function productName(id: string, products: Product[]) {
  return products.find((product) => product.id === id)?.localName || id;
}

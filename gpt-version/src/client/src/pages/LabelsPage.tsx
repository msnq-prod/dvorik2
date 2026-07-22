import { useEffect, useMemo, useState } from "react";
import type { Product } from "../../../shared/types";
import { downloadPdf } from "../api";
import type { PageProps } from "../appTypes";
import { DataTable, Field, Metric, Notice, PageHeader, Panel, Skeleton, Toolbar, formatDateTime, toSearchText } from "../ui";

type LabelPreview = {
  geometry: { widthMm: number; heightMm: number; labelsPerPage: number; perRow: number; rows: number };
  overflow: boolean;
  labels: Array<{ productId: string; title: string; sku: string; unit: Product["unit"]; quantity: number; printedAt: string; barcode: { type: string; value: string; pattern: string } }>;
};

type LabelJob = {
  id: string;
  templateId: string;
  geometry: LabelPreview["geometry"];
  labels: LabelPreview["labels"];
  createdAt: string;
};

export function LabelsPage({ client, session }: PageProps) {
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<string[]>(["p-1", "p-2"]);
  const [quantities, setQuantities] = useState<Record<string, number>>({ "p-1": 1, "p-2": 1 });
  const [geometry, setGeometry] = useState({ widthMm: 58, heightMm: 40, templateId: "a4-basic" });
  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [jobs, setJobs] = useState<LabelJob[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const isSeller = session.user.role === "seller";
  const canPrint = session.permissions.includes("labels:print");

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextProducts, nextJobs] = await Promise.all([
        client.request<{ items: Product[] }>("/api/products?status=all&limit=100"),
        isSeller ? Promise.resolve([]) : client.request<LabelJob[]>("/api/labels/jobs").catch(() => [])
      ]);
      setProducts(nextProducts.items);
      setJobs(nextJobs);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  const labelPayload = () => ({
    ...geometry,
    items: selected.map((productId) => ({ productId, quantity: quantities[productId] || 1 }))
  });

  const build = async () => {
    setWorking(true);
    setMessage("");
    try {
      const data = await client.request<LabelPreview>("/api/labels/preview", { method: "POST", body: JSON.stringify(labelPayload()) });
      setPreview(data);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const download = async () => {
    setWorking(true);
    setMessage("");
    try {
      await downloadPdf("/api/labels/pdf", labelPayload(), "dvorik-labels.pdf");
      setMessage("PDF сформирован");
      setJobs(await client.request<LabelJob[]>("/api/labels/jobs"));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const reprint = async (id: string) => {
    setWorking(true);
    setMessage("");
    try {
      await downloadPdf(`/api/labels/jobs/${id}/pdf`, {}, "dvorik-labels-reprint.pdf");
      setMessage("Повторный PDF сформирован");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const query = q.toLowerCase();
    return products.filter((product) => !query || toSearchText([product.localName, product.officialName, product.category, product.identifiers.map((item) => item.value).join(" ")]).includes(query));
  }, [products, q]);

  const totalLabels = selected.reduce((sum, productId) => sum + (quantities[productId] || 1), 0);

  if (loading) return <Skeleton />;

  if (isSeller) {
    return (
      <section className="stack seller-page labels-page">
        {message && <Notice tone={message.includes("PDF") ? "good" : "danger"}>{message}</Notice>}

        <Panel title="Товары">
          <Toolbar className="seller-toolbar">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Товар, артикул, штрихкод" />
            <button className="secondary" onClick={() => setSelected(filteredProducts.map((product) => product.id))}>Выбрать найденные</button>
            <button className="secondary" onClick={() => setSelected([])}>Снять</button>
          </Toolbar>
          <div className="label-product-list">
            {filteredProducts.map((product) => {
              const checked = selected.includes(product.id);
              return (
                <article className={`label-product-card ${checked ? "active" : ""}`} key={product.id}>
                  <label>
                    <input type="checkbox" checked={checked} onChange={(event) => setSelected(event.target.checked ? [...selected, product.id] : selected.filter((id) => id !== product.id))} />
                    <span>
                      <strong>{product.localName}</strong>
                      <small>{product.identifiers.map((item) => item.value).join(" · ") || "—"}</small>
                    </span>
                  </label>
                  <input type="number" min="1" max="99" value={quantities[product.id] || 1} disabled={!checked} onChange={(event) => setQuantities({ ...quantities, [product.id]: Number(event.target.value) })} />
                </article>
              );
            })}
          </div>
        </Panel>

        <Panel title="Формат" className="label-format-panel">
          <div className="form-grid">
            <Field label="Шаблон">
              <select value={geometry.templateId} onChange={(event) => setGeometry({ ...geometry, templateId: event.target.value })}>
                <option value="a4-basic">A4 базовый</option>
                <option value="a4-sku">A4 SKU</option>
              </select>
            </Field>
            <Field label="Ширина, мм">
              <input type="number" value={geometry.widthMm} onChange={(event) => setGeometry({ ...geometry, widthMm: Number(event.target.value) })} />
            </Field>
            <Field label="Высота, мм">
              <input type="number" value={geometry.heightMm} onChange={(event) => setGeometry({ ...geometry, heightMm: Number(event.target.value) })} />
            </Field>
          </div>
          <div className="inline-actions seller-actions">
            <button onClick={build} disabled={!canPrint || working || !selected.length}>{working ? "Расчет..." : "Предпросмотр"}</button>
            <button className="secondary" disabled={!canPrint || working || !preview || preview.overflow || !selected.length} onClick={download}>Скачать PDF</button>
          </div>
          {preview?.overflow && <Notice tone="danger">Этикетки не помещаются на одну страницу.</Notice>}
        </Panel>

        <Panel title="Предпросмотр" className="print-area">
          {preview ? (
            <div className="label-sheet" style={{ gridTemplateColumns: `repeat(${preview.geometry.perRow}, 1fr)` }}>
              {preview.labels.map((label, index) => (
                <div className="label" key={`${label.productId}:${index}`}>
                  <strong>{label.title}</strong>
                  <BarcodePreview barcode={label.barcode} />
                  <small>{label.printedAt}</small>
                </div>
              ))}
            </div>
          ) : (
            <Notice>Сформируйте предпросмотр.</Notice>
          )}
        </Panel>
      </section>
    );
  }

  return (
    <section className="stack admin-page labels-page">
      <PageHeader
        title="Маркировки"
        description="Выбор товаров, проверка раскладки и PDF для печати."
        actions={<button disabled={!canPrint || working || !preview || preview.overflow || !selected.length} onClick={download}>Скачать PDF</button>}
      />
      {message && <Notice tone={message.includes("PDF") ? "good" : "danger"}>{message}</Notice>}

      <div className="metric-grid compact secondary-metrics">
        <Metric title="Выбрано товаров" value={selected.length} />
        <Metric title="Этикеток" value={totalLabels} />
        <Metric title="На странице" value={preview?.geometry.labelsPerPage || "—"} />
        <Metric title="Заданий" value={jobs.length} />
      </div>

      <div className="split wide-left primary-panel">
        <Panel title="Товары для печати">
          <Toolbar>
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск товара, артикула или штрихкода" />
            <button className="secondary" onClick={() => setSelected(filteredProducts.map((product) => product.id))}>Выбрать найденные</button>
            <button className="secondary" onClick={() => setSelected([])}>Снять</button>
          </Toolbar>
          <DataTable
            rows={filteredProducts}
            columns={[
              { key: "select", header: "", render: (row) => <input type="checkbox" checked={selected.includes(row.id)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))} /> },
              { key: "name", header: "Товар", render: (row) => row.localName },
              { key: "ids", header: "Артикул / штрихкод", render: (row) => row.identifiers.map((item) => item.value).join(" · ") || "—" },
              { key: "category", header: "Категория", render: (row) => row.category },
              { key: "qty", header: "Кол-во", render: (row) => <input className="table-input" type="number" min="1" max="99" value={quantities[row.id] || 1} disabled={!selected.includes(row.id)} onChange={(event) => setQuantities({ ...quantities, [row.id]: Number(event.target.value) })} /> }
            ]}
          />
        </Panel>

        <Panel title="Формат">
          <Field label="Шаблон">
            <select value={geometry.templateId} onChange={(event) => setGeometry({ ...geometry, templateId: event.target.value })}>
              <option value="a4-basic">A4 базовый</option>
              <option value="a4-sku">A4 SKU</option>
            </select>
          </Field>
          <Field label="Ширина, мм">
            <input type="number" value={geometry.widthMm} onChange={(event) => setGeometry({ ...geometry, widthMm: Number(event.target.value) })} />
          </Field>
          <Field label="Высота, мм">
            <input type="number" value={geometry.heightMm} onChange={(event) => setGeometry({ ...geometry, heightMm: Number(event.target.value) })} />
          </Field>
          <button onClick={build} disabled={!canPrint || working || !selected.length}>{working ? "Расчет..." : "Обновить предпросмотр"}</button>
          {preview?.overflow && <Notice tone="danger">Этикетки не помещаются на одну страницу. Уменьшите количество или размер.</Notice>}
        </Panel>
      </div>

      <Panel title="Предпросмотр A4" className="print-area">
        {preview ? (
          <>
            <p>{preview.geometry.perRow} в ряд, {preview.geometry.rows} рядов, {preview.geometry.labelsPerPage} на странице.</p>
            <div className="label-sheet" style={{ gridTemplateColumns: `repeat(${preview.geometry.perRow}, 1fr)` }}>
              {preview.labels.map((label, index) => (
                <div className="label" key={`${label.productId}:${index}`}>
                  <strong>{label.title}</strong>
                  <BarcodePreview barcode={label.barcode} />
                  <small>{label.printedAt}</small>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Notice>Сначала сформируйте предпросмотр.</Notice>
        )}
      </Panel>

      <Panel title="Журнал печати">
        <DataTable
          rows={jobs}
          empty="Заданий печати нет"
          columns={[
            { key: "date", header: "Создано", render: (row) => formatDateTime(row.createdAt) },
            { key: "template", header: "Шаблон", render: (row) => row.templateId },
            { key: "size", header: "Размер", render: (row) => `${row.geometry.widthMm}x${row.geometry.heightMm} мм` },
            { key: "labels", header: "Этикеток", render: (row) => row.labels.reduce((sum, label) => sum + label.quantity, 0) },
            { key: "actions", header: "Действия", render: (row) => <button className="secondary small" onClick={() => reprint(row.id)} disabled={working}>Повторить PDF</button> }
          ]}
        />
      </Panel>
    </section>
  );
}

function BarcodePreview({ barcode }: { barcode?: { type: string; value: string; pattern: string } }) {
  if (!barcode) return null;
  return (
    <div>
      <div className="barcode-preview" aria-label={`${barcode.type} ${barcode.value}`}>
        {[...barcode.pattern].map((bit, index) => <span key={index} className={bit === "1" ? "bar" : ""} />)}
      </div>
      <small>{barcode.type.toUpperCase()}: {barcode.value}</small>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { LabelPrintJob } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { renderLabelPreviewPages, saveLabelPdf, type LabelPreviewPage } from "../label-document";
import { Field, Notice, Panel, Skeleton, Toolbar, toSearchText } from "../ui";

type LabelPreview = Pick<LabelPrintJob, "templateId" | "geometry" | "labels"> & {
  geometry: { widthMm: number; heightMm: number; labelsPerPage: number; perRow: number; rows: number };
  overflow: boolean;
};

type LabelPreviewResponse = LabelPreview & {
  items: LabelPrintJob["labels"];
};

type LabelJob = LabelPrintJob;
type LabelCatalogProduct = {
  id: string;
  officialName: string;
  localName: string;
  manufacturer: string;
};

export function LabelsPage({ client, session }: PageProps) {
  const [products, setProducts] = useState<LabelCatalogProduct[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [geometry, setGeometry] = useState({ widthMm: 58, heightMm: 40, templateId: "a4-basic" });
  const [preview, setPreview] = useState<LabelPreview | null>(null);
  const [previewPages, setPreviewPages] = useState<LabelPreviewPage[]>([]);
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
      const nextProducts = await client.request<{ items: LabelCatalogProduct[] }>("/api/labels/products");
      setProducts(nextProducts.items);
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
      const data = await client.request<LabelPreviewResponse>("/api/labels/preview", { method: "POST", body: JSON.stringify(labelPayload()) });
      const document = { ...data, labels: data.items };
      setPreview(document);
      setPreviewPages(await renderLabelPreviewPages(document));
    } catch (err) {
      setPreviewPages([]);
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const download = async () => {
    setWorking(true);
    setMessage("");
    try {
      const job = await client.request<LabelJob>("/api/labels/jobs", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(labelPayload())
      });
      await saveLabelPdf(job, "dvorik-labels.pdf");
      setMessage("PDF сформирован");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const filteredProducts = useMemo(() => {
    const query = q.toLowerCase();
    return products.filter((product) => !query || toSearchText([product.localName, product.officialName, product.manufacturer]).includes(query));
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
                      <small>{product.manufacturer}</small>
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
            <button className="secondary" disabled={!canPrint || working || !preview || !selected.length} onClick={download}>Скачать PDF</button>
          </div>
        </Panel>

        <Panel title="Предпросмотр" className="print-area">
          {previewPages.length ? (
            <LabelDocumentPreview pages={previewPages} />
          ) : (
            <Notice>{working ? "Готовим достоверное превью PDF..." : "Сформируйте предпросмотр."}</Notice>
          )}
        </Panel>
      </section>
    );
  }

  return (
    <section className="labels-page labels-workspace">
      {message && <Notice tone={message.includes("PDF") ? "good" : "danger"}>{message}</Notice>}

      <div className="labels-layout">
        <Panel
          title="Товары для печати"
          className="label-products-panel"
          actions={<span className="label-selection-count">{selected.length} выбрано · {totalLabels} шт.</span>}
        >
          <Toolbar className="labels-toolbar">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск товара или штрихкода" />
            <button className="secondary" onClick={() => setSelected(filteredProducts.map((product) => product.id))}>Выбрать найденные</button>
            <button className="secondary" onClick={() => setSelected([])}>Снять</button>
          </Toolbar>
          <div className="label-product-grid">
            {filteredProducts.map((product) => {
              const checked = selected.includes(product.id);
              return (
                <article className={`label-product-tile ${checked ? "active" : ""}`} key={product.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => setSelected(event.target.checked ? [...selected, product.id] : selected.filter((id) => id !== product.id))}
                    />
                    <span className="label-product-copy">
                      <strong>{product.localName}</strong>
                      <small>{product.manufacturer}</small>
                    </span>
                  </label>
                  <div className="label-quantity">
                    <span>Кол-во</span>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={quantities[product.id] || 1}
                      disabled={!checked}
                      onChange={(event) => setQuantities({ ...quantities, [product.id]: Number(event.target.value) })}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>

        <aside className="label-preview-column">
          <Panel
            title="Предпросмотр"
            className="print-area label-preview-panel"
            actions={<button disabled={!canPrint || working || !preview || !selected.length} onClick={download}>Скачать PDF</button>}
          >
            <div className="label-size-controls">
              <Field label="Ширина, мм">
                <input type="number" min="20" max="210" value={geometry.widthMm} onChange={(event) => setGeometry({ ...geometry, widthMm: Number(event.target.value) })} />
              </Field>
              <Field label="Высота, мм">
                <input type="number" min="15" max="297" value={geometry.heightMm} onChange={(event) => setGeometry({ ...geometry, heightMm: Number(event.target.value) })} />
              </Field>
              <button onClick={build} disabled={!canPrint || working || !selected.length}>{working ? "Обновляем..." : "Обновить"}</button>
            </div>
            {preview && previewPages.length ? (
              <>
                <p className="label-preview-meta">{preview.geometry.labelsPerPage} на странице · {previewPages.length} стр.</p>
                <LabelDocumentPreview pages={previewPages} />
              </>
            ) : (
              <Notice>{working ? "Готовим предпросмотр..." : "Выберите товары и обновите предпросмотр."}</Notice>
            )}
          </Panel>
        </aside>
      </div>
    </section>
  );
}

function LabelDocumentPreview({ pages }: { pages: LabelPreviewPage[] }) {
  return (
    <div className="label-document-pages">
      {pages.map((page) => (
        <div className="label-document-page" key={page.id}>
          <img
            src={page.dataUrl}
            width={page.width}
            height={page.height}
            alt={`PDF-превью страницы ${page.pageNumber}`}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}

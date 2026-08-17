import { useEffect, useState } from "react";
import type { Location, SupplyImport } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { importStatusLabels } from "../constants";
import { DataTable, Field, Metric, Notice, PageHeader, Panel, Skeleton, StatusBadge, Toolbar, formatDateTime, useConfirm } from "../ui";

export function ImportsPage({ client, session }: PageProps) {
  const [fileName, setFileName] = useState("manual.csv");
  const [content, setContent] = useState("name,sku,quantity,unit,category\nНовый товар,IMP-1,5,шт,Импорт");
  const [locationId, setLocationId] = useState("loc-main");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [locations, setLocations] = useState<Location[]>([]);
  const [draft, setDraft] = useState<SupplyImport | null>(null);
  const [imports, setImports] = useState<SupplyImport[]>([]);
  const [showImportForm, setShowImportForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [warehouseMode, setWarehouseMode] = useState(false);
  const canImport = session.permissions.includes("imports:write");
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const capabilities = await client.request<{ warehouseWriteMode: "legacy" | "fifo" }>("/api/runtime/capabilities");
      if (capabilities.warehouseWriteMode === "fifo") { setWarehouseMode(true); return; }
      const [nextLocations, nextImports] = await Promise.all([
        client.request<Location[]>("/api/locations"),
        client.request<SupplyImport[]>("/api/imports")
      ]);
      setLocations(nextLocations);
      setImports(nextImports);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    if (/\.xlsx?$/.test(file.name.toLowerCase())) {
      const dataUrl = await readAsDataUrl(file);
      setContent(String(dataUrl).split(",")[1] || "");
    } else {
      setContent(await file.text());
    }
  };

  const preview = async () => {
    setWorking(true);
    setMessage("");
    try {
      const data = await client.request<SupplyImport>("/api/imports/preview", { method: "POST", body: JSON.stringify({ fileName, content, supplierName, invoiceNumber }) });
      setDraft(data);
      setImports((items) => [data, ...items.filter((item) => item.id !== data.id)]);
      setShowImportForm(false);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const commit = async () => {
    if (!draft) return;
    setWorking(true);
    setMessage("");
    try {
      const data = await client.request<SupplyImport>(`/api/imports/${draft.id}/commit`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ locationId })
      });
      setDraft(data);
      setImports((items) => items.map((item) => item.id === data.id ? data : item));
      setMessage(`Импорт применен: ${data.result?.createdProducts || 0} товаров`);
      setShowImportForm(false);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const undo = async (item: SupplyImport) => {
    const confirmed = await confirm({
      title: "Откатить импорт?",
      description: `Поставка "${item.fileName}" будет отменена.`,
      confirmLabel: "Откатить",
      tone: "warn"
    });
    if (!confirmed) return;
    setWorking(true);
    setMessage("");
    try {
      const data = await client.request<SupplyImport>(`/api/imports/${item.id}/undo`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() }
      });
      setImports((items) => items.map((candidate) => candidate.id === data.id ? data : candidate));
      setMessage("Импорт отменен");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Skeleton />;
  if (warehouseMode) return <section className="stack"><PageHeader title="Импорт" description="Недоступен в FIFO-режиме." /><Notice>Используйте «Склад → Принять поставку». Legacy-импорт не может менять Warehouse.</Notice></section>;

  return (
    <>
      <section className="stack">
      <PageHeader
        title="Импорт"
        description="Проверка, применение и откат поставок из CSV/XLS/XLSX."
        actions={(
          <>
            <button className="secondary" onClick={load} disabled={loading}>Обновить</button>
            {canImport && <button onClick={() => setShowImportForm(true)}>Новый импорт</button>}
          </>
        )}
      />
      {message && <Notice tone={message.includes("примен") || message.includes("отмен") ? "good" : "danger"}>{message}</Notice>}

      <div className="metric-grid compact">
        <Metric title="Проверок" value={imports.filter((item) => item.status === "previewed").length} />
        <Metric title="Применено" value={imports.filter((item) => item.status === "committed").length} />
        <Metric title="Отменено" value={imports.filter((item) => item.status === "reverted").length} />
        <Metric title="Всего" value={imports.length} />
      </div>

      <div className={showImportForm ? "split" : "stack"}>
        {showImportForm && (
        <Panel title="Новый импорт" description={canImport ? "Загрузите файл или используйте ручной ввод." : "Нет права на импорт."} actions={<button className="secondary small" onClick={() => setShowImportForm(false)}>Скрыть</button>}>
          {canImport && (
            <>
              <Field label="Файл">
                <input type="file" accept=".csv,.xls,.xlsx,text/csv" onChange={(event) => void onFile(event.target.files?.[0])} />
              </Field>
              <Field label="Имя файла">
                <input value={fileName} onChange={(event) => setFileName(event.target.value)} />
              </Field>
              <Field label="Поставщик">
                <input value={supplierName} onChange={(event) => setSupplierName(event.target.value)} placeholder="Необязательно" />
              </Field>
              <Field label="Накладная">
                <input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="Необязательно" />
              </Field>
              <Field label="Содержимое CSV или XLS/XLSX">
                <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={8} />
              </Field>
              <button onClick={preview} disabled={working || !content.trim()}>{working ? "Проверка..." : "Проверить файл"}</button>
            </>
          )}
        </Panel>
        )}

        <Panel title="Проверка и применение">
          {draft ? (
            <>
              <div className="detail-list">
                <div><span>Файл</span><strong>{draft.fileName}</strong></div>
                <div><span>Статус</span><strong>{importStatusLabels[draft.status]}</strong></div>
                <div><span>Строк</span><strong>{draft.rows.length}</strong></div>
                <div><span>Предупреждений</span><strong>{draft.warnings?.length || 0}</strong></div>
                <div><span>Отклонено строк</span><strong>{draft.rejectedRows?.length || 0}</strong></div>
                <div><span>Товаров будет создано</span><strong>{draft.result?.createdProducts ?? "после применения"}</strong></div>
              </div>
              {draft.columnMapping && <Notice>Распознаны колонки: {Object.entries(draft.columnMapping).map(([target, source]) => `${target} ← ${source}`).join(", ")}</Notice>}
              {!!draft.warnings?.length && <Notice tone="warn">{draft.warnings.slice(0, 5).map((item) => `Строка ${item.row}: ${item.message}`).join(" · ")}</Notice>}
              {!!draft.rejectedRows?.length && <Notice tone="danger">Не будут применены: {draft.rejectedRows.slice(0, 5).map((item) => `строка ${item.row} — ${item.message}`).join(" · ")}</Notice>}
              <Field label="Локация прихода">
                <select value={locationId} onChange={(event) => setLocationId(event.target.value)}>
                  {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
                </select>
              </Field>
              <button disabled={working || draft.status !== "previewed"} onClick={commit}>Применить импорт</button>
              <DataTable
                rows={draft.rows.slice(0, 10)}
                empty="Строки не распознаны"
                columns={Object.keys(draft.rows[0] || {}).map((key) => ({ key, header: key, render: (row: Record<string, string>) => row[key] || "" }))}
              />
            </>
          ) : (
            <Notice>Сначала проверьте файл.</Notice>
          )}
        </Panel>
      </div>

      <Panel title="История импортов">
        <Toolbar>
          <span className="toolbar-caption">Последние операции импорта</span>
        </Toolbar>
        <DataTable
          rows={imports}
          empty="Истории импортов нет"
          columns={[
            { key: "date", header: "Создан", render: (row) => formatDateTime(row.createdAt) },
            { key: "file", header: "Файл", render: (row) => row.fileName },
            { key: "status", header: "Статус", render: (row) => <StatusBadge tone={row.status === "committed" ? "good" : row.status === "reverted" ? "neutral" : "info"}>{importStatusLabels[row.status]}</StatusBadge> },
            { key: "rows", header: "Строк", render: (row) => row.rows.length },
            { key: "rejected", header: "Отклонено", render: (row) => row.rejectedRows?.length || "—" },
            { key: "products", header: "Товаров", render: (row) => row.result?.createdProducts || "—" },
            { key: "receipts", header: "Приходов", render: (row) => row.result?.receipts || "—" },
            { key: "actions", header: "Действия", render: (row) => row.status === "committed" ? <button className="secondary small" onClick={() => undo(row)} disabled={working}>Откатить</button> : "—" }
          ]}
        />
      </Panel>
      </section>
      {confirmDialog}
    </>
  );
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

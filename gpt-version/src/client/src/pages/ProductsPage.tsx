import { useEffect, useMemo, useState } from "react";
import { ImagePlus, Search } from "lucide-react";
import type { Location, Manufacturer, Product, ProductGroup, ProductPackaging, ProductPriceHistory, ProductStatus, StockBalance } from "../../../shared/types";
import type { ProductProfitability } from "../../../contracts/cash";
import { MEDIA_UPLOAD_ALLOWED_TYPES, MEDIA_UPLOAD_MAX_LABEL, mediaUploadValidation } from "../../../shared/mediaUpload";
import type { PageProps } from "../appTypes";
import { productStatusLabels } from "../constants";
import { formatIdentifiers, formatProductKind, formatProductQuantity } from "../presentation";
import { ActionMenu, Drawer, Field, Notice, Panel, Skeleton, StatusBadge, Toolbar, toSearchText, useConfirm } from "../ui";

type ProductResponse = { items: Product[]; total: number; page: number; limit: number };
type RuntimeCapabilities = { warehouseWriteMode: "legacy" | "fifo" };
type WarehouseCatalogProduct = { id: string; officialName: string; localName: string; article: string; inventoryKind: "piece" | "weight"; packageMassGrams?: number; status: Product["status"] };
type WarehouseBalance = { productId: string; accountingQuantityMinor: number; remainingPackageMilli: number; inventoryKind: "piece" | "weight"; packageMassGrams?: number };
type MediaUploadResponse = { url: string; name: string; mimeType: string; bytes: number; originalBytes: number; compressed: boolean; storage: string };
type ProductForm = {
  officialName: string;
  localName: string;
  unit: Product["unit"];
  category: string;
  lowStockThreshold: number;
  photoUrl: string;
  sku: string;
  barcode: string;
  status: ProductStatus;
  groupId: string;
  manufacturerId: string;
  inventoryKind: "piece" | "weight";
  packageMassGrams: number | "";
  article: string;
};

const emptyForm: ProductForm = {
  officialName: "",
  localName: "",
  unit: "шт",
  category: "Без категории",
  lowStockThreshold: 5,
  photoUrl: "",
  sku: "",
  barcode: "",
  status: "active",
  groupId: "",
  manufacturerId: "",
  inventoryKind: "piece",
  packageMassGrams: "",
  article: ""
};

export function ProductsPage({ client, session }: PageProps) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | ProductStatus>("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [groups, setGroups] = useState<ProductGroup[]>([]);
  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupKind, setNewGroupKind] = useState<"piece" | "weight">("piece");
  const [newManufacturerName, setNewManufacturerName] = useState("");
  const [packagings, setPackagings] = useState<ProductPackaging[]>([]);
  const [prices, setPrices] = useState<ProductPriceHistory[]>([]);
  const [profitability, setProfitability] = useState<ProductProfitability | null>(null);
  const [lots,setLots]=useState<Array<{id:string;receivedPackageMilli:number;remainingPackageMilli:number;packageMassGrams?:number;totalCostKopecks:number;receivedAt:string}>>([]);
  const [packagingName, setPackagingName] = useState("");
  const [priceRubles, setPriceRubles] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [catalogSection, setCatalogSection] = useState<"products" | "dictionaries">("products");
  const [inventoryKind, setInventoryKind] = useState<"all" | "piece" | "weight">("all");
  const [showIdentifiers, setShowIdentifiers] = useState(false);
  const [uploadingProductId, setUploadingProductId] = useState("");
  const [failedPhotoIds, setFailedPhotoIds] = useState<Set<string>>(() => new Set());
  const [warehouseMode, setWarehouseMode] = useState(false);
  const isSeller = session.user.role === "seller";
  const canWrite = session.permissions.includes("products:write") && !warehouseMode;
  const { confirm, confirmDialog } = useConfirm();
  const limit = 20;

  const load = async (nextPage = page) => {
    setLoading(true);
    setMessage("");
    try {
      const capabilities = await client.request<RuntimeCapabilities>("/api/runtime/capabilities");
      const fifo = capabilities.warehouseWriteMode === "fifo";
      const [data, nextBalances, nextLocations, nextGroups, nextManufacturers] = fifo
        ? await Promise.all([
          client.request<WarehouseCatalogProduct[]>("/api/warehouse/catalog").then((items) => ({ items: items.map(warehouseProduct), total: items.length, page: 1, limit: items.length || limit })),
          client.request<WarehouseBalance[]>("/api/warehouse/balances").then((items) => items.map((item) => ({ productId: item.productId, locationId: "warehouse-fifo", quantity: item.inventoryKind === "weight" ? item.accountingQuantityMinor / 1000 : item.remainingPackageMilli / 1000, version: 0 }))),
          Promise.resolve<Location[]>([{ id: "warehouse-fifo", code: "FIFO", name: "FIFO-склад", type: "warehouse", status: "active" }]),
          Promise.resolve<ProductGroup[]>([]),
          Promise.resolve<Manufacturer[]>([])
        ])
        : await Promise.all([
          client.request<ProductResponse>(`/api/products?q=${isSeller ? "" : encodeURIComponent(q)}&status=${isSeller ? "active" : status}&page=${nextPage}&limit=${isSeller ? 100 : limit}`),
          isSeller ? client.request<StockBalance[]>("/api/balances") : Promise.resolve(balances),
          isSeller ? client.request<Location[]>("/api/locations") : Promise.resolve(locations),
          client.request<ProductGroup[]>("/api/product-groups"),
          client.request<Manufacturer[]>("/api/manufacturers")
        ]);
      setWarehouseMode(fifo);
      setProducts(data.items);
      setTotal(data.total);
      setPage(data.page);
      setGroups(nextGroups);
      setManufacturers(nextManufacturers);
      if (isSeller) {
        setBalances(nextBalances);
        setLocations(nextLocations);
      }
      if (selected) setSelected(data.items.find((item) => item.id === selected.id) || null);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSeller) {
      if (!products.length) void load(1);
      return;
    }
    const timer = window.setTimeout(() => void load(1), 280);
    return () => window.clearTimeout(timer);
  }, [status, q]);

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setShowForm(true);
    setForm({
      officialName: product.officialName,
      localName: product.localName,
      unit: product.unit,
      category: product.category,
      lowStockThreshold: product.lowStockThreshold,
      photoUrl: product.photoUrl,
      sku: product.identifiers.find((item) => item.type === "supplier_article")?.value || "",
      barcode: product.identifiers.find((item) => item.type === "barcode")?.value || "",
      status: product.status
      ,groupId: product.groupId || "",
      manufacturerId: product.manufacturerId || "",
      inventoryKind: product.inventoryKind || "piece",
      packageMassGrams: product.packageMassGrams || "",
      article: product.article || ""
    });
  };

  const selectProduct = async (product: Product) => {
    setSelected(product);
    const [nextPackagings, nextPrices, nextProfitability,nextLots] = await Promise.all([
      client.request<ProductPackaging[]>(`/api/products/${product.id}/packagings`),
      client.request<ProductPriceHistory[]>(`/api/product-prices?${product.groupId ? `groupId=${encodeURIComponent(product.groupId)}` : `productId=${encodeURIComponent(product.id)}`}`),
      session.permissions.includes("reports:read")
        ? client.request<ProductProfitability>(`/api/warehouse/products/${product.id}/profitability`)
        : Promise.resolve(null),
      session.permissions.includes("reports:read")
        ? client.request<typeof lots>(`/api/warehouse/lots?productId=${encodeURIComponent(product.id)}`)
        : Promise.resolve([])
    ]);
    setPackagings(nextPackagings);
    setPrices(nextPrices);
    setProfitability(nextProfitability);
    setLots(nextLots);
  };

  const addPackaging = async () => {
    if (!selected || !packagingName.trim()) return;
    try {
      await client.request(`/api/products/${selected.id}/packagings`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ name: packagingName, unitsPerPackage: 1, massGrams: selected.inventoryKind === "weight" ? selected.packageMassGrams : undefined, isPrimary: packagings.length === 0 }) });
      setPackagingName("");
      await selectProduct(selected);
      setMessage("Упаковка добавлена");
    } catch (err) { setMessage((err as Error).message); }
  };

  const addPrice = async () => {
    if (!selected || !priceRubles.trim()) return;
    const priceKopecks = Math.round(Number(priceRubles.replace(",", ".")) * 100);
    try {
      await client.request("/api/product-prices", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ ...(selected.groupId ? { groupId: selected.groupId } : { productId: selected.id }), priceKopecks, priceUnit: selected.inventoryKind === "weight" ? "kilogram" : "piece", effectiveFrom: new Date().toISOString() }) });
      setPriceRubles("");
      await selectProduct(selected);
      setMessage("Цена добавлена в историю");
    } catch (err) { setMessage((err as Error).message); }
  };

  const resetForm = () => {
    setEditingId("");
    setForm(emptyForm);
    setShowForm(false);
  };

  const startCreate = () => {
    setEditingId("");
    setForm(emptyForm);
    setShowForm(true);
  };

  const save = async () => {
    if (!canWrite) return;
    setSaving(true);
    setMessage("");
    try {
      if (editingId) {
        await client.request<Product>(`/api/products/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({ localName: form.localName, category: form.category, status: form.status, groupId: form.groupId, manufacturerId: form.manufacturerId, packageMassGrams: form.packageMassGrams, article: form.article })
        });
      } else {
        await client.request<Product>("/api/products", { method: "POST", body: JSON.stringify(form) });
      }
      resetForm();
      await load(1);
      setMessage(editingId ? "Товар обновлен" : "Товар создан");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      await client.request("/api/product-groups", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ name: newGroupName, inventoryKind: newGroupKind }) });
      setNewGroupName("");
      await load(1);
      setMessage("Группа создана");
    } catch (err) { setMessage((err as Error).message); }
  };

  const createManufacturer = async () => {
    if (!newManufacturerName.trim()) return;
    try {
      await client.request("/api/manufacturers", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ name: newManufacturerName }) });
      setNewManufacturerName("");
      await load(1);
      setMessage("Производитель создан");
    } catch (err) { setMessage((err as Error).message); }
  };

  const uploadPhoto = async (file?: File, product?: Product) => {
    if (!file) return;
    const validation = mediaUploadValidation(file.size, file.type);
    if (validation) {
      setMessage(validation);
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const base64 = await readFileAsDataUrl(file);
      const uploaded = await client.request<MediaUploadResponse>("/api/media/upload", { method: "POST", body: JSON.stringify({ mimeType: file.type, base64 }) });
      if (product) {
        setUploadingProductId(product.id);
        await client.request<Product>(`/api/products/${product.id}`, {
          method: "PATCH",
          body: JSON.stringify({ photoUrl: uploaded.url })
        });
        setFailedPhotoIds((current) => {
          const next = new Set(current);
          next.delete(product.id);
          return next;
        });
        await load(page);
        setMessage("Фотография товара сохранена");
      } else {
        setForm((current) => ({ ...current, photoUrl: uploaded.url }));
        setMessage(`Фото загружено: ${Math.round(uploaded.originalBytes / 1024)} КБ`);
      }
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setUploadingProductId("");
      setSaving(false);
    }
  };

  const updateStatus = async (product: Product, nextStatus: ProductStatus) => {
    if (!canWrite) return;
    const confirmed = await confirm({
      title: "Изменить статус товара?",
      description: `"${product.localName}" будет переведен в статус "${productStatusLabels[nextStatus]}".`,
      confirmLabel: "Изменить",
      tone: nextStatus === "deleted" ? "danger" : "warn"
    });
    if (!confirmed) return;
    setMessage("");
    try {
      await client.request<Product>(`/api/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus })
      });
      await load(page);
    } catch (err) {
      setMessage((err as Error).message);
    }
  };

  const localFiltered = products.filter((product) =>
    (inventoryKind === "all" || product.inventoryKind === inventoryKind)
    && toSearchText([product.localName, product.officialName, product.category, product.identifiers.map((item) => item.value).join(" ")]).includes(q.toLowerCase())
  );
  const sellerResults = useMemo(() => {
    const query = q.trim().toLowerCase();
    return products
      .map((product) => ({
        product,
        stock: productStockLines(product.id, balances, locations)
      }))
      .filter((item) => !query || toSearchText([item.product.localName, item.product.officialName, item.product.category, item.product.identifiers.map((identifier) => identifier.value).join(" ")]).includes(query))
      .sort((a, b) => Number(b.stock.length > 0) - Number(a.stock.length > 0) || a.product.localName.localeCompare(b.product.localName, "ru"));
  }, [balances, locations, products, q]);

  if (isSeller) {
    return (
      <section className="stack seller-page">
        {message && <Notice tone="danger">{message}</Notice>}
        <Panel>
          <Toolbar className="seller-toolbar compact-toolbar">
            <div className="search-field">
              <input aria-label="Поиск товара" value={q} onChange={(event) => setQ(event.target.value)} placeholder="Название, артикул, штрихкод" />
              {q && <button className="icon-button clear-search" type="button" onClick={() => setQ("")} aria-label="Очистить поиск">×</button>}
            </div>
          </Toolbar>
        </Panel>

        {loading ? (
          <Skeleton />
        ) : (
          <div className="product-result-list">
            {sellerResults.length ? sellerResults.map(({ product, stock }) => (
              <article className="product-result-card" key={product.id}>
                <div className="product-result-head">
                  {product.photoUrl && <img src={product.photoUrl} alt="" />}
                  <div>
                    <h2>{product.localName || product.officialName}</h2>
                    <p>{product.officialName}</p>
                    <small>{formatIdentifiers(product)}</small>
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
              </article>
            )) : <Notice>Товары не найдены.</Notice>}
          </div>
        )}
      </section>
    );
  }

  return (
    <>
      <section className="stack admin-page products-page">
      <div className="catalog-commandbar">
        <div className="section-tabs catalog-tabs" role="tablist" aria-label="Разделы каталога">
          <button className={catalogSection === "products" && inventoryKind === "all" ? "active" : "secondary"} onClick={() => { setCatalogSection("products"); setInventoryKind("all"); }}>Все товары</button>
          <button className={catalogSection === "products" && inventoryKind === "piece" ? "active" : "secondary"} onClick={() => { setCatalogSection("products"); setInventoryKind("piece"); }}>Штучные</button>
          <button className={catalogSection === "products" && inventoryKind === "weight" ? "active" : "secondary"} onClick={() => { setCatalogSection("products"); setInventoryKind("weight"); }}>Весовые</button>
          <button className={catalogSection === "dictionaries" ? "active" : "secondary"} onClick={() => setCatalogSection("dictionaries")}>Справочники</button>
        </div>
        {canWrite && <button className="catalog-create" onClick={startCreate}>Создать товар</button>}
      </div>

      {catalogSection === "dictionaries" && canWrite && (
        <Panel className="secondary-panel catalog-dictionaries" title="Группы и производители">
          <div className="form-grid">
            <Field label="Новая группа"><input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Например, Сладости" /></Field>
            <Field label="Тип группы"><select value={newGroupKind} onChange={(event) => setNewGroupKind(event.target.value as "piece" | "weight")}><option value="piece">Штучная</option><option value="weight">Весовая</option></select></Field>
            <div className="inline-actions"><button onClick={() => void createGroup()}>Добавить группу</button></div>
            <Field label="Новый производитель"><input value={newManufacturerName} onChange={(event) => setNewManufacturerName(event.target.value)} placeholder="Название" /></Field>
            <div className="inline-actions"><button onClick={() => void createManufacturer()}>Добавить производителя</button></div>
          </div>
        </Panel>
      )}

      {catalogSection === "products" && <>
        {warehouseMode && <Notice>Каталог и остатки берутся из Warehouse. Изменение карточек перенесено в отдельный контракт склада.</Notice>}
        <Toolbar className="catalog-toolbar">
          <label className="search catalog-search">
            <Search size={18} aria-hidden="true" />
            <input value={q} onChange={(event) => setQ(event.target.value)} onKeyDown={(event) => event.key === "Enter" && load(1)} placeholder="Поиск по названию, артикулу, штрихкоду" />
          </label>
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">Все статусы</option>
            <option value="active">Активные</option>
            <option value="archived">Архив</option>
            <option value="deleted">Удаленные</option>
          </select>
          <label className="identifier-toggle">
            <input type="checkbox" checked={showIdentifiers} onChange={(event) => setShowIdentifiers(event.target.checked)} />
            <span>Показать артикул и штрихкод</span>
          </label>
        </Toolbar>
        {message && <Notice tone={message.includes("создан") || message.includes("обнов") || message.includes("загруж") || message.includes("сохран") ? "good" : "danger"}>{message}</Notice>}
        {loading ? (
          <Skeleton />
        ) : (
          localFiltered.length ? <div className="catalog-card-grid">
            {localFiltered.map((product) => (
              <article className="catalog-product-card" key={product.id}>
                <div className="catalog-card-media">
                  {product.photoUrl && !failedPhotoIds.has(product.id) ? (
                    <img src={product.photoUrl} alt={product.localName || product.officialName} onError={() => setFailedPhotoIds((current) => new Set(current).add(product.id))} />
                  ) : (
                    <label className="catalog-photo-placeholder">
                      <ImagePlus size={34} aria-hidden="true" />
                      <span>{uploadingProductId === product.id ? "Загрузка..." : "Добавить фото"}</span>
                      <input type="file" accept={MEDIA_UPLOAD_ALLOWED_TYPES.join(",")} disabled={!canWrite || saving} onChange={(event) => void uploadPhoto(event.target.files?.[0], product)} />
                    </label>
                  )}
                  <ActionMenu label={`Действия с товаром ${product.localName}`} className="catalog-card-menu">
                    <button className="secondary small" onClick={() => void selectProduct(product)}>Открыть</button>
                    {canWrite && <button className="secondary small" onClick={() => startEdit(product)}>Редактировать</button>}
                    {canWrite && product.photoUrl && <label className="menu-file-action">Заменить фото<input type="file" accept={MEDIA_UPLOAD_ALLOWED_TYPES.join(",")} disabled={saving} onChange={(event) => void uploadPhoto(event.target.files?.[0], product)} /></label>}
                    {canWrite && product.status !== "archived" && <button className="danger small" onClick={() => updateStatus(product, "archived")}>В архив</button>}
                    {canWrite && product.status !== "active" && <button className="secondary small" onClick={() => updateStatus(product, "active")}>Восстановить</button>}
                  </ActionMenu>
                </div>
                <button className="catalog-card-content" onClick={() => void selectProduct(product)}>
                  <strong>{product.localName || product.officialName}</strong>
                  <span>{productCardSubtitle(product)}</span>
                  {showIdentifiers && <small className="catalog-identifiers">{identifierSummary(product)}</small>}
                  <dl>
                    <div><dt>Порог</dt><dd>{formatProductQuantity(product, product.lowStockThreshold)}</dd></div>
                    <div><dt>Статус</dt><dd><StatusBadge tone={product.status === "active" ? "good" : product.status === "deleted" ? "danger" : "neutral"}>{productStatusLabels[product.status]}</StatusBadge></dd></div>
                  </dl>
                </button>
              </article>
            ))}
          </div> : <Notice>Товары не найдены.</Notice>
        )}
        <div className="pagination">
          <button className="secondary" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>Назад</button>
          <span>Страница {page}, показано {products.length} из {total}</span>
          <button className="secondary" disabled={page * limit >= total || loading} onClick={() => load(page + 1)}>Вперед</button>
        </div>
      </>}

      <Drawer open={showForm || Boolean(selected)} onClose={() => { resetForm(); setSelected(null); }} title={showForm ? (editingId ? "Редактирование товара" : "Создание товара") : selected?.localName || "Карточка товара"}>
        {canWrite && showForm && (
          <Panel title={editingId ? "Редактирование товара" : "Создание товара"}>
            {!editingId && <Notice>Создавайте новый товар только если не нашли его поиском по названию, SKU или штрихкоду.</Notice>}
            <div className="form-grid">
              <Field label="Официальное название"><input value={form.officialName} disabled={Boolean(editingId)} onChange={(event) => setForm({ ...form, officialName: event.target.value })} /></Field>
              <Field label="Локальное название"><input value={form.localName} onChange={(event) => setForm({ ...form, localName: event.target.value })} /></Field>
              <Field label="Категория"><input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} /></Field>
              <Field label="Группа"><select value={form.groupId} onChange={(event) => { const group = groups.find((item) => item.id === event.target.value); const inventoryKind = group?.inventoryKind || form.inventoryKind; setForm({ ...form, groupId: event.target.value, inventoryKind, unit: inventoryKind === "weight" ? "кг" : "шт" }); }}><option value="">Без группы</option>{groups.filter((item) => item.status === "active" && (!editingId || item.inventoryKind === form.inventoryKind)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Производитель"><select value={form.manufacturerId} onChange={(event) => setForm({ ...form, manufacturerId: event.target.value })}><option value="">Не указан</option>{manufacturers.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label="Тип товара"><select value={form.inventoryKind} disabled={Boolean(form.groupId) || Boolean(editingId)} onChange={(event) => { const inventoryKind = event.target.value as "piece" | "weight"; setForm({ ...form, inventoryKind, unit: inventoryKind === "weight" ? "кг" : "шт" }); }}><option value="piece">Штучный</option><option value="weight">Весовой</option></select></Field>
              {form.inventoryKind === "weight" && <Field label="Масса пачки, г"><input type="number" min="1" step="1" value={form.packageMassGrams} onChange={(event) => setForm({ ...form, packageMassGrams: event.target.value ? Number(event.target.value) : "" })} /></Field>}
              <Field label="Артикул"><input value={form.article} onChange={(event) => setForm({ ...form, article: event.target.value })} /></Field>
              <Field label="Единица"><input value={form.unit} disabled /></Field>
              <Field label="Порог остатка"><input type="number" min="0" disabled={Boolean(editingId)} value={form.lowStockThreshold} onChange={(event) => setForm({ ...form, lowStockThreshold: Number(event.target.value) })} /></Field>
              <Field label="Статус"><select value={form.status} disabled={!editingId} onChange={(event) => setForm({ ...form, status: event.target.value as ProductStatus })}><option value="active">Активен</option><option value="archived">Архив</option><option value="deleted">Удален</option></select></Field>
              {!editingId && <Field label="SKU"><input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} /></Field>}
              {!editingId && <Field label="Штрихкод"><input value={form.barcode} onChange={(event) => setForm({ ...form, barcode: event.target.value })} /></Field>}
              {!editingId && <Field label={`Загрузить фото (до ${MEDIA_UPLOAD_MAX_LABEL})`}><input type="file" accept={MEDIA_UPLOAD_ALLOWED_TYPES.join(",")} disabled={saving} onChange={(event) => void uploadPhoto(event.target.files?.[0])} /><small>Временная JSON-загрузка; streaming multipart будет добавлен в MED-1101.</small></Field>}
            </div>
            <div className="inline-actions">
              <button onClick={save} disabled={saving || (!editingId && !form.officialName.trim())}>{saving ? "Сохранение..." : "Сохранить"}</button>
              <button className="secondary" onClick={resetForm}>Отмена</button>
            </div>
          </Panel>
        )}

        <Panel title="Детали товара">
          {selected ? (
            <div className="detail-list">
              {selected.photoUrl && <img className="detail-image" src={selected.photoUrl} alt="" />}
              <div><span>Название</span><strong>{selected.localName}</strong></div>
              <div><span>Официально</span><strong>{selected.officialName}</strong></div>
              <div><span>Категория</span><strong>{selected.category}</strong></div>
              <div><span>Группа</span><strong>{groups.find((item) => item.id === selected.groupId)?.name || "—"}</strong></div>
              <div><span>Производитель</span><strong>{manufacturers.find((item) => item.id === selected.manufacturerId)?.name || "—"}</strong></div>
              <div><span>Тип</span><strong>{formatProductKind(selected)}</strong></div>
              <div><span>Артикул</span><strong>{selected.article || "—"}</strong></div>
              <div><span>Порог</span><strong>{formatProductQuantity(selected, selected.lowStockThreshold)}</strong></div>
              {showIdentifiers && <div><span>Идентификаторы</span><strong>{identifierSummary(selected)}</strong></div>}
              <div><span>Упаковки</span><strong>{packagings.map((item) => `${item.name}${item.massGrams ? ` · ${item.massGrams} г` : ""}`).join("; ") || "—"}</strong></div>
              <div><span>История цен</span><strong>{prices.map((item) => `${(item.priceKopecks / 100).toFixed(2)} ₽ с ${new Date(item.effectiveFrom).toLocaleDateString("ru-RU")}`).join("; ") || "—"}</strong></div>
              {profitability && <div><span>Оценочная маржа</span><strong>{profitability.estimated.availability === "available" ? `${((profitability.estimated.marginPerPackageKopecks || 0) / 100).toFixed(2)} ₽ / упаковка` : "Недостаточно данных"}</strong></div>}
              {profitability && <div><span>Фактическая маржа</span><strong>{profitability.actual.availability === "unavailable" ? "Касса не подключена или данные неполны" : `${((profitability.actual.marginKopecks || 0) / 100).toFixed(2)} ₽`}</strong></div>}
              {session.permissions.includes("reports:read")&&<div><span>Партии FIFO</span><strong>{lots.map((lot)=>`${new Date(lot.receivedAt).toLocaleDateString("ru-RU")}: ${(lot.remainingPackageMilli/1000).toFixed(3)} из ${(lot.receivedPackageMilli/1000).toFixed(3)} уп. · ${(lot.totalCostKopecks/100).toFixed(2)} ₽`).join("; ")||"Нет партий"}</strong></div>}
              {canWrite && <div className="form-grid"><Field label="Новая упаковка"><input value={packagingName} onChange={(event) => setPackagingName(event.target.value)} /></Field><button onClick={() => void addPackaging()}>Добавить</button><Field label="Новая цена, ₽"><input inputMode="decimal" value={priceRubles} onChange={(event) => setPriceRubles(event.target.value)} /></Field><button onClick={() => void addPrice()}>Записать цену</button></div>}
            </div>
          ) : (
            <Notice>Выберите товар в таблице.</Notice>
          )}
        </Panel>
      </Drawer>
      </section>
      {confirmDialog}
    </>
  );
}

function warehouseProduct(product: WarehouseCatalogProduct): Product {
  return {
    id: product.id, officialName: product.officialName, localName: product.localName,
    unit: product.inventoryKind === "weight" ? "кг" : "шт", photoUrl: "", category: "Складская номенклатура", tags: [], status: product.status,
    identifiers: product.article ? [{ id: `article-${product.id}`, productId: product.id, type: "supplier_article", value: product.article }] : [],
    lowStockThreshold: product.inventoryKind === "weight" ? 1 : 3, inventoryKind: product.inventoryKind, packageMassGrams: product.packageMassGrams, article: product.article
  };
}

function identifierSummary(product: Product) {
  return formatIdentifiers(product, true);
}

function productCardSubtitle(product: Product) {
  const category = /весов|штучн/i.test(product.category) ? "" : product.category.trim();
  return [product.officialName, category].filter(Boolean).join(" · ");
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

function totalForProduct(productId: string, balances: StockBalance[]) {
  return balances.filter((balance) => balance.productId === productId).reduce((sum, balance) => sum + balance.quantity, 0);
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Не удалось прочитать изображение"));
    reader.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    reader.readAsDataURL(file);
  });
}

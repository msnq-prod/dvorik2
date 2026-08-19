import { useEffect, useMemo, useState } from "react";
import { Archive, Box, ChevronLeft, ChevronRight, ClipboardList, Pencil, Plus, Search, Upload, X } from "lucide-react";
import type { Shift, User } from "../../../shared/types";
import type { NavigationIntent, PageProps } from "../appTypes";
import { Field, Notice, Skeleton, useConfirm } from "../ui";

type Supplier = { id: string; name: string };
type DepletedProduct = { productId: string; productName: string; depletedAt: string };
type WarehouseProduct = { id: string; officialName: string; localName: string; article: string; groupId?: string; inventoryKind: "piece" | "weight"; packageMassGrams?: number; status: string };
type PriceCategory = { id: string; name: string; inventoryKind: "piece" | "weight"; status: "active" | "archived"; version: number; productCount: number; currentPriceKopecks?: number; effectiveFrom?: string };
type CategoryDetail = PriceCategory & {
  products: Array<{ id: string; name: string; officialName: string; article: string }>;
  prices: Array<{ id: string; priceKopecks: number; priceUnit: "piece" | "kilogram"; effectiveFrom: string; createdAt: string }>;
};
type SupplyColumn = "name" | "article" | "count" | "mass" | "total" | "unitPrice";
type SupplyPreview = { headerRow: number; headers: string[]; rows: string[][]; suggestedMapping: Partial<Record<SupplyColumn, number>>; needsMapping: boolean };
const supplyColumnLabels: Record<SupplyColumn, string> = {
  name: "Наименование", article: "Артикул", count: "Количество упаковок", mass: "Масса упаковки, г", total: "Сумма строки", unitPrice: "Цена упаковки"
};

const WEEKDAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];
const FILE_LIMIT_BYTES = 5 * 1024 * 1024;

export function DashboardPage({ client, session, onNavigate }: PageProps) {
  const [focusMonth, setFocusMonth] = useState(() => startOfMonth(new Date()));
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [depleted, setDepleted] = useState<DepletedProduct[]>([]);
  const [products, setProducts] = useState<WarehouseProduct[]>([]);
  const [categories, setCategories] = useState<PriceCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [category, setCategory] = useState<CategoryDetail | null>(null);
  const [categoryQuery, setCategoryQuery] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryKind, setNewCategoryKind] = useState<"piece" | "weight">("weight");
  const [renaming, setRenaming] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [priceRubles, setPriceRubles] = useState("");
  const [priceDate, setPriceDate] = useState(() => dateKey(new Date()));
  const [supplierId, setSupplierId] = useState("");
  const [deliveryRubles, setDeliveryRubles] = useState("");
  const [supplyFile, setSupplyFile] = useState<File | null>(null);
  const [supplyContent, setSupplyContent] = useState("");
  const [supplyPreview, setSupplyPreview] = useState<SupplyPreview | null>(null);
  const [supplyMapping, setSupplyMapping] = useState<Partial<Record<SupplyColumn, number>>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const canWriteProducts = session.permissions.includes("products:write");
  const canReceive = session.permissions.includes("stock:move");
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
      const [nextShifts, nextUsers, nextSuppliers, nextDepleted, nextProducts, nextCategories] = await Promise.all([
        client.request<Shift[]>("/api/schedule"),
        client.request<User[]>("/api/staff"),
        client.request<Supplier[]>("/api/warehouse/suppliers"),
        client.request<DepletedProduct[]>(`/api/warehouse/recently-depleted?since=${encodeURIComponent(since)}&limit=8`),
        client.request<WarehouseProduct[]>("/api/warehouse/catalog"),
        client.request<PriceCategory[]>("/api/warehouse/price-categories")
      ]);
      setShifts(nextShifts);
      setUsers(nextUsers);
      setSuppliers(nextSuppliers);
      setSupplierId((current) => current || nextSuppliers[0]?.id || "");
      setDepleted(nextDepleted);
      setProducts(nextProducts);
      setCategories(nextCategories);
      setSelectedCategoryId((current) => current && nextCategories.some((item) => item.id === current) ? current : nextCategories.find((item) => item.status === "active")?.id || nextCategories[0]?.id || "");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  useEffect(() => {
    if (!selectedCategoryId) { setCategory(null); return; }
    void client.request<CategoryDetail>(`/api/warehouse/price-categories/${encodeURIComponent(selectedCategoryId)}`)
      .then((detail) => { setCategory(detail); setCategoryName(detail.name); })
      .catch((error) => setMessage((error as Error).message));
  }, [client, selectedCategoryId]);

  const monthCells = useMemo(() => buildMonthCells(focusMonth), [focusMonth]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const shiftsByDate = useMemo(() => {
    const result = new Map<string, Shift[]>();
    for (const shift of shifts) {
      if (shift.status !== "scheduled" || shift.date.slice(0, 7) !== dateKey(focusMonth).slice(0, 7)) continue;
      result.set(shift.date, [...(result.get(shift.date) || []), shift]);
    }
    return result;
  }, [focusMonth, shifts]);
  const filteredCategories = categories.filter((item) => item.name.toLocaleLowerCase("ru-RU").includes(categoryQuery.trim().toLocaleLowerCase("ru-RU")));
  const availableProducts = products.filter((product) => product.status === "active" && product.inventoryKind === category?.inventoryKind && product.groupId !== category?.id
    && `${product.localName} ${product.officialName} ${product.article}`.toLocaleLowerCase("ru-RU").includes(productQuery.trim().toLocaleLowerCase("ru-RU"))).slice(0, 8);

  const refreshCategory = async (id = selectedCategoryId) => {
    const [nextCategories, nextCategory, nextProducts] = await Promise.all([
      client.request<PriceCategory[]>("/api/warehouse/price-categories"),
      id ? client.request<CategoryDetail>(`/api/warehouse/price-categories/${encodeURIComponent(id)}`) : Promise.resolve(null),
      client.request<WarehouseProduct[]>("/api/warehouse/catalog")
    ]);
    setCategories(nextCategories);
    setCategory(nextCategory);
    setProducts(nextProducts);
    if (nextCategory) setCategoryName(nextCategory.name);
  };

  const createCategory = async () => {
    if (!newCategoryName.trim()) return;
    setWorking(true); setMessage("");
    try {
      const created = await client.request<PriceCategory>("/api/warehouse/price-categories", { method: "POST", body: JSON.stringify({ name: newCategoryName, inventoryKind: newCategoryKind }) });
      setNewCategoryName(""); setNewCategoryOpen(false); setSelectedCategoryId(created.id); await refreshCategory(created.id);
    } catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  const renameCategory = async () => {
    if (!category || !categoryName.trim()) return;
    setWorking(true); setMessage("");
    try { await client.request(`/api/warehouse/price-categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ name: categoryName }) }); setRenaming(false); await refreshCategory(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  const archiveCategory = async () => {
    if (!category || !await confirm({ title: "Архивировать категорию?", description: "Товары и история цен сохранятся.", confirmLabel: "В архив", tone: "warn" })) return;
    setWorking(true);
    try { await client.request(`/api/warehouse/price-categories/${category.id}`, { method: "PATCH", body: JSON.stringify({ status: "archived" }) }); await refreshCategory(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  const addPrice = async () => {
    if (!category || !priceRubles.trim()) return;
    const priceKopecks = Math.round(Number(priceRubles.replace(",", ".")) * 100);
    if (!Number.isSafeInteger(priceKopecks) || priceKopecks < 0) { setMessage("Некорректная цена"); return; }
    setWorking(true);
    try {
      await client.request(`/api/warehouse/price-categories/${category.id}/prices`, { method: "POST", body: JSON.stringify({ priceKopecks, effectiveFrom: `${priceDate}T00:00:00.000Z` }) });
      setPriceRubles(""); await refreshCategory();
    } catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  const assignProduct = async (productId: string) => {
    if (!category) return;
    setWorking(true);
    try { await client.request(`/api/warehouse/price-categories/${category.id}/products`, { method: "POST", body: JSON.stringify({ productId }) }); setProductQuery(""); await refreshCategory(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  const removeProduct = async (productId: string) => {
    if (!category) return;
    setWorking(true);
    try { await client.request(`/api/warehouse/price-categories/${category.id}/products/${encodeURIComponent(productId)}`, { method: "DELETE" }); await refreshCategory(); }
    catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  const startSupplyDraft = async () => {
    if (!supplierId || !supplyFile || working) return;
    if (supplyFile.size > FILE_LIMIT_BYTES) { setMessage("Файл больше 5 МиБ"); return; }
    setWorking(true); setMessage("");
    try {
      const content = supplyContent || (supplyFile.name.toLocaleLowerCase("ru-RU").endsWith(".xlsx") ? await readFileBase64(supplyFile) : await supplyFile.text());
      if (!supplyPreview) {
        const preview = await client.request<SupplyPreview>("/api/warehouse/supply-previews", {
          method: "POST", body: JSON.stringify({ fileName: supplyFile.name, content })
        });
        setSupplyContent(content);
        setSupplyPreview(preview);
        setSupplyMapping(preview.suggestedMapping);
        return;
      }
      const draft = await client.request<{ id: string }>("/api/warehouse/supply-drafts", {
        method: "POST",
        body: JSON.stringify({ supplierId, deliveryCostKopecks: Math.round(Number(deliveryRubles.replace(",", ".") || 0) * 100), fileName: supplyFile.name, content, mapping: supplyMapping })
      });
      onNavigate?.("stock", `stock-receipt-draft:${draft.id}` as NavigationIntent);
    } catch (error) { setMessage((error as Error).message); }
    finally { setWorking(false); }
  };

  if (loading && !categories.length) return <Skeleton />;

  return (
    <>
      <section className="admin-home">
        {message ? <Notice tone="danger">{message}</Notice> : null}
        <div className="admin-home-top">
          <section className="home-calendar" aria-label="Календарь смен">
            <header><h2>{formatMonth(focusMonth)}</h2><div><button className="secondary icon-button" aria-label="Предыдущий месяц" onClick={() => setFocusMonth(moveMonth(focusMonth, -1))}><ChevronLeft size={18} /></button><button className="secondary icon-button" aria-label="Следующий месяц" onClick={() => setFocusMonth(moveMonth(focusMonth, 1))}><ChevronRight size={18} /></button></div></header>
            <div className="home-calendar-weekdays">{WEEKDAYS.map((day) => <span key={day}>{day}</span>)}</div>
            <div className="home-calendar-grid">
              {monthCells.map((cell) => {
                const names = uniqueEmployeeNames(shiftsByDate.get(cell.date) || [], usersById);
                return <button key={cell.date} className={`${cell.inMonth ? "" : "outside"} ${cell.date === dateKey(new Date()) ? "today" : ""}`} onClick={() => onNavigate?.("schedule", `schedule-date:${cell.date}`)}>
                  <strong>{cell.day}</strong>
                  <span>{names.slice(0, 2).map((name) => <small key={name}>{name}</small>)}{names.length > 2 ? <small>+{names.length - 2}</small> : null}</span>
                </button>;
              })}
            </div>
          </section>

          <aside className="admin-home-side">
            <section className="home-orders"><h2>Заказы</h2><div><ClipboardList size={34} /><strong>В разработке</strong><span>Здесь появятся заказы поставщикам.</span></div></section>
            <section className="home-depleted"><h2>Недавно закончились</h2><div className="home-depleted-list">{depleted.length ? depleted.map((item) => <button key={item.productId} onClick={() => onNavigate?.("stock", "stock-low")}><Box size={18} /><span>{item.productName}</span><time>{formatDepleted(item.depletedAt)}</time></button>) : <p>За последние 7 дней товары не заканчивались.</p>}</div><button className="home-section-link" onClick={() => onNavigate?.("stock", "stock-low")}>Все отсутствующие <ChevronRight size={16} /></button></section>
          </aside>
        </div>

        <section className="home-receipt">
          <header><h2>Приёмка партии</h2><p>Подготовьте данные для приёмки партии от поставщика.</p></header>
          <div className="home-receipt-form">
            <Field label="Поставщик"><select value={supplierId} disabled={!canReceive} onChange={(event) => setSupplierId(event.target.value)}><option value="">Выберите поставщика</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></Field>
            <Field label="Стоимость доставки, ₽"><input inputMode="decimal" value={deliveryRubles} disabled={!canReceive} placeholder="0,00" onChange={(event) => setDeliveryRubles(event.target.value)} /></Field>
            <Field label="Загрузить XLSX или CSV"><label className="home-file-input"><Upload size={18} /><span>{supplyFile?.name || "Перетащите файл сюда или выберите на компьютере"}</span><input type="file" accept=".xlsx,.csv,text/csv" disabled={!canReceive} onChange={(event) => { setSupplyFile(event.target.files?.[0] || null); setSupplyContent(""); setSupplyPreview(null); setSupplyMapping({}); }} /></label><small>Перед созданием черновика будет показан предпросмотр</small></Field>
            {supplyPreview ? <div className="supply-file-preview">
              <h3>Сопоставление колонок</h3>
              <div className="supply-mapping-grid">{(Object.keys(supplyColumnLabels) as SupplyColumn[]).map((key) => <Field key={key} label={supplyColumnLabels[key]}><select value={supplyMapping[key] ?? ""} onChange={(event) => setSupplyMapping((current) => ({ ...current, [key]: event.target.value === "" ? undefined : Number(event.target.value) }))}><option value="">Не использовать</option>{supplyPreview.headers.map((header, index) => <option value={index} key={`${key}-${index}`}>{header}</option>)}</select></Field>)}</div>
              <div className="table-responsive"><table><thead><tr>{supplyPreview.headers.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead><tbody>{supplyPreview.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>
              {supplyMapping.name === undefined && supplyMapping.article === undefined ? <Notice tone="warn">Выберите колонку с наименованием или артикулом.</Notice> : null}
            </div> : null}
            <button className="home-receipt-submit" disabled={!canReceive || !supplierId || !supplyFile || working || Boolean(supplyPreview && supplyMapping.name === undefined && supplyMapping.article === undefined)} onClick={() => void startSupplyDraft()}>{working ? "Подготовка…" : supplyPreview ? "Создать черновик приёмки" : "Проверить файл"}</button>
          </div>
        </section>

        <section className="home-pricing">
          <h2>Цены и категории</h2>
          <div className="home-pricing-layout">
            <aside className="category-master">
              <h3>Категории</h3>
              <label className="home-search"><Search size={18} /><input value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="Поиск категории" /></label>
              {canWriteProducts ? <button className="secondary category-create-button" onClick={() => setNewCategoryOpen((value) => !value)}><Plus size={17} /> Новая категория</button> : null}
              {newCategoryOpen ? <div className="category-create-form"><input value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} placeholder="Название" /><select value={newCategoryKind} onChange={(event) => setNewCategoryKind(event.target.value as "piece" | "weight")}><option value="weight">Весовая</option><option value="piece">Штучная</option></select><button disabled={working || !newCategoryName.trim()} onClick={() => void createCategory()}>Создать</button></div> : null}
              <div className="category-list">{filteredCategories.map((item) => <button key={item.id} className={item.id === selectedCategoryId ? "active" : ""} onClick={() => setSelectedCategoryId(item.id)}><span><strong>{item.name}</strong><small>{item.productCount} товаров</small></span><span>{item.currentPriceKopecks === undefined ? "—" : formatMoney(item.currentPriceKopecks)}<ChevronRight size={16} /></span></button>)}</div>
            </aside>

            <section className="category-detail">
              {category ? <>
                <header><div>{renaming ? <div className="category-rename"><input value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /><button disabled={working} onClick={() => void renameCategory()}>Сохранить</button></div> : <h3>{category.name}</h3>}</div>{canWriteProducts && category.status === "active" ? <div><button className="secondary" onClick={() => setRenaming((value) => !value)}><Pencil size={16} /> Переименовать</button><button className="secondary" onClick={() => void archiveCategory()}><Archive size={16} /> В архив</button></div> : null}</header>
                <div className="category-price-form">
                  <Field label="Тип товара"><select value={category.inventoryKind} disabled><option value="weight">Весовой</option><option value="piece">Штучный</option></select></Field>
                  <Field label={`Новая цена за ${category.inventoryKind === "weight" ? "кг" : "шт"}, ₽`}><input inputMode="decimal" value={priceRubles} disabled={!canWriteProducts || category.status !== "active"} placeholder={category.currentPriceKopecks === undefined ? "0,00" : (category.currentPriceKopecks / 100).toFixed(2).replace(".", ",")} onChange={(event) => setPriceRubles(event.target.value)} /></Field>
                  <Field label="Действует с"><input type="date" value={priceDate} disabled={!canWriteProducts || category.status !== "active"} onChange={(event) => setPriceDate(event.target.value)} /></Field>
                  <button disabled={!canWriteProducts || !priceRubles.trim() || working || category.status !== "active"} onClick={() => void addPrice()}>Записать цену</button>
                </div>
                <div className="category-lower">
                  <section><h4>История цен</h4><div className="price-history"><div><span>Действует с</span><span>Цена за {category.inventoryKind === "weight" ? "кг" : "шт"}, ₽</span></div>{category.prices.map((price) => <div key={price.id}><time>{new Date(price.effectiveFrom).toLocaleDateString("ru-RU")}</time><strong>{formatMoney(price.priceKopecks)}</strong></div>)}</div></section>
                  <section className="category-products"><header><h4>Товары категории</h4><span>{category.products.length} товаров</span></header><label className="home-search"><Search size={18} /><input value={productQuery} disabled={!canWriteProducts || category.status !== "active"} onChange={(event) => setProductQuery(event.target.value)} placeholder="Добавить товар" /></label>
                    {productQuery && availableProducts.length ? <div className="category-product-results">{availableProducts.map((product) => <button key={product.id} onClick={() => void assignProduct(product.id)}><Plus size={15} />{product.localName}</button>)}</div> : null}
                    <div className="category-product-list">{category.products.map((product) => <div key={product.id}><Box size={18} /><span>{product.name}</span>{canWriteProducts && category.status === "active" ? <button aria-label={`Удалить ${product.name} из категории`} onClick={() => void removeProduct(product.id)}><X size={16} /></button> : null}</div>)}</div>
                  </section>
                </div>
              </> : <div className="category-empty">Создайте или выберите категорию.</div>}
            </section>
          </div>
        </section>
      </section>
      {confirmDialog}
    </>
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function moveMonth(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildMonthCells(month: Date) {
  const first = startOfMonth(month);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cellCount = offset + daysInMonth <= 35 ? 35 : 42;
  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date: dateKey(date), day: date.getDate(), inMonth: date.getMonth() === month.getMonth() };
  });
}

function formatMonth(date: Date) {
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
  return title.charAt(0).toLocaleUpperCase("ru-RU") + title.slice(1);
}

function uniqueEmployeeNames(shifts: Shift[], users: Map<string, User>) {
  return [...new Set(shifts.flatMap((shift) => shift.employeeIds).map((id) => users.get(id)?.firstName || "Сотрудник"))];
}

function formatMoney(kopecks: number) {
  return `${(kopecks / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function formatDepleted(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (dateKey(date) === dateKey(today)) return `сегодня, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  if (dateKey(date) === dateKey(yesterday)) return `вчера, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function readFileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.readAsDataURL(file);
  });
}

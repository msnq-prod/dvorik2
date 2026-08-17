import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Filter, RefreshCw } from "lucide-react";
import type { InventoryBalance, Location, Product, StockBalance, StockOperation, StockOperationType } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { ApiError } from "../api";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { operationLabels, operationTone } from "../constants";
import { formatProductQuantity } from "../presentation";
import { DataTable, Drawer, Field, Notice, PageHeader, Panel, Skeleton, StatusBadge, Toolbar, formatDateTime, useConfirm } from "../ui";

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
type ScanState = "idle" | "loading" | "found" | "unknown" | "error";
type UnknownScanAction = "create" | "bind" | null;
type QuickProductForm = { name: string; inventoryKind: "piece" | "weight"; packageMassGrams: number };
type WarehouseCatalogProduct = { id: string; officialName: string; localName: string; article: string; inventoryKind: "piece" | "weight"; packageMassGrams?: number; status: string };
type SupplyReceiptLine = { id: string; sourceName: string; sourceArticle?: string; productId?: string; packageCount?: number; packageMassGrams?: number; purchaseCostKopecks?: number; complete: boolean };
type SupplyReceiptDraft = { id: string; supplierId: string; deliveryCostKopecks: number; fileName: string; status: "draft" | "accepted"; acceptedSupplyId?: string; createdAt: string; lines: SupplyReceiptLine[] };
type NewSupplyProduct = { officialName: string; article: string; inventoryKind: "piece" | "weight"; packageMassGrams: number };

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
  const [defectReason, setDefectReason] = useState("");
  const [defectComment, setDefectComment] = useState("");
  const [workBuffer, setWorkBuffer] = useState<BufferedOperation[]>(() => readWorkBuffer());
  const [bufferOpen, setBufferOpen] = useState(false);
  const [bufferApplying, setBufferApplying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scannedBarcode, setScannedBarcode] = useState("");
  const [scannedProduct, setScannedProduct] = useState<Product | null>(null);
  const [unknownScanAction, setUnknownScanAction] = useState<UnknownScanAction>(null);
  const [quickProductForm, setQuickProductForm] = useState<QuickProductForm>({ name: "", inventoryKind: "piece", packageMassGrams: 0 });
  const [receiptDraft, setReceiptDraft] = useState<SupplyReceiptDraft | null>(null);
  const [receiptLines, setReceiptLines] = useState<SupplyReceiptLine[]>([]);
  const [receiptCatalog, setReceiptCatalog] = useState<WarehouseCatalogProduct[]>([]);
  const [receiptInvoice, setReceiptInvoice] = useState("");
  const [receiptDate, setReceiptDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creatingSupplyLineId, setCreatingSupplyLineId] = useState("");
  const [newSupplyProduct, setNewSupplyProduct] = useState<NewSupplyProduct>({ officialName: "", article: "", inventoryKind: "piece", packageMassGrams: 0 });
  const [bindQuery, setBindQuery] = useState("");
  const [bindResults, setBindResults] = useState<Product[]>([]);
  const canMove = session.permissions.includes("stock:move");
  const canWriteProducts = session.permissions.includes("products:write");
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
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    const onVisibility = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisibility); };
  }, [client]);

  useEffect(() => { localStorage.setItem("stock-work-buffer", JSON.stringify(workBuffer)); }, [workBuffer]);

  useEffect(() => {
    if (unknownScanAction !== "bind" || bindQuery.trim().length < 2) {
      setBindResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client.request<{ items: Product[] }>(`/api/products?status=active&limit=20&q=${encodeURIComponent(bindQuery.trim())}`, { signal: controller.signal })
        .then((response) => setBindResults(response.items))
        .catch((error) => {
          if ((error as Error).name !== "AbortError") setMessage((error as Error).message);
        });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bindQuery, client, unknownScanAction]);

  useEffect(() => {
    const barcode = q.trim();
    if (!/^\d{6,128}$/.test(barcode) || products.some((product) => product.identifiers.some((identifier) => identifier.type === "barcode" && identifier.value === barcode))) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void client.request<Product>(`/api/products/by-barcode/${encodeURIComponent(barcode)}`, { signal: controller.signal })
        .then((product) => setProducts((current) => current.map((item) => item.id === product.id ? product : item)))
        .catch((error) => {
          if (!(error instanceof ApiError && error.code === "PRODUCT_NOT_FOUND") && (error as Error).name !== "AbortError") {
            setMessage((error as Error).message);
          }
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [client, products, q]);

  useEffect(() => {
    if (loading) return;
    if (intent?.startsWith("stock-receipt-draft:")) {
      const draftId = intent.slice("stock-receipt-draft:".length);
      void Promise.all([
        client.request<SupplyReceiptDraft>(`/api/warehouse/supply-drafts/${encodeURIComponent(draftId)}`),
        client.request<WarehouseCatalogProduct[]>("/api/warehouse/catalog")
      ]).then(([draft, catalog]) => {
        setReceiptDraft(draft);
        setReceiptLines(draft.lines);
        setReceiptCatalog(catalog.filter((product) => product.status === "active"));
      }).catch((error) => setMessage((error as Error).message));
      onIntentHandled?.();
      return;
    }
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
    if (intent === "stock-low") {
      setShowForm(false);
      setStockView("low");
      setActiveLocation("all");
      setSelectedStockProductId("");
      onIntentHandled?.();
    }
  }, [intent, loading, onIntentHandled]);

  const updateReceiptLine = (lineId: string, patch: Partial<SupplyReceiptLine>) => {
    setReceiptLines((lines) => lines.map((line) => line.id === lineId ? { ...line, ...patch } : line));
  };

  const beginSupplyProduct = (line: SupplyReceiptLine) => {
    setCreatingSupplyLineId(line.id);
    setNewSupplyProduct({
      officialName: line.sourceName,
      article: line.sourceArticle || "",
      inventoryKind: "piece",
      packageMassGrams: line.packageMassGrams || 0
    });
  };

  const createSupplyProduct = async () => {
    if (!receiptDraft || !creatingSupplyLineId || !newSupplyProduct.officialName.trim() || newSupplyProduct.packageMassGrams <= 0) return;
    setSaving(true); setMessage("");
    try {
      const product = await client.request<WarehouseCatalogProduct>("/api/warehouse/products", {
        method: "POST",
        body: JSON.stringify({ ...newSupplyProduct, supplierId: receiptDraft.supplierId })
      });
      setReceiptCatalog((current) => [...current, product].sort((a, b) => a.localName.localeCompare(b.localName, "ru")));
      updateReceiptLine(creatingSupplyLineId, { productId: product.id, packageMassGrams: newSupplyProduct.packageMassGrams });
      setCreatingSupplyLineId("");
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };

  const acceptReceiptDraft = async () => {
    if (!receiptDraft || receiptDraft.status === "accepted") return;
    const lines = receiptLines.map((line) => ({
      id: line.id, productId: line.productId || "", packageCount: Number(line.packageCount),
      packageMassGrams: Number(line.packageMassGrams), purchaseCostKopecks: Number(line.purchaseCostKopecks)
    }));
    setSaving(true); setMessage("");
    try {
      const result = await client.request<{ supplyId: string }>(`/api/warehouse/supply-drafts/${encodeURIComponent(receiptDraft.id)}/accept`, {
        method: "POST", headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ invoiceNumber: receiptInvoice, deliveredAt: `${receiptDate}T00:00:00.000Z`, lines })
      });
      setReceiptDraft({ ...receiptDraft, status: "accepted", acceptedSupplyId: result.supplyId });
      setMessage("Поставка принята на склад");
    } catch (error) { setMessage((error as Error).message); }
    finally { setSaving(false); }
  };

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
  const stockTableRows: StockRow[] = stockView === "zero"
    ? zeroRows.map(({ product }) => ({ product, balance: { productId: product.id, locationId: "", quantity: 0, version: 0 } }))
    : [...visibleRows].sort((a, b) => productTitle(a).localeCompare(productTitle(b), "ru") || (a.location?.name || "").localeCompare(b.location?.name || "", "ru"));
  const activeLocations = locations.filter((location) => location.status === "active");
  const stockedPositions = balances.filter((balance) => balance.quantity > 0).length;
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
    const source = sourceLocationId || balances.find((balance) => balance.productId === productId && balance.quantity > 0)?.locationId || "";
    const destination = activeLocations.find((location) => location.id !== source)?.id || "";
    setSelectedStockProductId(productId);
    setDefectReason("");
    setDefectComment("");
    setForm({
      type: "transfer",
      productId,
      fromLocationId: source,
      toLocationId: destination,
      quantity: 1,
      reason: "Перемещение"
    });
  };

  const closeSellerProduct = () => setSelectedStockProductId("");

  const strongestSourceForProduct = (productId: string) => {
    return strongestBalanceForProduct(productId, balances);
  };

  const rememberScannedProduct = (product: Product) => {
    setProducts((current) => current.some((item) => item.id === product.id) ? current : [...current, product]);
    setScannedProduct(product);
    setScanState("found");
    setUnknownScanAction(null);
    setQuickProductForm({ name: "", inventoryKind: "piece", packageMassGrams: 0 });
    setBindQuery("");
  };

  const handleBarcodeDetected = async (barcode: string) => {
    if (!barcode || scanState === "loading" || unknownScanAction) return;
    setScannedBarcode(barcode);
    setScannedProduct(null);
    setScanState("loading");
    setMessage("");
    try {
      const product = await client.request<Product>(`/api/products/by-barcode/${encodeURIComponent(barcode)}`);
      rememberScannedProduct(product);
    } catch (error) {
      if (error instanceof ApiError && error.code === "PRODUCT_NOT_FOUND") {
        setScanState("unknown");
        return;
      }
      setScanState("error");
      setMessage((error as Error).message);
    }
  };

  const createScannedProduct = async () => {
    if (!quickProductForm.name.trim() || !scannedBarcode || saving) return;
    if (quickProductForm.inventoryKind === "weight" && (!Number.isInteger(quickProductForm.packageMassGrams) || quickProductForm.packageMassGrams <= 0)) return;
    setSaving(true);
    setMessage("");
    try {
      const product = await client.request<Product>("/api/products/quick-scan", {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ barcode: scannedBarcode, ...quickProductForm })
      });
      rememberScannedProduct(product);
      setMessage("Товар создан, штрихкод сохранён");
      await load();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const bindScannedBarcode = async (product: Product) => {
    if (!scannedBarcode || saving) return;
    const approved = await confirm({
      title: "Добавить штрихкод?",
      description: `К товару «${product.localName || product.officialName}» будет добавлен код ${scannedBarcode}.`,
      confirmLabel: "Добавить код",
      tone: "warn"
    });
    if (!approved) return;
    setSaving(true);
    setMessage("");
    try {
      const updated = await client.request<Product>(`/api/products/${encodeURIComponent(product.id)}/barcodes`, {
        method: "POST",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify({ barcode: scannedBarcode })
      });
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
      rememberScannedProduct(updated);
      setMessage("Штрихкод добавлен к товару");
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openScannedOperation = (type: "receipt" | "transfer" | "write_off" | "correction") => {
    if (!scannedProduct) return;
    const source = strongestSourceForProduct(scannedProduct.id);
    if (isSeller && (type === "transfer" || type === "write_off")) {
      openSellerProduct(scannedProduct.id, source?.locationId);
      return;
    }
    const destination = activeLocations.find((location) => location.id !== source?.locationId)?.id || "";
    setForm({
      type,
      productId: scannedProduct.id,
      fromLocationId: source?.locationId || "",
      toLocationId: type === "receipt" || type === "correction" ? (source?.locationId || activeLocations[0]?.id || "") : destination,
      quantity: 1,
      reason: type === "receipt" ? "Приход товара" : type === "write_off" ? "Брак" : type === "correction" ? "Корректировка остатка" : "Перемещение"
    });
    setShowForm(true);
  };

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
      const reason = defectReason === "other" ? defectComment.trim() : defectReason;
      if (!reason) { setMessage("Укажите причину брака"); return; }
      const quantity = selectedStockProduct.inventoryKind === "weight" ? 1 : form.quantity;
      const approved = await confirm({
        title: "Списать брак?",
        description: `${selectedStockProduct.localName} · ${locationName(form.fromLocationId, locations)}. ${formatProductQuantity(selectedStockProduct, quantity)}. Причина: ${defectReasonLabel(defectReason, defectComment)}. Останется ${formatProductQuantity(selectedStockProduct, sellerMaxQty - quantity)}.`,
        confirmLabel: "Списать брак",
        tone: "danger"
      });
      if (!approved) return;
    } else {
      const approved = await confirm({
        title: "Переместить товар?",
        description: `${selectedStockProduct.localName || selectedStockProduct.officialName}: ${formatProductQuantity(selectedStockProduct, selectedStockProduct.inventoryKind === "weight" ? 1 : form.quantity)} из «${locationName(form.fromLocationId, locations)}» в «${locationName(form.toLocationId, locations)}».`,
        confirmLabel: "Переместить",
        tone: "warn"
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
        reason: type === "transfer" ? "Перемещение" : `Брак: ${defectReasonLabel(defectReason, defectComment)}`
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
    const product = productById.get(form.productId);
    const approved = await confirm({
      title: `${operationTitle(form.type)}?`,
      description: `${product?.localName || product?.officialName || "Товар"}: ${formatProductQuantity(product, form.quantity)}. ${form.reason}.`,
      confirmLabel: "Подтвердить",
      tone: form.type === "write_off" ? "danger" : "warn"
    });
    if (!approved) return;
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

  const scannedStockLines = scannedProduct ? productStockLines(scannedProduct.id, balances, locations) : [];
  const scannedTotal = scannedProduct
    ? totals.find((item) => item.productId === scannedProduct.id)?.quantity || 0
    : 0;
  const scannerPaused = scanState === "unknown" || Boolean(unknownScanAction || selectedStockProduct || showForm);
  const canManageScannedCatalog = session.permissions.includes("products:scan_manage");
  const scannerWorkspace = (
    <Panel className="scanner-panel" title="Сканер штрихкодов" description="Наведите камеру на код — товар появится автоматически.">
      <div className="scanner-workspace">
        <BarcodeScanner active={!scannerPaused} onDetected={handleBarcodeDetected} />
        <div className="scanner-result" aria-live="polite">
          {scanState === "idle" && <Notice>Камера готова к непрерывному сканированию. Ручной поиск остаётся доступен ниже.</Notice>}
          {scanState === "loading" && <Notice>Ищем товар по коду {scannedBarcode}…</Notice>}
          {scanState === "error" && <Notice tone="danger">Не удалось найти товар. Можно продолжить сканирование или воспользоваться поиском.</Notice>}
          {scanState === "unknown" && (
            <div className="unknown-barcode-card">
              <div>
                <small>Неизвестный штрихкод</small>
                <strong>{scannedBarcode}</strong>
                <p>Создайте товар или добавьте этот код к существующей карточке.</p>
              </div>
              {canManageScannedCatalog ? (
                <>
                  {!unknownScanAction && (
                    <div className="inline-actions">
                      <button type="button" onClick={() => setUnknownScanAction("create")}>Создать товар</button>
                      <button type="button" className="secondary" onClick={() => setUnknownScanAction("bind")}>Выбрать существующий</button>
                      <button type="button" className="link-button" onClick={() => setScanState("idle")}>Отмена</button>
                    </div>
                  )}
                  {unknownScanAction === "create" && (
                    <div className="stack scanner-inline-form">
                      <Field label="Название"><input autoFocus value={quickProductForm.name} onChange={(event) => setQuickProductForm({ ...quickProductForm, name: event.target.value })} /></Field>
                      <Field label="Тип учёта">
                        <select value={quickProductForm.inventoryKind} onChange={(event) => setQuickProductForm({ ...quickProductForm, inventoryKind: event.target.value as QuickProductForm["inventoryKind"] })}>
                          <option value="piece">Штучный</option>
                          <option value="weight">Весовой</option>
                        </select>
                      </Field>
                      {quickProductForm.inventoryKind === "weight" && <Field label="Масса пачки, г"><input type="number" min="1" step="1" value={quickProductForm.packageMassGrams || ""} onChange={(event) => setQuickProductForm({ ...quickProductForm, packageMassGrams: Number(event.target.value) })} /></Field>}
                      <div className="inline-actions">
                        <button type="button" onClick={() => void createScannedProduct()} disabled={saving || !quickProductForm.name.trim() || (quickProductForm.inventoryKind === "weight" && quickProductForm.packageMassGrams <= 0)}>{saving ? "Создание…" : "Создать"}</button>
                        <button type="button" className="secondary" onClick={() => setUnknownScanAction(null)}>Назад</button>
                      </div>
                    </div>
                  )}
                  {unknownScanAction === "bind" && (
                    <div className="stack scanner-inline-form">
                      <Field label="Найти товар"><input autoFocus value={bindQuery} onChange={(event) => setBindQuery(event.target.value)} placeholder="Название или артикул" /></Field>
                      <div className="scanner-bind-results">
                        {bindQuery.trim().length >= 2 && !bindResults.length && <small>Совпадений пока нет</small>}
                        {bindResults.map((product) => (
                          <button type="button" className="scanner-bind-product" key={product.id} onClick={() => void bindScannedBarcode(product)}>
                            <span><strong>{product.localName || product.officialName}</strong><small>{identifierValues(product)}</small></span>
                            <span>Выбрать</span>
                          </button>
                        ))}
                      </div>
                      <button type="button" className="secondary" onClick={() => setUnknownScanAction(null)}>Назад</button>
                    </div>
                  )}
                </>
              ) : <Notice>Недостаточно прав для изменения каталога.</Notice>}
            </div>
          )}
          {scanState === "found" && scannedProduct && (
            <article className="scanned-product-card" data-testid="scanned-product-card">
              <div className="scanned-product-head">
                {scannedProduct.photoUrl ? <img src={scannedProduct.photoUrl} alt="" /> : <div className="scanned-product-placeholder" aria-hidden="true">Т</div>}
                <div>
                  <small>Товар найден</small>
                  <h2>{scannedProduct.localName || scannedProduct.officialName}</h2>
                  <p>{scannedProduct.officialName}</p>
                  <code>{scannedProduct.identifiers.filter((item) => item.type === "barcode").map((item) => item.value).join(" · ") || scannedBarcode}</code>
                </div>
              </div>
              <div className="scanned-total"><span>Общий остаток</span><strong>{formatProductQuantity(scannedProduct, scannedTotal)}</strong></div>
              <div className="stock-lines">
                {scannedStockLines.length ? scannedStockLines.map((line) => (
                  <div className="stock-line" key={line.locationId}><span>{line.locationName}</span><strong>{formatProductQuantity(scannedProduct, line.quantity)}</strong></div>
                )) : <span className="muted-line">Нет в наличии</span>}
              </div>
              <div className="scanner-actions">
                {canMove && <button type="button" onClick={() => openScannedOperation("receipt")}>Приход</button>}
                {canMove && <button type="button" className="secondary" onClick={() => openScannedOperation("transfer")}>Переместить</button>}
                {canMove && <button type="button" className="danger-secondary" onClick={() => openScannedOperation("write_off")}>Брак</button>}
                {canInventory && <button type="button" className="secondary" onClick={() => openScannedOperation("correction")}>Корректировка</button>}
              </div>
            </article>
          )}
        </div>
      </div>
    </Panel>
  );
  if (loading && !balances.length) return <Skeleton />;

  if (isSeller) {
    return (
      <section className="stack seller-page">
        {message && <Notice tone={message.includes("перемещ") || message.includes("зал") ? "good" : "danger"}>{message}</Notice>}

        {scannerWorkspace}

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

        <Drawer open={Boolean(selectedStockProduct)} onClose={closeSellerProduct} title={`Действия с товаром ${selectedStockProduct?.localName || selectedStockProduct?.officialName || ""}`}>
          {selectedStockProduct && (
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
                    <button className="danger-secondary" disabled={saving || form.quantity <= 0 || form.quantity > sellerMaxQty || !defectReason || (defectReason === "other" && !defectComment.trim())} onClick={() => applySellerMove("write_off")}>
                      Списать брак
                    </button>
                  </div>
                  <div className="form-grid defect-reason-fields">
                    <Field label="Причина брака"><select value={defectReason} onChange={(event) => setDefectReason(event.target.value)}><option value="">Выберите причину</option><option value="damaged">Повреждение упаковки</option><option value="spoiled">Испорчен</option><option value="expired">Просрочен</option><option value="other">Другое</option></select></Field>
                    {defectReason === "other" && <Field label="Комментарий"><input value={defectComment} onChange={(event) => setDefectComment(event.target.value)} required /></Field>}
                  </div>
                </div>
              )}
            </div>
          )}
        </Drawer>
        {canMove && showForm && (
          <Drawer open={showForm} title={operationTitle(form.type)} onClose={() => setShowForm(false)}>
            <p className="muted">{operationDescription(form.type)}</p>
            <div className="form-grid">
              <Field label="Товар"><select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })}>{products.map((product) => <option key={product.id} value={product.id}>{product.localName || product.officialName}</option>)}</select></Field>
              {form.type !== "receipt" && form.type !== "correction" && <Field label="Откуда" hint={`Сейчас: ${fromBalance?.quantity ?? 0}`}><select value={form.fromLocationId} onChange={(event) => setForm({ ...form, fromLocationId: event.target.value })}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>}
              {form.type !== "write_off" && <Field label="Куда" hint={`Сейчас: ${toBalance?.quantity ?? 0}`}><select value={form.toLocationId} onChange={(event) => setForm({ ...form, toLocationId: event.target.value })}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>}
              <Field label="Количество"><input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: Number(event.target.value) })} /></Field>
              <Field label="Основание"><input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} /></Field>
            </div>
            <button type="button" onClick={() => void submit()} disabled={saving || form.quantity <= 0 || !form.reason.trim() || (projectedFrom !== undefined && projectedFrom < 0) || (form.type === "transfer" && form.fromLocationId === form.toLocationId)}>{saving ? "Проведение…" : "Провести"}</button>
          </Drawer>
        )}
        {confirmDialog}
      </section>
    );
  }

  return (
    <>
      <section className="stack admin-page stock-page">
        <PageHeader
          title="Склад"
          description="Остатки и движения по точкам"
          meta={<div><h1>Склад</h1><p>Остатки и движения по точкам</p></div>}
          actions={(
            <>
              <button className="secondary" onClick={() => void load()} disabled={loading}><RefreshCw size={17} />Обновить</button>
              {deferredTabletBufferEnabled && <button className="secondary" onClick={() => setBufferOpen((value) => !value)}>Буфер: {workBuffer.length}</button>}
              {canMove && <button onClick={startReceipt}>Принять товар</button>}
            </>
          )}
        />
        {message && <Notice tone={message.includes("примен") || message.includes("принята") || message.includes("отмен") || message.includes("обнов") ? "good" : "danger"}>{message}</Notice>}
        <Drawer open={Boolean(receiptDraft)} title="Приёмка поставки" onClose={() => { setReceiptDraft(null); setReceiptLines([]); }}>
          {receiptDraft ? <div className="supply-receipt-draft">
            <div className="supply-receipt-meta"><strong>{receiptDraft.fileName}</strong><span>Доставка: {(receiptDraft.deliveryCostKopecks / 100).toLocaleString("ru-RU", { style: "currency", currency: "RUB" })}</span></div>
            {receiptDraft.status === "accepted" ? <Notice tone="good">Поставка уже принята. ID: {receiptDraft.acceptedSupplyId}</Notice> : <>
              <div className="form-grid"><Field label="Номер накладной"><input value={receiptInvoice} onChange={(event) => setReceiptInvoice(event.target.value)} /></Field><Field label="Дата поставки"><input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} /></Field></div>
              <div className="supply-receipt-lines">{receiptLines.map((line, index) => <section className="supply-receipt-line" key={line.id}>
                <header><span>Строка {index + 1}</span><strong>{line.sourceName}</strong>{line.sourceArticle ? <small>{line.sourceArticle}</small> : null}</header>
                <div className="form-grid">
                  <Field label="Товар"><select value={line.productId || ""} onChange={(event) => updateReceiptLine(line.id, { productId: event.target.value || undefined })}><option value="">Не сопоставлен</option>{receiptCatalog.map((product) => <option value={product.id} key={product.id}>{product.localName || product.officialName}{product.article ? ` · ${product.article}` : ""}</option>)}</select></Field>
                  <Field label="Упаковок"><input type="number" min="1" step="1" value={line.packageCount ?? ""} onChange={(event) => updateReceiptLine(line.id, { packageCount: Number(event.target.value) || undefined })} /></Field>
                  <Field label="Масса упаковки, г"><input type="number" min="1" step="1" value={line.packageMassGrams ?? ""} onChange={(event) => updateReceiptLine(line.id, { packageMassGrams: Number(event.target.value) || undefined })} /></Field>
                  <Field label="Стоимость строки, ₽"><input inputMode="decimal" value={line.purchaseCostKopecks === undefined ? "" : (line.purchaseCostKopecks / 100).toFixed(2)} onChange={(event) => updateReceiptLine(line.id, { purchaseCostKopecks: Math.round(Number(event.target.value.replace(",", ".")) * 100) })} /></Field>
                </div>
                {!line.productId && canWriteProducts ? <button className="secondary" type="button" onClick={() => beginSupplyProduct(line)}>Создать новый товар</button> : null}
                {creatingSupplyLineId === line.id ? <div className="supply-new-product"><Field label="Название"><input value={newSupplyProduct.officialName} onChange={(event) => setNewSupplyProduct({ ...newSupplyProduct, officialName: event.target.value })} /></Field><Field label="Артикул"><input value={newSupplyProduct.article} onChange={(event) => setNewSupplyProduct({ ...newSupplyProduct, article: event.target.value })} /></Field><Field label="Тип"><select value={newSupplyProduct.inventoryKind} onChange={(event) => setNewSupplyProduct({ ...newSupplyProduct, inventoryKind: event.target.value as "piece" | "weight" })}><option value="piece">Штучный</option><option value="weight">Весовой</option></select></Field><Field label="Масса упаковки, г"><input type="number" min="1" value={newSupplyProduct.packageMassGrams || ""} onChange={(event) => setNewSupplyProduct({ ...newSupplyProduct, packageMassGrams: Number(event.target.value) })} /></Field><button disabled={saving || !newSupplyProduct.officialName.trim() || newSupplyProduct.packageMassGrams <= 0} onClick={() => void createSupplyProduct()}>Создать и сопоставить</button></div> : null}
              </section>)}</div>
              <button disabled={saving || !receiptDate || receiptLines.some((line) => !line.productId || !line.packageCount || !line.packageMassGrams || line.purchaseCostKopecks === undefined)} onClick={() => void acceptReceiptDraft()}>{saving ? "Принимаем…" : "Принять поставку на склад"}</button>
            </>}
          </div> : null}
        </Drawer>
        <div className="stock-summary" aria-label="Сводка по складу">
          <span><strong>{activeLocations.length}</strong> локации</span>
          <span><strong>{stockedPositions}</strong> позиции</span>
          <span className="warn"><strong>{lowRows.length}</strong> заканчиваются</span>
          <span className="danger"><strong>{zeroRows.length}</strong> нет в наличии</span>
        </div>

        <div className="stock-controls">
          <div className="stock-nav">
            <button className={stockView === "locations" ? "active" : ""} onClick={() => setStockView("locations")}>По локациям</button>
            <button className={stockView === "low" ? "active" : ""} onClick={() => setStockView("low")}>Заканчиваются <span>{lowRows.length}</span></button>
            <button className={stockView === "zero" ? "active" : ""} onClick={() => setStockView("zero")}>Нет в наличии <span>{zeroRows.length}</span></button>
            <button className={stockView === "journal" ? "active" : ""} onClick={() => setStockView("journal")}>Журнал</button>
          </div>
          <Toolbar className="stock-toolbar">
            <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Товар, артикул или штрихкод" />
            <select value={activeLocation} onChange={(event) => setActiveLocation(event.target.value)}>
              <option value="all">Все точки</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
            <details className="stock-filter-menu">
              <summary><Filter size={18} />Фильтры<ChevronDown size={16} /></summary>
              <div>
                <button type="button" onClick={() => setStockView("locations")}>Все товары</button>
                <button type="button" onClick={() => setStockView("low")}>Заканчиваются</button>
                <button type="button" onClick={() => setStockView("zero")}>Нет в наличии</button>
                <button type="button" className="secondary" onClick={() => { setQ(""); setActiveLocation("all"); setStockView("locations"); }}>Сбросить</button>
              </div>
            </details>
          </Toolbar>
        </div>

        {canMove && showForm && (
          <Drawer open={showForm} title={operationTitle(form.type)} onClose={() => setShowForm(false)}>
            <p className="muted">{operationDescription(form.type)}</p>
            <div className="form-grid">
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
              <Field label="Основание" hint="Обязательное поле для проведения операции.">
                <input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
              </Field>
            </div>
            {projectedFrom !== undefined && projectedFrom < 0 && <Notice tone="danger">Остаток источника станет отрицательным.</Notice>}
            {form.type === "transfer" && form.fromLocationId === form.toLocationId && <Notice tone="danger">Источник и назначение должны отличаться.</Notice>}
            {(!form.reason.trim() || form.quantity <= 0) && <Notice tone="info">Заполните количество и основание, чтобы провести операцию.</Notice>}
            <button onClick={submit} disabled={saving || form.quantity <= 0 || !form.reason.trim() || (projectedFrom !== undefined && projectedFrom < 0) || (form.type === "transfer" && form.fromLocationId === form.toLocationId)}>
              {saving ? "Проведение..." : "Провести"}
            </button>
          </Drawer>
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
        {stockView !== "journal" && (
          <div className="stock-table-surface">
            <DataTable
              rows={stockTableRows}
              empty="Товары не найдены"
              columns={[
                {
                  key: "product",
                  header: "Товар",
                  render: (row) => <div className="stock-table-product"><strong>{productTitle(row)}</strong><small>{identifierSummary(row.product)}</small></div>
                },
                { key: "location", header: "Локация", render: (row) => row.location?.name || "—" },
                { key: "quantity", header: "Остаток", className: "stock-table-quantity", render: (row) => formatProductQuantity(row.product, row.balance.quantity) },
                {
                  key: "status",
                  header: "Статус",
                  render: (row) => {
                    const tone = row.balance.quantity <= 0 ? "danger" : row.product && row.balance.quantity <= row.product.lowStockThreshold ? "warn" : "good";
                    const label = tone === "danger" ? "Нет в наличии" : tone === "warn" ? "Заканчивается" : "В наличии";
                    return <span className={`stock-table-status ${tone}`}><span aria-hidden="true" />{label}</span>;
                  }
                },
                {
                  key: "actions",
                  header: "Действия",
                  className: "stock-table-actions",
                  render: (row) => canMove ? (
                    <details className="stock-row-menu">
                      <summary>Действия<ChevronDown size={15} /></summary>
                      <div>
                        {row.balance.quantity <= 0 ? (
                          <button type="button" onClick={() => { setForm({ type: "receipt", productId: row.balance.productId, fromLocationId: "", toLocationId: activeLocation === "all" ? locations[0]?.id || "" : activeLocation, quantity: 1, reason: "Приход товара" }); setShowForm(true); }}>Принять товар</button>
                        ) : (
                          <>
                            <button type="button" onClick={() => startRowAction(row, "transfer")}>Переместить</button>
                            <button type="button" onClick={() => startRowAction(row, "write_off")}>Списать</button>
                            <button type="button" onClick={() => startCorrection(row)}>Корректировать</button>
                          </>
                        )}
                      </div>
                    </details>
                  ) : "—"
                }
              ]}
            />
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

function defectReasonLabel(reason: string, comment: string) {
  if (reason === "damaged") return "Повреждение упаковки";
  if (reason === "spoiled") return "Испорчен";
  if (reason === "expired") return "Просрочен";
  return comment.trim() || "Причина не указана";
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

export function strongestBalanceForProduct(productId: string, balances: StockBalance[]) {
  let strongest: StockBalance | undefined;
  for (const balance of balances) {
    if (balance.productId !== productId || balance.quantity <= 0) continue;
    if (!strongest || balance.quantity > strongest.quantity) strongest = balance;
  }
  return strongest;
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

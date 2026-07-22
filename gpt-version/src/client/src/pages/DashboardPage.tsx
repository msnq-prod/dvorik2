import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { Location, NotificationItem, Product, StockBalance, StockOperation } from "../../../shared/types";
import type { NavigationIntent, PageProps, View } from "../appTypes";
import { operationLabels, operationTone } from "../constants";
import { formatProductQuantity, notificationLabels, safeLabel } from "../presentation";
import { DataTable, EmptyState, formatDateTime, Metric, Notice, PageHeader, Panel, Skeleton, StatusBadge } from "../ui";

type Summary = {
  activeProducts: number;
  lowStock: number;
  currentShiftEmployees: number;
  latestOperations: StockOperation[];
  notifications: NotificationItem[];
};

export function DashboardPage({ client, session, onNavigate }: PageProps) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [balances, setBalances] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextSummary, nextProducts, nextLocations, nextBalances] = await Promise.all([
        client.request<Summary>("/api/summary"),
        client.request<{ items: Product[] }>("/api/products?status=all&limit=100"),
        client.request<Location[]>("/api/locations"),
        client.request<StockBalance[]>("/api/balances")
      ]);
      setSummary(nextSummary);
      setProducts(nextProducts.items);
      setLocations(nextLocations);
      setBalances(nextBalances);
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [client]);

  const lowStockRows = useMemo(() => {
    return balances
      .map((balance) => {
        const product = products.find((item) => item.id === balance.productId);
        const location = locations.find((item) => item.id === balance.locationId);
        if (!product || balance.quantity > product.lowStockThreshold) return null;
        return { product, location, balance };
      })
      .filter(Boolean)
      .slice(0, 8) as Array<{ product: Product; location?: Location; balance: StockBalance }>;
  }, [balances, locations, products]);

  if (loading && !summary) return <Skeleton />;

  return (
    <section className="stack admin-page dashboard-page">
      <PageHeader
        title="Главная"
        description="Операционный срез по складу, сменам и последним действиям."
        meta={updatedAt && <>Обновлено: {formatDateTime(updatedAt)}</>}
        actions={<button className="icon-button secondary" onClick={load} disabled={loading} aria-label="Обновить данные"><RefreshCw size={18} /></button>}
      />
      {error && <Notice tone="danger">{error}</Notice>}
      {summary ? (
        <>
          <div className="inline-actions primary-actions dashboard-primary-actions" aria-label="Быстрые действия">
            {quickActions(session.user.role === "seller", session.permissions).map((action) => (
              <button key={action.label} className="secondary" onClick={() => onNavigate?.(action.view, action.intent)}>{action.label}</button>
            ))}
          </div>
          <div className="metric-grid compact secondary-metrics">
            <Metric title="Низкий остаток" value={summary.lowStock} detail="требуют внимания" tone={summary.lowStock ? "warn" : "good"} />
            <Metric title="Необработанные" value={summary.notifications.filter((item) => !item.read).length} detail="уведомления" tone={summary.notifications.some((item) => !item.read) ? "info" : "good"} />
            <Metric title="На смене" value={summary.currentShiftEmployees} detail="сейчас" />
          </div>

          <div className="dashboard-grid primary-panel">
            <Panel title="Требует внимания" description="Позиции, где остаток ниже или равен порогу.">
              <DataTable
                rows={lowStockRows}
                empty="Низких остатков нет"
                columns={[
                  { key: "product", header: "Товар", render: (row) => <button className="link-button" onClick={() => onNavigate?.("stock", "stock-search")}>{row.product.localName}</button> },
                  { key: "location", header: "Локация", render: (row) => row.location?.name || row.balance.locationId },
                  { key: "qty", header: "Остаток", render: (row) => formatProductQuantity(row.product, row.balance.quantity) },
                  { key: "threshold", header: "Порог", render: (row) => formatProductQuantity(row.product, row.product.lowStockThreshold) },
                  { key: "status", header: "Статус", render: () => <StatusBadge tone="warn">Пополнить</StatusBadge> }
                ]}
              />
            </Panel>

            <Panel title="Уведомления">
              {summary.notifications.length ? (
                <DataTable
                  rows={summary.notifications}
                  columns={[
                    { key: "type", header: "Тип", render: (row) => safeLabel(notificationLabels, row.type, "Системное уведомление") },
                    { key: "date", header: "Создано", render: (row) => formatDateTime(row.createdAt) },
                    { key: "read", header: "Статус", render: (row) => <StatusBadge tone={row.read ? "neutral" : "info"}>{row.read ? "Прочитано" : "Новое"}</StatusBadge> }
                  ]}
                />
              ) : (
                <EmptyState title="Новых уведомлений нет" />
              )}
            </Panel>
          </div>

          <Panel title="Последние движения">
            <DataTable
              rows={summary.latestOperations}
              empty="Движений пока нет"
              columns={[
                { key: "type", header: "Тип", render: (row) => <StatusBadge tone={operationTone[row.type] || "neutral"}>{operationLabels[row.type] || row.type}</StatusBadge> },
                { key: "product", header: "Товар", render: (row) => products.find((item) => item.id === row.productId)?.localName || row.productId },
                { key: "route", header: "Маршрут", render: (row) => routeLabel(row, locations) },
                { key: "qty", header: "Количество", render: (row) => formatProductQuantity(products.find((item) => item.id === row.productId), row.quantity) },
                { key: "reason", header: "Основание", render: (row) => row.reason },
                { key: "date", header: "Время", render: (row) => formatDateTime(row.createdAt) }
              ]}
            />
          </Panel>
        </>
      ) : (
        <EmptyState title="Dashboard недоступен" description="Обновите страницу или проверьте сессию." />
      )}
    </section>
  );
}

function quickActions(isSeller: boolean, permissions: string[]): Array<{ label: string; view: View; intent?: NavigationIntent }> {
  const actions = isSeller
    ? [
      { label: "Наличие", view: "stock" as View, intent: "stock-search" as NavigationIntent, permission: "stock:move" },
      { label: "Мой график", view: "schedule" as View },
      { label: "Проверка", view: "inventory" as View, intent: "inventory-start" as NavigationIntent, permission: "inventory:write" }
    ]
    : [
      { label: "Приемка", view: "stock" as View, intent: "stock-receipt" as NavigationIntent, permission: "stock:move" },
      { label: "Назначить смену", view: "schedule" as View }
    ];
  return actions.filter((action) => !action.permission || permissions.includes(action.permission));
}

function routeLabel(operation: StockOperation, locations: Location[]) {
  const from = operation.fromLocationId ? locations.find((item) => item.id === operation.fromLocationId)?.name || operation.fromLocationId : "—";
  const to = operation.toLocationId ? locations.find((item) => item.id === operation.toLocationId)?.name || operation.toLocationId : "—";
  return `${from} -> ${to}`;
}

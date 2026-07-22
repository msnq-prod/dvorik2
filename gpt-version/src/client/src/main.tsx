import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Boxes,
  CalendarDays,
  ChevronLeft,
  ClipboardCheck,
  Gauge,
  LogOut,
  Menu,
  Moon,
  PackagePlus,
  Printer,
  Search,
  Shield,
  RefreshCw,
  Sun,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Location, Permission, Shift } from "../../shared/types";
import { api } from "./api";
import type { AuthMode, DevConfig, NavigationIntent, SessionData, View } from "./appTypes";
import { AuditPage } from "./pages/AuditPage";
import { DashboardPage } from "./pages/DashboardPage";
import { InventoryPage } from "./pages/InventoryPage";
import { LabelsPage } from "./pages/LabelsPage";
import { ProductsPage } from "./pages/ProductsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SchedulePage } from "./pages/SchedulePage";
import { StockPage } from "./pages/StockPage";
import { UsersPage } from "./pages/UsersPage";
import { SabyPage } from "./pages/SabyPage";
import { Notice, Skeleton } from "./ui";
import "./styles.css";

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData?: string;
        ready?: () => void;
        expand?: () => void;
      };
    };
  }
}

type NavigationItem = {
  key: View;
  label: string;
  description: string;
  icon: LucideIcon;
  permissions?: Permission[];
};

type NavigationGroup = {
  title: string;
  items: NavigationItem[];
};

const navigationGroups: NavigationGroup[] = [
  {
    title: "Старт",
    items: [{ key: "dashboard", label: "Главное меню", description: "Быстрые действия", icon: Gauge }]
  },
  {
    title: "Каталог",
    items: [
      { key: "products", label: "Товары", description: "Каталог и поиск", icon: Boxes, permissions: ["products:read"] }
    ]
  },
  {
    title: "Склад",
    items: [
      { key: "stock", label: "Склад", description: "Остатки по точкам", icon: PackagePlus, permissions: ["stock:move"] },
      { key: "inventory", label: "Проверка", description: "Остатки по точке", icon: ClipboardCheck, permissions: ["inventory:write"] },
      { key: "labels", label: "Маркировки", description: "Этикетки и PDF", icon: Printer, permissions: ["labels:print"] }
    ]
  },
  {
    title: "Команда",
    items: [
      { key: "schedule", label: "График", description: "Смены и обмены", icon: CalendarDays },
      { key: "users", label: "Пользователи", description: "Роли и доступы", icon: Users, permissions: ["users:manage"] }
    ]
  },
  {
    title: "Контроль",
    items: [
      { key: "reports", label: "Отчёты", description: "Остатки и операции", icon: Gauge, permissions: ["reports:read"] },
      { key: "saby", label: "Saby", description: "Синхронизация и сопоставления", icon: RefreshCw, permissions: ["saby:manage"] },
      { key: "audit", label: "Аудит", description: "Журнал и копии", icon: Shield, permissions: ["techlog:read"] }
    ]
  }
];

const defaultUserOptions = [
  { id: "u-super", label: "Анна, super admin" },
  { id: "u-admin", label: "Олег, admin" },
  { id: "u-seller", label: "Маша, seller" },
  { id: "u-blocked", label: "Заблокированный" }
];

function App() {
  const [view, setView] = useState<View>(() => viewFromUrl());
  const [intent, setIntent] = useState<NavigationIntent | undefined>();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userId, setUserId] = useState("u-admin");
  const [authMode, setAuthMode] = useState<AuthMode>("demo");
  const [devConfig, setDevConfig] = useState<DevConfig | null>(null);
  const [dark, setDark] = useState(() => localStorage.getItem("theme") === "dark");
  const [dense, setDense] = useState(() => localStorage.getItem("density") === "dense");
  const [session, setSession] = useState<SessionData | null>(null);
  const [error, setError] = useState("");
  const client = useMemo(() => api(), []);

  useEffect(() => {
    replaceViewInUrl(view, historyDepth());
    const handlePopState = () => {
      setView(viewFromUrl());
      setIntent(undefined);
      setSidebarOpen(false);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    document.documentElement.dataset.density = dense ? "dense" : "comfortable";
    localStorage.setItem("density", dense ? "dense" : "comfortable");
  }, [dense]);

  const loginDemo = async (nextUserId: string) => {
    setError("");
    const data = await client.request<SessionData>("/api/auth/demo", {
      method: "POST",
      body: JSON.stringify({ userId: nextUserId })
    });
    setSession(data);
    setUserId(data.user.id);
    setAuthMode("demo");
  };

  const loginTelegramInitData = async (initData: string, mode: AuthMode) => {
    setError("");
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    const data = await client.request<SessionData>("/api/auth/telegram", {
      method: "POST",
      body: JSON.stringify({ initData })
    });
    setSession(data);
    setUserId(data.user.id);
    setAuthMode(mode);
  };

  const loginTelegramTest = async (nextUserId: string) => {
    const data = await client.request<{ initData: string }>("/api/dev/telegram/init-data", {
      method: "POST",
      body: JSON.stringify({ userId: nextUserId })
    });
    await loginTelegramInitData(data.initData, "telegram-test");
  };

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      setError("");
      try {
        const config = await client.request<DevConfig>("/api/dev/config").catch(() => null);
        if (!cancelled) setDevConfig(config);
        const params = new URLSearchParams(window.location.search);
        const initData = window.Telegram?.WebApp?.initData || params.get("tgInitData") || "";
        const testUserId = params.get("tgUserId") || params.get("tgTestUserId");
        const existingSession = initData || testUserId ? null : await client.request<SessionData>("/api/session").catch(() => null);
        if (existingSession) {
          if (!cancelled) {
            setSession(existingSession);
            setUserId(existingSession.user.id);
          }
          return;
        }
        if (initData) {
          await loginTelegramInitData(initData, "telegram-webapp");
        } else if (config?.telegramTestMode && testUserId) {
          await loginTelegramTest(testUserId);
        } else if (config?.telegramTestMode) {
          await loginDemo(userId);
        } else {
          setError("Откройте приложение из Telegram WebApp.");
        }
      } catch (err) {
        if (!cancelled) {
          setSession(null);
          setError((err as Error).message);
        }
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [client]);

  const loginAs = async (nextUserId: string) => {
    setUserId(nextUserId);
    setError("");
    try {
      if (authMode === "telegram-test") {
        await loginTelegramTest(nextUserId);
      } else {
        await loginDemo(nextUserId);
      }
    } catch (err) {
      setSession(null);
      setError((err as Error).message);
    }
  };

  const switchMode = async (nextMode: AuthMode) => {
    try {
      if (nextMode === "telegram-test") {
        await loginTelegramTest(userId);
      } else {
        await loginDemo(userId);
      }
    } catch (err) {
      setSession(null);
      setError((err as Error).message);
    }
  };

  const logout = async () => {
    try {
      await client.request("/api/auth/logout", { method: "POST" });
      setSession(null);
      setError("Сессия завершена");
    } catch (err) {
      setError((err as Error).message || "Не удалось завершить сессию");
    }
  };

  const userOptions = devConfig?.users.map((user) => ({ id: user.id, label: `${user.firstName} ${user.lastName}, ${user.role}` })) || defaultUserOptions;
  const availableViews = useMemo(() => flattenNavigation(navigationGroups).filter((item) => isAllowed(item, session)), [session]);
  const viewIsAvailable = availableViews.some((item) => item.key === view);

  useEffect(() => {
    if (session && availableViews.length && !availableViews.some((item) => item.key === view)) {
      const fallback = availableViews[0].key;
      setView(fallback);
      replaceViewInUrl(fallback, historyDepth());
      setIntent(undefined);
      setError("Этот раздел недоступен для вашей роли.");
    }
  }, [availableViews, session, view]);

  const currentItem = flattenNavigation(navigationGroups).find((item) => item.key === view);
  const topbarTitle = view === "dashboard" ? session?.user.role === "seller" ? "Меню" : "Главная" : currentItem?.label || "Dvorik";
  const navigateTo = (nextView: View, nextIntent?: NavigationIntent) => {
    setView(nextView);
    setIntent(nextIntent);
    pushViewToUrl(nextView);
  };
  const goBack = () => {
    if (historyDepth() > 0) {
      window.history.back();
      return;
    }
    setView("dashboard");
    setIntent(undefined);
    replaceViewInUrl("dashboard", 0);
  };

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  return (
    <div className={`app-shell ${sidebarOpen ? "sidebar-open" : ""}`}>
      <button className="sidebar-backdrop mobile-only" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню" />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">Д</div>
          <div>
            <strong>Дворик</strong>
            <span>Рабочее приложение</span>
          </div>
          <button className="icon-button mobile-only sidebar-close" onClick={() => setSidebarOpen(false)} aria-label="Закрыть меню"><X size={18} /></button>
        </div>
        <nav className="mega-nav">
          {navigationGroups.map((group) => {
            const items = group.items.filter((item) => isAllowed(item, session)).filter((item) => session?.user.role !== "seller" || !["dashboard", "products", "stock", "schedule"].includes(item.key));
            if (!items.length) return null;
            return (
              <section className="nav-group" key={group.title}>
                <span>{group.title}</span>
                {items.map((item) => (
                  <button key={item.key} className={view === item.key ? "active" : ""} onClick={() => { navigateTo(item.key); setSidebarOpen(false); }}>
                    <item.icon size={18} />
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
              </section>
            );
          })}
        </nav>
      </aside>

      <main className="workspace">
        <header className={`topbar ${view === "dashboard" ? "dashboard-topbar" : ""}`}>
          <div className="topbar-title">
            {!(["dashboard", "products", "stock", "schedule"] as View[]).includes(view) && <button className="icon-button mobile-only" onClick={goBack} aria-label="Назад"><ChevronLeft size={20} /></button>}
            <div>
              <h1>{topbarTitle}</h1>
            </div>
          </div>
          <div className="top-actions desktop-actions">
            {devConfig?.telegramTestMode && (
              <div className="segmented-control" aria-label="Auth mode">
                <button className={authMode === "demo" ? "active" : ""} onClick={() => switchMode("demo")}>Demo</button>
                <button className={authMode === "telegram-test" ? "active" : ""} onClick={() => switchMode("telegram-test")}>TG Test</button>
              </div>
            )}
            {devConfig?.telegramTestMode && (
              <select value={userId} onChange={(event) => loginAs(event.target.value)}>
                {userOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
              </select>
            )}
            <button className="icon-button" onClick={() => setDark((value) => !value)} aria-label="Тема">{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button className="icon-button" onClick={() => setDense((value) => !value)} aria-label="Плотность">{dense ? "A" : "A−"}</button>
            <button className="icon-button" onClick={logout} aria-label="Выход"><LogOut size={18} /></button>
          </div>
        </header>

        {error && <Notice tone={session ? "info" : "danger"}>{error}</Notice>}
        {!session || !viewIsAvailable ? <Skeleton /> : renderPage(view, { client, session, intent, onIntentHandled: () => setIntent(undefined), onNavigate: navigateTo })}
      </main>
      {session && (
        <nav className="bottom-nav mobile-only" aria-label="Основная навигация">
          {bottomNavItems(session).map((item) => (
            <button key={item.key} className={view === item.key ? "active" : ""} onClick={() => item.key === "more" ? setSidebarOpen(true) : navigateTo(item.key)}>
              <item.icon size={18} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function renderPage(view: View, props: { client: ReturnType<typeof api>; session: SessionData; intent?: NavigationIntent; onIntentHandled: () => void; onNavigate: (view: View, intent?: NavigationIntent) => void }) {
  switch (view) {
    case "dashboard":
      return props.session.user.role === "seller" ? <MainMenuPage client={props.client} session={props.session} onNavigate={props.onNavigate} /> : <DashboardPage {...props} />;
    case "products":
      return <ProductsPage {...props} />;
    case "stock":
      return <StockPage {...props} />;
    case "inventory":
      return <InventoryPage {...props} />;
    case "labels":
      return <LabelsPage {...props} />;
    case "schedule":
      return <SchedulePage {...props} />;
    case "reports":
      return <ReportsPage {...props} />;
    case "users":
      return <UsersPage {...props} />;
    case "saby":
      return <SabyPage {...props} />;
    case "audit":
      return <AuditPage {...props} />;
  }
}

function flattenNavigation(groups: NavigationGroup[]) {
  return groups.flatMap((group) => group.items);
}

function isAllowed(item: NavigationItem, session: SessionData | null) {
  if (!item.permissions?.length) return true;
  if (!session) return false;
  return item.permissions.every((permission) => session.permissions.includes(permission));
}

function MainMenuPage({ client, session, onNavigate }: { client: ReturnType<typeof api>; session: SessionData; onNavigate: (view: View, intent?: NavigationIntent) => void }) {
  const isSeller = session.user.role === "seller";
  const [nextShift, setNextShift] = useState<Shift | null>(null);
  const [shiftLocation, setShiftLocation] = useState("");
  const [inventoryActive, setInventoryActive] = useState(false);
  useEffect(() => {
    if (!isSeller) return;
    void Promise.all([
      client.request<Shift[]>("/api/schedule"),
      client.request<Location[]>("/api/locations"),
      client.request<unknown>("/api/inventory/session/active")
    ]).then(([shifts, locations, inventory]) => {
      const today = new Date().toISOString().slice(0, 10);
      const own = shifts.filter((shift) => shift.employeeIds.includes(session.user.id) && shift.status === "scheduled" && shift.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0] || null;
      setNextShift(own);
      setShiftLocation(own ? locations.find((location) => location.id === own.locationId)?.name || "Точка не указана" : "");
      setInventoryActive(Boolean(inventory));
    }).catch(() => undefined);
  }, [client, isSeller, session.user.id]);
  const availableGroups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.key !== "dashboard" && isAllowed(item, session)) }))
    .filter((group) => group.items.length);
  const quickActions = (isSeller ? [
    { key: "products" as View, title: "Найти товар", description: "По названию или артикулу", icon: Search, tone: "search", permissions: ["products:read"] as Permission[] },
    { key: "inventory" as View, intent: "inventory-start" as NavigationIntent, title: "Начать проверку", description: "Пересчитать остатки", icon: ClipboardCheck, tone: "check", permissions: ["inventory:write"] as Permission[] }
  ] : [
    { key: "stock" as View, intent: "stock-search" as NavigationIntent, title: "Остатки", description: "Товары по точкам", icon: Boxes, tone: "stock", permissions: ["stock:move"] as Permission[] },
    { key: "schedule" as View, title: "График", description: "Смены и обмены", icon: CalendarDays, tone: "schedule" },
    { key: "stock" as View, intent: "stock-receipt" as NavigationIntent, title: "Приемка", description: "Приход товара", icon: PackagePlus, tone: "receipt", permissions: ["stock:move"] as Permission[] },
    { key: "inventory" as View, intent: "inventory-start" as NavigationIntent, title: "Проверка", description: "Инвентаризация", icon: ClipboardCheck, tone: "check", permissions: ["inventory:write"] as Permission[] }
  ]).filter((item) => !item.permissions || item.permissions.every((permission) => session.permissions.includes(permission)));
  const todayLabel = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(new Date());

  return (
    <section className="app-menu">
      <div className="home-summary">
        <div>
          <h2>Сегодня</h2>
          <p>Рабочие действия</p>
        </div>
        <div className="home-day">
          <strong>{todayLabel}</strong>
        </div>
      </div>

      {isSeller && <section className="today-context" aria-label="Сегодня"><div><span>Ближайшая смена</span>{nextShift ? <strong>{new Date(`${nextShift.date}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} · 10:00–21:00 · {shiftLocation}</strong> : <strong>Смен пока нет</strong>}</div>{inventoryActive && <button className="context-alert" onClick={() => onNavigate("inventory")}>Пересчёт активен — продолжить</button>}</section>}

      <section className="quick-actions" aria-label="Быстрые действия">
        {quickActions.map((action) => (
          <button key={action.title} className={`quick-action ${action.tone}`} onClick={() => onNavigate(action.key, action.intent)}>
            <action.icon size={24} />
            <span>
              <strong>{action.title}</strong>
              <small>{action.description}</small>
            </span>
          </button>
        ))}
      </section>

      {!isSeller && <section className="menu-section-list" aria-label="Разделы приложения">
        {availableGroups.map((group) => (
          <div className="menu-section" key={group.title}>
            <h2>{group.title}</h2>
            <div className="menu-card-grid">
              {group.items.map((item) => (
                <button key={item.key} className="menu-card" onClick={() => onNavigate(item.key)}>
                  <item.icon size={22} />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>}
    </section>
  );
}

function bottomNavItems(session: SessionData): Array<{ key: View | "more"; label: string; icon: LucideIcon }> {
  const base: Array<{ key: View | "more"; label: string; icon: LucideIcon; permissions?: Permission[] }> = [
    { key: "dashboard", label: "Меню", icon: Gauge },
    { key: "products", label: "Товары", icon: Boxes, permissions: ["products:read"] },
    { key: "stock", label: "Склад", icon: PackagePlus, permissions: ["stock:move"] },
    { key: "schedule", label: "График", icon: CalendarDays },
    { key: "more", label: "Еще", icon: Menu }
  ];
  return base.filter((item) => !item.permissions || item.permissions.every((permission) => session.permissions.includes(permission)));
}

createRoot(document.getElementById("root")!).render(<App />);

function viewFromUrl(): View {
  const value = new URL(window.location.href).searchParams.get("view");
  const viewKeys: View[] = ["dashboard", "products", "stock", "inventory", "labels", "schedule", "reports", "users", "saby", "audit"];
  return viewKeys.includes(value as View) ? value as View : "dashboard";
}

function historyDepth() {
  const depth = window.history.state?.dvorikDepth;
  return typeof depth === "number" && depth >= 0 ? depth : 0;
}

function viewUrl(view: View) {
  const url = new URL(window.location.href);
  if (view === "dashboard") url.searchParams.delete("view");
  else url.searchParams.set("view", view);
  return `${url.pathname}${url.search}${url.hash}`;
}

function replaceViewInUrl(view: View, depth: number) {
  window.history.replaceState({ ...window.history.state, dvorikView: view, dvorikDepth: depth }, "", viewUrl(view));
}

function pushViewToUrl(view: View) {
  if (viewFromUrl() === view) return;
  const depth = historyDepth() + 1;
  window.history.pushState({ dvorikView: view, dvorikDepth: depth }, "", viewUrl(view));
}

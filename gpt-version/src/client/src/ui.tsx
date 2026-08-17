import { useEffect, useRef, useState, type ReactNode } from "react";

export type Tone = "neutral" | "good" | "warn" | "danger" | "info";

export function PageHeader({ title, description, meta, actions }: { title: string; description?: string; meta?: ReactNode; actions?: ReactNode }) {
  if (!meta && !actions) return null;
  return (
    <div className="page-header" aria-label={`${title}: действия`}>
      {meta && <div className="page-meta">{meta}</div>}
      {actions && <div className="header-actions">{actions}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className = "" }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-head">
          <div>
            {title && <h2>{title}</h2>}
          </div>
          {actions && <div className="inline-actions">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Metric({ title, value, detail, tone = "neutral" }: { title: string; value: ReactNode; detail?: ReactNode; tone?: Tone }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Notice({ tone = "info", children }: { tone?: Tone; children: ReactNode }) {
  const urgent = tone === "danger" || tone === "warn";
  return <div className={`notice ${tone}`} role={urgent ? "alert" : "status"} aria-live={urgent ? "assertive" : "polite"}>{children}</div>;
}

type ConfirmOptions = {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Extract<Tone, "danger" | "warn" | "info">;
};

type PendingConfirm = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

export function useConfirm() {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);

  const confirm = (options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    activeElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setPending({ ...options, resolve });
  });

  const close = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
    queueMicrotask(() => activeElementRef.current?.focus());
  };

  useEffect(() => {
    if (!pending) return;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pending]);

  const confirmDialog = pending ? (
    <div className="confirm-backdrop" role="presentation" onMouseDown={() => close(false)}>
      <div ref={dialogRef} className={`confirm-dialog ${pending.tone || "info"}`} role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={(event) => event.stopPropagation()}>
        <div>
          <h2 id="confirm-title">{pending.title}</h2>
          {pending.description && <p>{pending.description}</p>}
        </div>
        <div className="confirm-actions">
          <button ref={cancelRef} className="secondary" onClick={() => close(false)}>{pending.cancelLabel || "Отмена"}</button>
          <button className={pending.tone === "danger" ? "danger" : ""} onClick={() => close(true)}>{pending.confirmLabel || "Подтвердить"}</button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, confirmDialog };
}

export function Drawer({ open, title, onClose, children, className = "" }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string }) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { if (document.querySelector(".confirm-dialog")) return; event.preventDefault(); onCloseRef.current(); return; }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const controls = Array.from(drawerRef.current.querySelectorAll<HTMLElement>("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])"));
      if (!controls.length) return;
      const first = controls[0]; const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; queueMicrotask(() => openerRef.current?.focus()); };
  }, [open]);
  if (!open) return null;
  return <div className="drawer-backdrop" role="presentation" onMouseDown={onClose}>
    <aside ref={drawerRef} className={`app-drawer ${className}`} role="dialog" aria-modal="true" aria-labelledby="drawer-title" onMouseDown={(event) => event.stopPropagation()}>
      <header className="drawer-head"><h2 id="drawer-title">{title}</h2><button ref={closeRef} className="icon-button secondary" onClick={onClose} aria-label="Закрыть">×</button></header>
      <div className="drawer-body">{children}</div>
    </aside>
  </div>;
}

export function ActionMenu({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && detailsRef.current?.open) { if (document.querySelector(".confirm-dialog")) return; event.preventDefault(); detailsRef.current.open = false; summaryRef.current?.focus(); }
    };
    const onPointerDown = (event: MouseEvent) => {
      if (detailsRef.current?.open && event.target instanceof Node && !detailsRef.current.contains(event.target)) detailsRef.current.open = false;
    };
    document.addEventListener("keydown", onKeyDown); document.addEventListener("mousedown", onPointerDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.removeEventListener("mousedown", onPointerDown); };
  }, []);
  return <details ref={detailsRef} className={`action-menu ${className}`}><summary ref={summaryRef} aria-label={label}>⋯</summary><div className="action-menu-popover">{children}</div></details>;
}

export function EmptyState({ title = "Нет данных", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {description && <p>{description}</p>}
      {action && <div className="inline-actions">{action}</div>}
    </div>
  );
}

export function Skeleton() {
  return (
    <div className="stack">
      <div className="skeleton" />
      <div className="skeleton large" />
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export function Toolbar({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`toolbar ${className}`}>{children}</div>;
}

export type Column<T> = {
  key: string;
  header: string;
  render: (row: T, index: number) => ReactNode;
  className?: string;
};

export function DataTable<T>({ rows, columns, empty = "Нет данных" }: { rows: T[]; columns: Array<Column<T>>; empty?: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column.key} className={column.className}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => <td key={column.key} data-label={column.header} className={column.className}>{column.render(row, index)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function formatDateTime(value?: string) {
  if (!value) return "—";
  return new Date(value).toLocaleString("ru-RU");
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

export function shortId(value?: string) {
  if (!value) return "—";
  return value.length > 12 ? `${value.slice(0, 8)}...` : value;
}

export function toSearchText(parts: Array<unknown>) {
  return parts.map((part) => String(part ?? "").toLowerCase()).join(" ");
}

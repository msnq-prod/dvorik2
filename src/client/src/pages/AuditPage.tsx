import { useEffect, useMemo, useState } from "react";
import type { AuditEntry } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { DataTable, Metric, Notice, PageHeader, Panel, Skeleton, StatusBadge, Toolbar, formatBytes, formatDateTime, shortId, toSearchText, useConfirm } from "../ui";

type BackupFile = { name: string; bytes: number; createdAt: string };

export function AuditPage({ client, session }: PageProps) {
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("all");
  const [expandedId, setExpandedId] = useState("");
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const canRead = session.permissions.includes("techlog:read");
  const { confirm, confirmDialog } = useConfirm();

  const loadAudit = async () => {
    setLoadingAudit(true);
    setMessage("");
    try {
      setAudit(await client.request<AuditEntry[]>("/api/audit"));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoadingAudit(false);
    }
  };

  const loadBackups = async () => {
    setLoadingBackups(true);
    try {
      setBackups(await client.request<BackupFile[]>("/api/backups"));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoadingBackups(false);
    }
  };

  useEffect(() => {
    void loadAudit();
    void loadBackups();
  }, [client]);

  const filteredAudit = useMemo(() => audit.filter((entry) => {
    const matchesEntity = entity === "all" || entry.entity === entity;
    const matchesQuery = !q || toSearchText([entry.actorId, entry.entity, entry.entityId, entry.action, JSON.stringify(entry.changes)]).includes(q.toLowerCase());
    return matchesEntity && matchesQuery;
  }), [audit, entity, q]);

  const entities = [...new Set(audit.map((entry) => entry.entity))];

  const createBackup = async () => {
    setWorking(true);
    setMessage("");
    try {
      await client.request("/api/backups", { method: "POST" });
      setMessage("Резервная копия создана");
      await loadBackups();
      await loadAudit();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const restore = async (backup: BackupFile) => {
    const confirmed = await confirm({
      title: "Восстановить резервную копию?",
      description: `Текущее состояние будет заменено данными из ${backup.name}.`,
      confirmLabel: "Восстановить",
      tone: "danger"
    });
    if (!confirmed) return;
    setWorking(true);
    setMessage("");
    try {
      await client.request(`/api/backups/${encodeURIComponent(backup.name)}/restore`, { method: "POST" });
      setMessage("Резервная копия восстановлена");
      await loadBackups();
      await loadAudit();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if ((loadingAudit || loadingBackups) && !audit.length && !backups.length) return <Skeleton />;

  return (
    <>
      <section className="stack admin-page audit-page">
      <PageHeader title="Аудит" description="Журнал действий и резервные копии." actions={<button onClick={() => { void loadAudit(); void loadBackups(); }}>Обновить</button>} />
      {message && <Notice tone={message.includes("создан") || message.includes("восстанов") ? "good" : "danger"}>{message}</Notice>}
      {!canRead && <Notice tone="danger">Нет права `techlog:read`.</Notice>}

      <div className="metric-grid compact secondary-metrics">
        <Metric title="Событий показано" value={filteredAudit.length} detail="API возвращает последние 100" />
        <Metric title="Сущностей" value={entities.length} />
        <Metric title="Копий" value={backups.length} />
        <Metric title="Последняя копия" value={backups[0] ? formatDateTime(backups[0].createdAt) : "—"} />
      </div>

      <Panel title="Журнал действий" className="primary-panel">
        <Toolbar>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск по автору, сущности, объекту, изменениям" />
          <select value={entity} onChange={(event) => setEntity(event.target.value)}>
            <option value="all">Все сущности</option>
            {entities.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </Toolbar>
        {loadingAudit ? <Skeleton /> : (
          <DataTable
            rows={filteredAudit}
            empty="Событий нет"
            columns={[
              { key: "time", header: "Время", render: (row) => formatDateTime(row.createdAt) },
              { key: "actor", header: "Автор", render: (row) => row.actorId },
              { key: "entity", header: "Сущность", render: (row) => row.entity },
              { key: "object", header: "Объект", render: (row) => shortId(row.entityId) },
              { key: "action", header: "Действие", render: (row) => <StatusBadge tone="info">{row.action}</StatusBadge> },
              { key: "changes", header: "Изменения", render: (row) => expandedId === row.id ? <pre className="json-preview">{JSON.stringify(row.changes, null, 2)}</pre> : shortId(JSON.stringify(row.changes)) },
              { key: "details", header: "Детали", render: (row) => <button className="secondary small" onClick={() => setExpandedId(expandedId === row.id ? "" : row.id)}>{expandedId === row.id ? "Скрыть" : "Открыть"}</button> }
            ]}
          />
        )}
      </Panel>

      <Panel title="Резервные копии" className="secondary-panel" actions={<button onClick={createBackup} disabled={working}>Создать копию</button>}>
        {loadingBackups ? <Skeleton /> : (
          <DataTable
            rows={backups}
            empty="Резервных копий нет"
            columns={[
              { key: "file", header: "Файл", render: (row) => row.name },
              { key: "date", header: "Создан", render: (row) => formatDateTime(row.createdAt) },
              { key: "size", header: "Размер", render: (row) => formatBytes(row.bytes) },
              { key: "actions", header: "Действия", render: (row) => <button className="secondary small" onClick={() => restore(row)} disabled={working}>Восстановить</button> }
            ]}
          />
        )}
      </Panel>
      </section>
      {confirmDialog}
    </>
  );
}

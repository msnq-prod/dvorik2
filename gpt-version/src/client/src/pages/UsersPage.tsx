import { useEffect, useMemo, useState } from "react";
import type { EmployeeProfile, HrEvent, HrEventType, Role, User, UserStatus } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { permissionLabels, roleLabels, userStatusLabels } from "../constants";
import { ActionMenu, DataTable, Drawer, Field, Metric, Notice, PageHeader, Panel, Skeleton, StatusBadge, Toolbar, toSearchText, useConfirm } from "../ui";

export function UsersPage({ client, session }: PageProps) {
  const [section, setSection] = useState<"staff" | "events" | "permissions">("staff");
  const [users, setUsers] = useState<User[]>([]);
  const [profiles, setProfiles] = useState<EmployeeProfile[]>([]);
  const [hrEvents, setHrEvents] = useState<HrEvent[]>([]);
  const [profileForm, setProfileForm] = useState({ userId: "", personnelNumber: "", position: "Продавец", hiredOn: new Date().toISOString().slice(0, 10), status: "active" as EmployeeProfile["status"], dismissedOn: "" });
  const [hrForm, setHrForm] = useState({ userId: "", type: "vacation" as HrEventType, startDate: new Date().toISOString().slice(0, 10), endDate: new Date().toISOString().slice(0, 10), minutesLate: "", comment: "" });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | UserStatus>("all");
  const [role, setRole] = useState<"all" | Role>("all");
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [message, setMessage] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const canManage = session.permissions.includes("users:manage");
  const canRoles = session.permissions.includes("roles:manage");
  const canStaff = session.permissions.includes("staff:manage");
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextUsers, nextProfiles, nextHrEvents] = await Promise.all([
        client.request<User[]>("/api/users"),
        canStaff ? client.request<EmployeeProfile[]>("/api/staff/profiles") : Promise.resolve([]),
        canStaff ? client.request<HrEvent[]>("/api/hr-events") : Promise.resolve([])
      ]);
      setUsers(nextUsers);
      setProfiles(nextProfiles);
      setHrEvents(nextHrEvents);
      setProfileForm((value) => ({ ...value, userId: value.userId || nextUsers[0]?.id || "" }));
      setHrForm((value) => ({ ...value, userId: value.userId || nextUsers[0]?.id || "" }));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  const filteredUsers = useMemo(() => users.filter((user) => {
    const matchesQuery = !q || toSearchText([user.id, user.telegramUserId, user.firstName, user.lastName, user.username, user.role, user.status]).includes(q.toLowerCase());
    const matchesStatus = status === "all" || user.status === status;
    const matchesRole = role === "all" || user.role === role;
    return matchesQuery && matchesStatus && matchesRole;
  }), [q, role, status, users]);
  const selectedUser = users.find((user) => user.id === selectedUserId);
  const openUser = (user: User) => {
    setSelectedUserId(user.id);
    const current = profiles.find((item) => item.userId === user.id);
    setProfileForm(current ? { userId: user.id, personnelNumber: current.personnelNumber || "", position: current.position, hiredOn: current.hiredOn, status: current.status, dismissedOn: current.dismissedOn || "" } : { ...profileForm, userId: user.id });
  };

  const patchUser = async (user: User, patch: Partial<Pick<User, "status" | "role">>) => {
    const statusAction = patch.status === "blocked" ? "Пользователь будет заблокирован, все активные сессии будут немедленно отозваны." : patch.status === "archived" ? "Пользователь будет перемещён в архив и потеряет доступ." : patch.status === "rejected" ? "Запрос на доступ будет отклонён." : "Активные сессии пользователя будут отозваны.";
    const confirmed = await confirm({
      title: "Изменить пользователя?",
      description: `${user.firstName} ${user.lastName}. ${statusAction}`,
      confirmLabel: "Изменить",
      tone: patch.status === "blocked" || patch.status === "archived" || patch.status === "rejected" ? "danger" : "warn"
    });
    if (!confirmed) return;
    setWorkingId(user.id);
    setMessage("");
    try {
      await client.request<User>(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "idempotency-key": crypto.randomUUID() },
        body: JSON.stringify(patch)
      });
      setMessage("Пользователь обновлен");
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorkingId("");
    }
  };

  const saveProfile = async () => {
    const current = profiles.find((item) => item.userId === profileForm.userId);
    setMessage("");
    try {
      await client.request(`/api/staff/${profileForm.userId}/profile`, { method: "PUT", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ ...profileForm, dismissedOn: profileForm.dismissedOn || undefined, expectedVersion: current?.version }) });
      setMessage("Профиль сотрудника обновлен");
      await load();
    } catch (err) { setMessage((err as Error).message); }
  };

  const recordHrEvent = async () => {
    setMessage("");
    try {
      await client.request("/api/hr-events", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ ...hrForm, minutesLate: hrForm.type === "late" ? Number(hrForm.minutesLate) : undefined }) });
      setMessage("Кадровое событие записано");
      await load();
    } catch (err) { setMessage((err as Error).message); }
  };

  if (loading) return <Skeleton />;

  return (
    <>
      <section className="stack admin-page users-page">
      <PageHeader title="Пользователи" description="Доступ, роли и статусы сотрудников." actions={<button onClick={load}>Обновить</button>} />
      {message && <Notice tone={message.includes("обнов") ? "good" : "danger"}>{message}</Notice>}
      {!canManage && <Notice tone="danger">Нет права `users:manage`.</Notice>}

      <div className="section-tabs" role="tablist" aria-label="Разделы пользователей">
        <button className={section === "staff" ? "active" : "secondary"} onClick={() => setSection("staff")}>Сотрудники</button>
        {canStaff && <button className={section === "events" ? "active" : "secondary"} onClick={() => setSection("events")}>Кадровые события</button>}
        <button className={section === "permissions" ? "active" : "secondary"} onClick={() => setSection("permissions")}>Права ролей</button>
      </div>

      {section === "staff" && <><div className="metric-grid compact secondary-metrics">
        <Metric title="Всего" value={users.length} />
        <Metric title="Активные" value={users.filter((user) => user.status === "active").length} />
        <Metric title="Ожидают" value={users.filter((user) => user.status === "pending").length} />
        <Metric title="Заблокированы" value={users.filter((user) => user.status === "blocked").length} tone="warn" />
      </div>

      {users.some((user) => user.status === "pending") && <Panel title={`Ожидают подтверждения · ${users.filter((user) => user.status === "pending").length}`} className="attention-panel"><div className="pending-users">{users.filter((user) => user.status === "pending").map((user) => <button className="pending-user" key={user.id} onClick={() => openUser(user)}><strong>{user.firstName} {user.lastName}</strong><span>@{user.username || "без username"}</span><StatusBadge tone="warn">Требует решения</StatusBadge></button>)}</div></Panel>}

      <Panel title="Сотрудники" className="primary-panel">
        <Toolbar>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Поиск по имени, username, Telegram ID" />
          <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)}>
            <option value="all">Все статусы</option>
            {Object.entries(userStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="all">Все роли</option>
            {Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Toolbar>
        <DataTable
          rows={filteredUsers}
          empty="Пользователи не найдены"
          columns={[
            { key: "name", header: "Сотрудник", render: (row) => <button className="link-button" onClick={() => openUser(row)}>{row.firstName} {row.lastName}</button> },
            { key: "telegram", header: "Telegram", render: (row) => `@${row.username} · ${row.telegramUserId}` },
            { key: "role", header: "Роль", render: (row) => roleLabels[row.role] },
            { key: "status", header: "Статус", render: (row) => <StatusBadge tone={row.status === "active" ? "good" : row.status === "blocked" ? "danger" : "neutral"}>{userStatusLabels[row.status]}</StatusBadge> },
            { key: "actions", header: "Действия", render: (row) => <ActionMenu label={`Действия с ${row.firstName}`}><button className="secondary small" onClick={() => openUser(row)}>Открыть карточку</button></ActionMenu> }
          ]}
        />
      </Panel>

      </>}

      {section === "events" && canStaff && <Panel title="Кадровые события" description="Отпуск, больничный, опоздание, невыход и неполная смена без расчёта денег.">
        <div className="form-grid">
          <Field label="Сотрудник"><select value={hrForm.userId} onChange={(event) => setHrForm({ ...hrForm, userId: event.target.value })}>{users.map((user) => <option key={user.id} value={user.id}>{user.firstName} {user.lastName}</option>)}</select></Field>
          <Field label="Событие"><select value={hrForm.type} onChange={(event) => setHrForm({ ...hrForm, type: event.target.value as HrEventType })}>{Object.entries(hrEventLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="С"><input type="date" value={hrForm.startDate} onChange={(event) => setHrForm({ ...hrForm, startDate: event.target.value })} /></Field>
          <Field label="По"><input type="date" value={hrForm.endDate} onChange={(event) => setHrForm({ ...hrForm, endDate: event.target.value })} /></Field>
          {hrForm.type === "late" && <Field label="Минут опоздания"><input type="number" min="1" value={hrForm.minutesLate} onChange={(event) => setHrForm({ ...hrForm, minutesLate: event.target.value })} /></Field>}
          <Field label="Комментарий"><input value={hrForm.comment} onChange={(event) => setHrForm({ ...hrForm, comment: event.target.value })} /></Field>
        </div>
        <button onClick={recordHrEvent} disabled={!hrForm.userId}>Записать событие</button>
        <DataTable rows={hrEvents.slice(0, 30)} empty="Событий нет" columns={[
          { key: "employee", header: "Сотрудник", render: (row) => users.find((user) => user.id === row.userId)?.firstName || row.userId },
          { key: "type", header: "Событие", render: (row) => hrEventLabels[row.type] },
          { key: "dates", header: "Период", render: (row) => row.startDate === row.endDate ? row.startDate : `${row.startDate} — ${row.endDate}` },
          { key: "comment", header: "Комментарий", render: (row) => row.comment || "—" }
        ]} />
      </Panel>}

      {section === "permissions" && <Panel title="Права ролей">
        <div className="form-grid">
          {Object.entries(roleLabels).map(([value, label]) => (
            <div className="role-permissions" key={value}><strong>{label}</strong><div className="permission-tags">{(users.find((user) => user.role === value)?.permissions || []).map((permission) => <span key={permission}>{permissionLabels[permission]}</span>)}</div></div>
          ))}
        </div>
      </Panel>}
      <Drawer open={Boolean(selectedUser)} onClose={() => setSelectedUserId("")} title={selectedUser ? `${selectedUser.firstName} ${selectedUser.lastName}` : "Сотрудник"}>
        {selectedUser && <div className="stack">
          <div className="inline-actions"><StatusBadge tone={selectedUser.status === "active" ? "good" : selectedUser.status === "blocked" ? "danger" : "warn"}>{userStatusLabels[selectedUser.status]}</StatusBadge><span>{roleLabels[selectedUser.role]}</span></div>
          <div className="permission-tags">{selectedUser.permissions.map((permission) => <span key={permission}>{permissionLabels[permission] || "Дополнительное право"}</span>)}</div>
          {canRoles && <Field label="Роль"><select value={selectedUser.role} onChange={(event) => void patchUser(selectedUser, { role: event.target.value as Role })}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>}
          {canStaff && <><Field label="Табельный номер"><input value={profileForm.personnelNumber} onChange={(event) => setProfileForm({ ...profileForm, personnelNumber: event.target.value })} /></Field><Field label="Должность"><input value={profileForm.position} onChange={(event) => setProfileForm({ ...profileForm, position: event.target.value })} /></Field><Field label="Дата приёма"><input type="date" value={profileForm.hiredOn} onChange={(event) => setProfileForm({ ...profileForm, hiredOn: event.target.value })} /></Field><button onClick={saveProfile}>Сохранить профиль</button></>}
          <UserActions user={selectedUser} working={workingId === selectedUser.id} disabled={!canManage} canRoles={false} onStatus={(nextStatus) => patchUser(selectedUser, { status: nextStatus })} onRole={(nextRole) => patchUser(selectedUser, { role: nextRole })} />
        </div>}
      </Drawer>
      </section>
      {confirmDialog}
    </>
  );
}

const hrEventLabels: Record<HrEventType, string> = {
  vacation: "Отпуск", sick_leave: "Больничный", late: "Опоздание", no_show: "Невыход", partial_shift: "Неполная смена"
};

function UserActions({ user, working, disabled, canRoles, onStatus, onRole }: { user: User; working: boolean; disabled: boolean; canRoles: boolean; onStatus: (status: UserStatus) => void; onRole: (role: Role) => void }) {
  if (disabled) return <>—</>;
  return (
    <ActionMenu label={`Опасные действия с ${user.firstName}`}>
      {user.status !== "active" && <button className="secondary small" disabled={working} onClick={() => onStatus("active")}>Активировать</button>}
      {user.status === "active" && <button className="danger small" disabled={working} onClick={() => onStatus("blocked")}>Заблокировать</button>}
      {user.status === "pending" && <button className="danger-secondary small" disabled={working} onClick={() => onStatus("rejected")}>Отклонить</button>}
      {user.status !== "archived" && user.status !== "active" && <button className="danger-secondary small" disabled={working} onClick={() => onStatus("archived")}>В архив</button>}
      {canRoles && user.role !== "seller" && <button className="secondary small" disabled={working} onClick={() => onRole("seller")}>Сделать продавцом</button>}
      {canRoles && user.role !== "admin" && <button className="secondary small" disabled={working} onClick={() => onRole("admin")}>Сделать админом</button>}
    </ActionMenu>
  );
}

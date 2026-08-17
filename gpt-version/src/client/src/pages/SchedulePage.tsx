import { useEffect, useMemo, useState } from "react";
import type { Location, ScheduleDay, Shift, ShiftExchangeRequest, User } from "../../../shared/types";
import type { PageProps } from "../appTypes";
import { shiftStatusLabels } from "../constants";
import { ActionMenu, EmptyState, Field, Notice, Panel, Skeleton, useConfirm } from "../ui";

type ShiftForm = {
  date: string;
  locationId: string;
  employeeId: string;
  status: Shift["status"];
  comment: string;
  start: string;
  end: string;
};

type RotationPreview = {
  shifts: Array<Pick<Shift, "date" | "locationId" | "employeeIds">>;
  skippedClosedDays: string[];
  conflicts: Array<{ date: string; employeeId: string; shiftIds: string[] }>;
};
type ReplacementPreview = { replacements: Array<{ shiftId: string; date: string; locationId: string }>; conflicts: Array<{ shiftId: string; date: string; conflictShiftIds: string[] }> };

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function ownScheduledShiftOptions(shifts: Shift[], userId: string) {
  return shifts.filter((shift) => shift.employeeIds.includes(userId) && shift.status === "scheduled");
}

export function exchangeTargetShiftOptions(shifts: Shift[], userId: string) {
  return shifts.filter((shift) => shift.status === "scheduled" && !shift.employeeIds.includes(userId));
}

export function SwapShiftSelector({ shifts, userId, users, locations, value, onChange }: { shifts: Shift[]; userId: string; users: User[]; locations: Location[]; value: string; onChange: (value: string) => void }) {
  const ownShifts = ownScheduledShiftOptions(shifts, userId);
  if (ownShifts.length === 0) return <Notice tone="info">Нет своих смен для обмена.</Notice>;
  return <Field label="Моя смена">
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {ownShifts.map((shift) => <option key={shift.id} value={shift.id}>{shiftDisplayTitle(shift, users, locations)}</option>)}
    </select>
  </Field>;
}

export function SchedulePage({ client, session, intent, onIntentHandled }: PageProps) {
  const deferredScheduleToolsEnabled = false;
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [exchanges, setExchanges] = useState<ShiftExchangeRequest[]>([]);
  const today = toDateKey(new Date());
  const [focusDate, setFocusDate] = useState(today);
  const [selectedDate, setSelectedDate] = useState(today);
  const [locationFilter, setLocationFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [editingId, setEditingId] = useState("");
  const [shiftForm, setShiftForm] = useState<ShiftForm>({ date: today, locationId: "loc-counter", employeeId: "u-seller", status: "scheduled", comment: "", start: "10:00", end: "21:00" });
  const [swapForm, setSwapForm] = useState({ fromShiftId: "", toShiftId: "" });
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showSwapForm, setShowSwapForm] = useState(false);
  const [showRotationForm, setShowRotationForm] = useState(false);
  const [rotationForm, setRotationForm] = useState({ startDate: startOfMonthKey(today), endDate: endOfMonthKey(today), locationId: "loc-counter", employeeIds: ["u-seller"] });
  const [rotationPreview, setRotationPreview] = useState<RotationPreview | null>(null);
  const [showReplacementForm, setShowReplacementForm] = useState(false);
  const [replacementForm, setReplacementForm] = useState({ fromUserId: "u-seller", toUserId: "u-admin", startDate: today, endDate: endOfMonthKey(today) });
  const [replacementPreview, setReplacementPreview] = useState<ReplacementPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const canManage = session.permissions.includes("schedule:manage");
  const isSeller = session.user.role === "seller";
  const { confirm, confirmDialog } = useConfirm();

  const load = async () => {
    setLoading(true);
    setMessage("");
    try {
      const [nextShifts, nextDays, nextUsers, nextLocations, nextExchanges] = await Promise.all([
        client.request<Shift[]>("/api/schedule"),
        client.request<ScheduleDay[]>("/api/schedule/days"),
        client.request<User[]>("/api/staff"),
        client.request<Location[]>("/api/locations"),
        client.request<ShiftExchangeRequest[]>("/api/schedule/exchanges")
      ]);
      setShifts(nextShifts);
      setScheduleDays(nextDays);
      setUsers(nextUsers);
      setLocations(nextLocations);
      setSwapForm((value) => ({
        fromShiftId: value.fromShiftId || ownScheduledShiftOptions(nextShifts, session.user.id)[0]?.id || "",
        toShiftId: value.toShiftId || exchangeTargetShiftOptions(nextShifts, session.user.id)[0]?.id || ""
      }));
      setShiftForm((value) => ({
        ...value,
        locationId: value.locationId || nextLocations[0]?.id || "",
        employeeId: value.employeeId || nextUsers.find((user) => user.status === "active")?.id || ""
      }));
      setExchanges(nextExchanges);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [client]);

  useEffect(() => {
    if (typeof intent !== "string" || !intent.startsWith("schedule-date:")) return;
    const date = intent.slice("schedule-date:".length);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setFocusDate(date);
      setSelectedDate(date);
    }
    onIntentHandled?.();
  }, [intent, onIntentHandled]);

  useEffect(() => {
    if (selectedDate.slice(0, 7) !== focusDate.slice(0, 7)) {
      setSelectedDate(startOfMonthKey(focusDate));
    }
  }, [focusDate, selectedDate]);

  const monthCells = useMemo(() => buildMonthCells(focusDate), [focusDate]);
  const monthShifts = useMemo(() => shifts
    .filter((shift) => {
      if (isSeller && !shift.employeeIds.includes(session.user.id)) return false;
      if (locationFilter !== "all" && shift.locationId !== locationFilter) return false;
      if (!isSeller && employeeFilter !== "all" && !shift.employeeIds.includes(employeeFilter)) return false;
      return shift.date.slice(0, 7) === focusDate.slice(0, 7);
    })
    .sort(compareShift), [employeeFilter, focusDate, locationFilter, shifts]);
  const shiftsByDate = useMemo(() => groupByDate(monthShifts), [monthShifts]);
  const closedDays = useMemo(() => new Set(scheduleDays.filter((day) => day.status === "closed").map((day) => `${day.date}:${day.locationId}`)), [scheduleDays]);
  const ownScheduledShifts = ownScheduledShiftOptions(shifts, session.user.id);
  const selectedDayShifts = shifts.filter((shift) => shift.date === selectedDate && (locationFilter === "all" || shift.locationId === locationFilter) && (!isSeller || shift.employeeIds.includes(session.user.id)));
  const incomingExchanges = exchanges.filter((exchange) => exchange.status === "pending" && exchange.toUserId === session.user.id);
  const hasActionPanel = (canManage && showShiftForm) || showSwapForm;
  const staffOptions = users.filter((user) => user.status === "active");
  const nextOwnShift = ownScheduledShifts.filter((shift) => shift.date >= today).sort(compareShift)[0];
  const canOfferSwap = ownScheduledShifts.length > 0 && exchangeTargetShiftOptions(shifts, session.user.id).length > 0;

  const openCreateShift = (date = selectedDate) => {
    setEditingId("");
    setShiftForm((value) => ({
      ...value,
      date,
      locationId: value.locationId || locations[0]?.id || "",
      employeeId: value.employeeId || staffOptions[0]?.id || ""
    }));
    setShowShiftForm(true);
    setShowSwapForm(false);
  };

  const moveMonth = (delta: number) => {
    const next = addMonths(focusDate, delta);
    setFocusDate(next);
    setSelectedDate(next);
  };

  const jumpToDate = (date: string) => {
    if (!date) return;
    setFocusDate(date);
    setSelectedDate(date);
  };

  const createOrUpdateShift = async () => {
    setWorking(true);
    setMessage("");
    const payload = {
      ...shiftForm,
      start: shiftForm.start,
      end: shiftForm.end,
      employeeIds: [shiftForm.employeeId]
    };
    try {
      if (editingId) {
        await client.request(`/api/schedule/${editingId}`, { method: "PATCH", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(payload) });
        setMessage("Смена обновлена");
      } else {
        await client.request("/api/schedule", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(payload) });
        setMessage("Смена создана");
      }
      setEditingId("");
      setShowShiftForm(false);
      setSelectedDate(shiftForm.date);
      setFocusDate(shiftForm.date);
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const createSwap = async () => {
    setWorking(true);
    setMessage("");
    try {
      await client.request("/api/schedule/exchanges", { method: "POST", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify(swapForm) });
      setMessage("Заявка создана");
      setShowSwapForm(false);
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const setDayStatus = async (status: ScheduleDay["status"]) => {
    const locationId = locationFilter === "all" ? locations[0]?.id : locationFilter;
    if (!locationId) return;
    if (status === "closed") {
      const approved = await confirm({ title: "Закрыть выбранный день?", description: "Назначенные смены не будут отменены. Сначала перенесите или отмените их.", confirmLabel: "Закрыть день", tone: "danger" });
      if (!approved) return;
    }
    setWorking(true);
    setMessage("");
    try {
      await client.request(`/api/schedule/days/${selectedDate}/${locationId}`, { method: "PUT", headers: { "idempotency-key": crypto.randomUUID() }, body: JSON.stringify({ status }) });
      setMessage(status === "closed" ? "День закрыт" : "День открыт");
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const previewRotation = async () => {
    setWorking(true);
    setMessage("");
    try {
      const preview = await client.request<RotationPreview>("/api/schedule/rotation/preview", { method: "POST", body: JSON.stringify(rotationForm) });
      setRotationPreview(preview);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const commitRotation = async () => {
    setWorking(true);
    setMessage("");
    try {
      const result = await client.request<{ shiftIds: string[] }>("/api/schedule/rotation/commit", { method: "POST", body: JSON.stringify({ ...rotationForm, idempotencyKey: `rotation-ui-${Date.now()}` }) });
      setMessage(`Создано смен: ${result.shiftIds.length}`);
      setRotationPreview(null);
      setShowRotationForm(false);
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const exportSchedule = (format: "csv" | "pdf") => {
    const location = locationFilter === "all" ? "" : `&locationId=${encodeURIComponent(locationFilter)}`;
    window.open(`/api/schedule/export?format=${format}&from=${startOfMonthKey(focusDate)}&to=${endOfMonthKey(focusDate)}${location}`, "_blank", "noopener,noreferrer");
  };

  const previewReplacement = async () => {
    setWorking(true); setMessage("");
    try { setReplacementPreview(await client.request<ReplacementPreview>("/api/schedule/future-replacement/preview", { method: "POST", body: JSON.stringify(replacementForm) })); }
    catch (err) { setMessage((err as Error).message); } finally { setWorking(false); }
  };
  const commitReplacement = async () => {
    setWorking(true); setMessage("");
    try { const result = await client.request<ReplacementPreview>("/api/schedule/future-replacement/commit", { method: "POST", body: JSON.stringify({ ...replacementForm, idempotencyKey: `replace-ui-${Date.now()}` }) }); setMessage(`Заменено смен: ${result.replacements.length}`); setReplacementPreview(null); setShowReplacementForm(false); await load(); }
    catch (err) { setMessage((err as Error).message); } finally { setWorking(false); }
  };

  const updateSwap = async (id: string, action: "accept" | "decline" | "cancel") => {
    setWorking(true);
    setMessage("");
    try {
      await client.request(`/api/schedule/exchanges/${id}/${action}`, { method: "POST", headers: { "idempotency-key": crypto.randomUUID() } });
      setMessage(action === "accept" ? "Обмен принят" : action === "decline" ? "Обмен отклонен" : "Заявка отменена");
      await load();
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Skeleton />;

  return (
    <><section className="stack schedule-page">
      <div className="schedule-actions">
        {canManage && <button onClick={() => openCreateShift()}>Назначить смену</button>}
        {deferredScheduleToolsEnabled && canManage && <button className="secondary" onClick={() => { setShowRotationForm(true); setShowShiftForm(false); setShowSwapForm(false); }}>Сгенерировать график</button>}
        {deferredScheduleToolsEnabled && canManage && <button className="secondary" onClick={() => { setShowReplacementForm(true); setShowShiftForm(false); setShowSwapForm(false); }}>Заменить сотрудника</button>}
        {canManage && <ActionMenu className="export-menu" label="Экспорт"><button className="secondary" onClick={() => exportSchedule("csv")}>CSV</button><button className="secondary" onClick={() => exportSchedule("pdf")}>PDF</button></ActionMenu>}
        {isSeller && canOfferSwap && <button onClick={() => { setShowSwapForm(true); setShowShiftForm(false); }}>Обменяться</button>}
      </div>
      {message && <Notice tone={message.includes("создан") || message.includes("обнов") || message.includes("принят") || message.includes("отклон") || message.includes("отмен") ? "good" : "danger"}>{message}</Notice>}
      {isSeller && (nextOwnShift ? <Panel className="next-shift" title="Ближайшая смена"><strong>{formatShortDate(nextOwnShift.date)} · {nextOwnShift.start}–{nextOwnShift.end}</strong><span>{locationName(nextOwnShift.locationId, locations)}</span></Panel> : <EmptyState title="Ближайших смен нет" description="Новые назначения появятся здесь." />)}

      {incomingExchanges.length > 0 && (
        <Panel title="Предложения обмена">
          <div className="swap-offer-list">
            {incomingExchanges.map((swap) => {
              return (
                <article className="swap-offer" key={swap.id}>
                  <div>
                    <strong>От {userName(swap.fromUserId, users)}</strong>
                    <span>Обмен {shiftTitleById(swap.fromShiftId, shifts, users, locations)} на вашу смену</span>
                    {swap.warnings.length > 0 && <span>Предупреждения: {swap.warnings.join("; ")}</span>}
                  </div>
                  <div className="inline-actions nowrap">
                    <button className="small" disabled={working} onClick={() => updateSwap(swap.id, "accept")}>Принять</button>
                    <button className="secondary small" disabled={working} onClick={() => updateSwap(swap.id, "decline")}>Отклонить</button>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel title="Календарь месяца" className="schedule-panel">
        <div className="schedule-monthbar">
          <div className="month-switcher">
            <button className="secondary icon-button" aria-label="Предыдущий месяц" onClick={() => moveMonth(-1)}>‹</button>
            <div>
              <strong>{formatMonthTitle(focusDate)}</strong>
            </div>
            <button className="secondary icon-button" aria-label="Следующий месяц" onClick={() => moveMonth(1)}>›</button>
          </div>
          <div className="schedule-filters">
            {!isSeller && <select value={locationFilter} onChange={(event) => setLocationFilter(event.target.value)}>
              <option value="all">Все точки</option>
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>}
            {!isSeller && <select value={employeeFilter} onChange={(event) => setEmployeeFilter(event.target.value)}>
              <option value="all">Все сотрудники</option>
              {users.map((user) => <option key={user.id} value={user.id}>{userName(user.id, users)}</option>)}
            </select>}
          </div>
        </div>

        <div className="month-weekdays">
          {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="month-calendar" role="grid">
          {monthCells.map((cell) => {
            const dayShifts = shiftsByDate[cell.date] || [];
            const isClosed = locationFilter !== "all" && closedDays.has(`${cell.date}:${locationFilter}`);
            const className = [
              "month-day",
              cell.inMonth ? "" : "outside",
              cell.date === today ? "today" : "",
              cell.date === selectedDate ? "selected" : "",
              isClosed ? "closed" : ""
            ].filter(Boolean).join(" ");
            return (
              <button
                type="button"
                className={className}
                key={cell.date}
                onClick={() => jumpToDate(cell.date)}
                aria-label={`${cell.date}, смен: ${dayShifts.length}`}
              >
                <span className="month-day-head">
                  <strong>{cell.day}</strong>
                  {isClosed && <small>Закрыто</small>}
                </span>
                <span className="month-day-shifts">
                  {dayShifts.slice(0, 2).map((shift) => (
                    <span className={`month-shift-chip ${shift.status}`} key={shift.id}>
                      <span>{compactUserList(shift.employeeIds, users)}</span>
                    </span>
                  ))}
                  {dayShifts.length > 2 && <span className="month-more">+{dayShifts.length - 2}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </Panel>

      <Panel title={`День: ${formatShortDate(selectedDate)}`} description={selectedDayShifts.length ? "Назначения и точки выбранной даты." : "Назначений на выбранную дату нет."}>
        {selectedDayShifts.length ? selectedDayShifts.map((shift) => <div className="swap-offer" key={shift.id}><div><strong>{locationName(shift.locationId, locations)} · {shift.start}–{shift.end}</strong><span>{shortUserList(shift.employeeIds, users)} · {shiftStatusLabels[shift.status]}</span>{shift.comment && <span>{shift.comment}</span>}</div>{canManage && <button className="secondary small" onClick={() => { setEditingId(shift.id); setShiftForm({ date: shift.date, locationId: shift.locationId, employeeId: shift.employeeIds[0] || "", status: shift.status, comment: shift.comment, start: shift.start, end: shift.end }); setShowShiftForm(true); }}>Изменить</button>}</div>) : <EmptyState title={isSeller ? "У вас нет смен в этот день" : "Смен нет"} action={canManage ? <button onClick={() => openCreateShift(selectedDate)}>Назначить смену</button> : undefined} />}
      </Panel>

      {canManage && locations.length > 0 && (
        <Panel title="Статус дня" description="Закрытие не отменяет назначенные смены: сначала перенесите или отмените их.">
          <div className="inline-actions">
            <span>{formatShortDate(selectedDate)} · {locationName(locationFilter === "all" ? locations[0].id : locationFilter, locations)}</span>
            <button className="secondary" disabled={working} onClick={() => setDayStatus("working")}>Открыть</button>
            <button className="danger" disabled={working} onClick={() => setDayStatus("closed")}>Закрыть</button>
          </div>
        </Panel>
      )}

      {deferredScheduleToolsEnabled && canManage && showRotationForm && (
        <Panel title="Генерация графика" description="Сначала preview: существующие назначения не удаляются.">
          <div className="form-grid">
            <Field label="С"><input type="date" value={rotationForm.startDate} onChange={(event) => setRotationForm({ ...rotationForm, startDate: event.target.value })} /></Field>
            <Field label="По"><input type="date" value={rotationForm.endDate} onChange={(event) => setRotationForm({ ...rotationForm, endDate: event.target.value })} /></Field>
            <Field label="Точка"><select value={rotationForm.locationId} onChange={(event) => setRotationForm({ ...rotationForm, locationId: event.target.value })}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
            <Field label="Цикл сотрудников"><select multiple size={Math.min(4, Math.max(2, staffOptions.length))} value={rotationForm.employeeIds} onChange={(event) => setRotationForm({ ...rotationForm, employeeIds: Array.from(event.currentTarget.selectedOptions, (option) => option.value) })}>{staffOptions.map((user) => <option key={user.id} value={user.id}>{userName(user.id, users)}</option>)}</select></Field>
          </div>
          <div className="inline-actions"><button disabled={working} onClick={previewRotation}>Показать preview</button><button className="secondary" onClick={() => { setRotationPreview(null); setShowRotationForm(false); }}>Отмена</button></div>
          {rotationPreview && <div className="stack compact"><Notice tone={rotationPreview.conflicts.length ? "danger" : "info"}>Будет создано: {rotationPreview.shifts.length}; закрытых дней: {rotationPreview.skippedClosedDays.length}; конфликтов: {rotationPreview.conflicts.length}</Notice><button disabled={working || rotationPreview.conflicts.length > 0 || rotationPreview.shifts.length === 0} onClick={commitRotation}>Подтвердить генерацию</button></div>}
        </Panel>
      )}

      {deferredScheduleToolsEnabled && canManage && showReplacementForm && (
        <Panel title="Будущая замена" description="Сначала preview; конфликтующие смены не будут изменены.">
          <div className="form-grid"><Field label="Кого"><select value={replacementForm.fromUserId} onChange={(event) => setReplacementForm({ ...replacementForm, fromUserId: event.target.value })}>{staffOptions.map((user) => <option key={user.id} value={user.id}>{userName(user.id, users)}</option>)}</select></Field><Field label="На кого"><select value={replacementForm.toUserId} onChange={(event) => setReplacementForm({ ...replacementForm, toUserId: event.target.value })}>{staffOptions.filter((user) => user.id !== replacementForm.fromUserId).map((user) => <option key={user.id} value={user.id}>{userName(user.id, users)}</option>)}</select></Field><Field label="С"><input type="date" value={replacementForm.startDate} onChange={(event) => setReplacementForm({ ...replacementForm, startDate: event.target.value })} /></Field><Field label="По"><input type="date" value={replacementForm.endDate} onChange={(event) => setReplacementForm({ ...replacementForm, endDate: event.target.value })} /></Field></div>
          <div className="inline-actions"><button disabled={working} onClick={previewReplacement}>Показать preview</button><button className="secondary" onClick={() => { setReplacementPreview(null); setShowReplacementForm(false); }}>Отмена</button></div>
          {replacementPreview && <div className="stack compact"><Notice tone={replacementPreview.conflicts.length ? "danger" : "info"}>Будет заменено: {replacementPreview.replacements.length}; конфликтов: {replacementPreview.conflicts.length}</Notice><button disabled={working || replacementPreview.conflicts.length > 0 || replacementPreview.replacements.length === 0} onClick={commitReplacement}>Подтвердить замену</button></div>}
        </Panel>
      )}

      {hasActionPanel && (
      <div className="stack">
        {canManage && showShiftForm && (
          <Panel title={editingId ? "Редактирование смены" : "Назначение смены"} actions={<button className="secondary small" onClick={() => { setEditingId(""); setShowShiftForm(false); }}>Скрыть</button>}>
            <Field label="Дата"><input type="date" value={shiftForm.date} onChange={(event) => setShiftForm({ ...shiftForm, date: event.target.value })} /></Field>
            <Field label="Точка"><select value={shiftForm.locationId} onChange={(event) => setShiftForm({ ...shiftForm, locationId: event.target.value })}>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field>
            <Field label="Продавец">
              <select value={shiftForm.employeeId} onChange={(event) => setShiftForm({ ...shiftForm, employeeId: event.target.value })}>
                {staffOptions.map((user) => <option key={user.id} value={user.id}>{userName(user.id, users)}</option>)}
              </select>
            </Field>
            <Field label="Статус"><select value={shiftForm.status} onChange={(event) => setShiftForm({ ...shiftForm, status: event.target.value as Shift["status"] })}>{Object.entries(shiftStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
            <Field label="Начало"><input type="time" value={shiftForm.start} onChange={(event) => setShiftForm({ ...shiftForm, start: event.target.value })} /></Field>
            <Field label="Окончание"><input type="time" value={shiftForm.end} onChange={(event) => setShiftForm({ ...shiftForm, end: event.target.value })} /></Field>
            <Field label="Комментарий"><input value={shiftForm.comment} onChange={(event) => setShiftForm({ ...shiftForm, comment: event.target.value })} /></Field>
            <div className="inline-actions">
              <button onClick={createOrUpdateShift} disabled={working || !shiftForm.employeeId}>{editingId ? "Сохранить" : "Назначить"}</button>
              {editingId && <button className="secondary" onClick={() => { setEditingId(""); setShowShiftForm(false); }}>Отмена</button>}
            </div>
          </Panel>
        )}

        {showSwapForm && (
        <Panel title="Обмен двумя сменами" description="Выберите свою смену и смену коллеги. После принятия назначения поменяются местами." actions={<button className="secondary small" onClick={() => setShowSwapForm(false)}>Скрыть</button>}>
          {ownScheduledShifts.length === 0 ? <SwapShiftSelector shifts={shifts} userId={session.user.id} users={users} locations={locations} value={swapForm.fromShiftId} onChange={() => undefined} /> : <>
            <SwapShiftSelector shifts={shifts} userId={session.user.id} users={users} locations={locations} value={swapForm.fromShiftId} onChange={(fromShiftId) => setSwapForm({ ...swapForm, fromShiftId })} />
            <Field label="Смена коллеги">
              <select value={swapForm.toShiftId} onChange={(event) => setSwapForm({ ...swapForm, toShiftId: event.target.value })}>
                {exchangeTargetShiftOptions(shifts, session.user.id).map((shift) => <option key={shift.id} value={shift.id}>{shiftDisplayTitle(shift, users, locations)}</option>)}
              </select>
            </Field>
            <button disabled={working || !swapForm.fromShiftId || !swapForm.toShiftId} onClick={createSwap}>Предложить обмен</button>
          </>}
        </Panel>
        )}
      </div>
      )}

    </section>{confirmDialog}</>
  );
}

function groupByDate(shifts: Shift[]) {
  return shifts.reduce<Record<string, Shift[]>>((acc, shift) => {
    acc[shift.date] ||= [];
    acc[shift.date].push(shift);
    return acc;
  }, {});
}

function compareShift(a: Shift, b: Shift) {
  return `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`);
}

function userName(id: string, users: User[]) {
  const user = users.find((item) => item.id === id);
  return user ? `${user.firstName} ${user.lastName}` : id;
}

function shortUserName(id: string, users: User[]) {
  const user = users.find((item) => item.id === id);
  if (!user) return id;
  return user.lastName ? `${user.firstName} ${user.lastName.slice(0, 1)}.` : user.firstName;
}

function shortUserList(ids: string[], users: User[]) {
  return ids.length ? ids.map((id) => shortUserName(id, users)).join(", ") : "Без сотрудника";
}

function compactUserName(id: string, users: User[]) {
  const user = users.find((item) => item.id === id);
  if (!user) return id.slice(0, 4);
  const first = user.firstName.slice(0, 3);
  const last = user.lastName.slice(0, 1);
  return last ? `${first} ${last}` : first;
}

function compactUserList(ids: string[], users: User[]) {
  return ids.length ? ids.map((id) => compactUserName(id, users)).join(", ") : "";
}

function locationName(id: string, locations: Location[]) {
  return locations.find((item) => item.id === id)?.name || id;
}

function shiftDisplayTitle(shift: Shift, users: User[], locations: Location[]) {
  return `${shift.date} · ${shortUserList(shift.employeeIds, users)} · ${locationName(shift.locationId, locations)}`;
}

function shiftTitleById(id: string, shifts: Shift[], users: User[], locations: Location[]) {
  const shift = shifts.find((item) => item.id === id);
  return shift ? shiftDisplayTitle(shift, users, locations) : id;
}

function formatShortDate(value: string) {
  return parseDate(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonthKey(value: string) {
  const date = parseDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
}

function endOfMonthKey(value: string) {
  const date = parseDate(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, "0")}`;
}

function addMonths(value: string, delta: number) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(year, month - 1 + delta, 1);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(day || 1, maxDay));
  return toDateKey(next);
}

function buildMonthCells(value: string) {
  const first = parseDate(startOfMonthKey(value));
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  const month = first.getMonth();
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return {
      date: toDateKey(date),
      day: date.getDate(),
      inMonth: date.getMonth() === month
    };
  });
}

function formatMonthTitle(value: string) {
  return parseDate(value).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
}

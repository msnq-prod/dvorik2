import type { Permission, ProductStatus, Role, Shift, StockOperationType, UserStatus } from "../../shared/types";

export const operationLabels: Record<string, string> = {
  receipt: "Приход",
  transfer: "Перемещение",
  write_off: "Списание",
  inventory_adjustment: "Инвентаризация",
  correction: "Корректировка",
  reversal: "Отмена",
  merge: "Объединение"
};

export const operationTone: Record<string, "good" | "warn" | "danger" | "neutral"> = {
  receipt: "good",
  transfer: "neutral",
  write_off: "warn",
  inventory_adjustment: "warn",
  correction: "warn",
  reversal: "danger",
  merge: "neutral"
};

export const stockOperationOptions: Array<{ value: StockOperationType; label: string }> = [
  { value: "receipt", label: "Приход" },
  { value: "transfer", label: "Перемещение" },
  { value: "write_off", label: "Списание" },
  { value: "correction", label: "Корректировка" }
];

export const roleLabels: Record<Role, string> = {
  seller: "Продавец",
  admin: "Админ",
  super_admin: "Суперадмин"
};

export const userStatusLabels: Record<UserStatus, string> = {
  pending: "Ожидает",
  active: "Активен",
  blocked: "Заблокирован",
  rejected: "Отклонен",
  archived: "Архив"
};

export const productStatusLabels: Record<ProductStatus, string> = {
  active: "Активен",
  archived: "Архив",
  deleted: "Удален"
};

export const shiftStatusLabels: Record<Shift["status"], string> = {
  draft: "Черновик",
  scheduled: "Запланирована",
  in_progress: "Идет",
  completed: "Завершена",
  cancelled: "Отменена"
};

export const importStatusLabels: Record<string, string> = {
  previewed: "Проверен",
  committed: "Применен",
  reverted: "Отменен",
  failed: "Ошибка"
};

export const mergeStatusLabels: Record<string, string> = {
  previewed: "Проверен",
  committed: "Объединен",
  reverted: "Отменен"
};

export const reportProductStatusLabels: Record<string, string> = {
  active: "Активен",
  archived: "Архив",
  deleted: "Удалён"
};

export const permissionLabels: Record<Permission, string> = {
  "products:read": "Товары: просмотр",
  "products:write": "Товары: запись",
  "products:scan_manage": "Сканер: каталог",
  "stock:move": "Склад: движения",
  "inventory:write": "Инвентаризация",
  "reports:read": "Отчеты",
  "imports:write": "Импорт",
  "merge:write": "Дубли",
  "schedule:manage": "График",
  "staff:manage": "Кадровые события",
  "saby:manage": "Интеграция Saby",
  "users:manage": "Пользователи",
  "roles:manage": "Роли",
  "techlog:read": "Аудит",
  "labels:print": "Маркировки"
};

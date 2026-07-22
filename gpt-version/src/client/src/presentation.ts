import type { Product, ProductIdentifier } from "../../shared/types";

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

export const notificationLabels: Record<string, string> = {
  shift_swap_accepted: "Обмен сменами принят",
  shift_swap_declined: "Обмен сменами отклонён",
  shift_swap_requested: "Предложен обмен сменами",
  low_stock: "Заканчивается товар",
  zero_stock: "Товар закончился",
  inventory_reminder: "Нужно завершить проверку"
};

export const identifierTypeLabels: Record<ProductIdentifier["type"], string> = {
  supplier_article: "Артикул поставщика",
  barcode: "Штрихкод",
  legacy_article: "Артикул",
  other: "Идентификатор"
};

export function formatNumber(value: number) {
  return numberFormatter.format(value);
}

export function formatProductQuantity(product: Pick<Product, "inventoryKind" | "packageMassGrams" | "unit"> | undefined, quantity: number) {
  if (!product) return `${formatNumber(quantity)} ед.`;
  if (product.inventoryKind === "weight") {
    const packs = `${formatNumber(quantity)} ${plural(quantity, "пачка", "пачки", "пачек")}`;
    const totalKilograms = product.packageMassGrams ? quantity * product.packageMassGrams / 1000 : 0;
    return totalKilograms > 0 ? `${packs} · ${formatNumber(totalKilograms)} кг` : packs;
  }
  return `${formatNumber(quantity)} ${product.unit}`;
}

export function formatProductKind(product: Pick<Product, "inventoryKind" | "packageMassGrams" | "unit">) {
  if (product.inventoryKind !== "weight" && product.unit !== "кг") return "Штучный";
  return product.packageMassGrams ? `Весовой · пачка ${formatNumber(product.packageMassGrams)} г` : "Весовой";
}

export function formatIdentifiers(product: Pick<Product, "identifiers">, withLabels = false) {
  if (!product.identifiers.length) return "Без артикула";
  return product.identifiers
    .slice(0, 2)
    .map((identifier) => withLabels ? `${identifierTypeLabels[identifier.type]}: ${identifier.value}` : identifier.value)
    .join(" · ");
}

export function safeLabel(labels: Record<string, string>, value: string, fallback = "Неизвестный статус") {
  return labels[value] || fallback;
}

function plural(value: number, one: string, few: string, many: string) {
  const integer = Math.abs(Math.trunc(value));
  const mod100 = integer % 100;
  const mod10 = integer % 10;
  if (mod100 >= 11 && mod100 <= 19) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

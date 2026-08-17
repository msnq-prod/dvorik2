export type EventProducer = "platform" | "warehouse" | "staff" | "cash" | "company";

export type DomainEventEnvelope<TType extends string = string, TPayload = Record<string, unknown>> = Readonly<{
  eventId: string;
  eventType: TType;
  eventVersion: 1;
  producer: EventProducer;
  aggregateId: string;
  occurredAt: string;
  payload: TPayload;
}>;

export type CashStockDeltaPayload = Readonly<{
  externalSaleKey: string;
  externalLineKey: string;
  revision: string;
  productId: string;
  quantityPackageMilli: number;
  revenueDeltaKopecks: number;
  isReturn: boolean;
}>;

export type CashRevenueDeltaPayload = Readonly<{
  externalSaleKey: string;
  revision: string;
  productId?: string;
  revenueDeltaKopecks: number;
  completeness: "complete" | "partial";
}>;

export type CashExceptionPayload = Readonly<{
  code: "UNMAPPED_PRODUCT" | "NEGATIVE_STOCK" | "COST_BASIS_MISSING" | "DELIVERY_FAILED";
  externalSaleKey: string;
  externalLineKey?: string;
  productId?: string;
}>;

export type CashEvent =
  | DomainEventEnvelope<"SaleStockDelta", CashStockDeltaPayload>
  | DomainEventEnvelope<"SaleRevenueDelta", CashRevenueDeltaPayload>
  | DomainEventEnvelope<"SaleVoided", CashRevenueDeltaPayload>
  | DomainEventEnvelope<"ReturnRecorded", CashStockDeltaPayload>
  | DomainEventEnvelope<"CashExceptionRaised", CashExceptionPayload>;

export type WarehouseProfitabilityUpdatedPayload = Readonly<{
  productId: string;
  actualRevenueKopecks: number;
  actualCostKopecks: number;
  completeness: "complete" | "partial" | "unavailable";
  sourceUpdatedAt: string;
}>;

export type WarehouseEvent =
  | DomainEventEnvelope<"SupplyAccepted", Readonly<{ supplyId: string; lotIds: readonly string[] }>>
  | DomainEventEnvelope<"StockChanged", Readonly<{ productId: string; quantityPackageMilliDelta: number; accountingQuantityMinorDelta: number; reason: "supply" | "sale" | "return" }>>
  | DomainEventEnvelope<"LotConsumed", Readonly<{ productId: string; sourceEventId: string; quantityPackageMilli: number; costKopecks: number }>>
  | DomainEventEnvelope<"CostRecognized", Readonly<{ productId: string; sourceEventId: string; costDeltaKopecks: number }>>
  | DomainEventEnvelope<"ProductProfitabilityUpdated", WarehouseProfitabilityUpdatedPayload>;

export type StaffSnapshotUpdatedPayload = Readonly<{
  activeEmployees: number;
  scheduledShifts: number;
  pendingExchanges: number;
  sourceUpdatedAt: string;
}>;

export type StaffEvent =
  DomainEventEnvelope<"StaffSnapshotUpdated", StaffSnapshotUpdatedPayload>;

export type EventDeliveryResult = Readonly<{
  eventId: string;
  status: "applied" | "duplicate" | "requires_action";
  code?: string;
}>;

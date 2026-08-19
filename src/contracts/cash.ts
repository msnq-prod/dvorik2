export type CashAvailability = "connected" | "degraded" | "disabled";

export type CashStatus = Readonly<{
  availability: CashAvailability;
  enabled: boolean;
  pointId?: number;
  pendingSignals?: number;
  pendingEvents?: number;
  failedEvents?: number;
  requiresActionEvents?: number;
  oldestPendingAt?: string;
  lastSuccessAt?: string;
  lastErrorCode?: string;
}>;

export type ProductProfitability = Readonly<{
  productId: string;
  estimated: {
    availability: "available" | "unavailable";
    salePriceKopecks?: number;
    costPerPackageKopecks?: number;
    marginPerPackageKopecks?: number;
  };
  actual: {
    availability: "available" | "partial" | "unavailable";
    revenueKopecks?: number;
    costKopecks?: number;
    marginKopecks?: number;
  };
}>;

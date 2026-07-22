/**
 * First-production release allowlist. Deferred features must be stopped at the
 * boundary, not merely hidden by permissions or an unfinished UI control.
 */
export type DeferredLaunchFeature =
  | "tablet_buffer"
  | "imports"
  | "merge"
  | "archive_sweep"
  | "schedule_rotation"
  | "future_replacement"
  | "external_media_url"
  | "telegram_report_delivery";

const routeMatchers: readonly Readonly<{ feature: DeferredLaunchFeature; matches(path: string): boolean }>[] = [
  { feature: "tablet_buffer", matches: (path) => path === "/api/stock/buffer/apply" },
  { feature: "imports", matches: (path) => path === "/api/imports" || path.startsWith("/api/imports/") },
  { feature: "merge", matches: (path) => path === "/api/merges" || path.startsWith("/api/merges/") },
  { feature: "archive_sweep", matches: (path) => path === "/api/products/archive/preview" || path === "/api/products/archive/commit" },
  { feature: "schedule_rotation", matches: (path) => path === "/api/schedule/rotation/preview" || path === "/api/schedule/rotation/commit" },
  { feature: "future_replacement", matches: (path) => path === "/api/schedule/future-replacement/preview" || path === "/api/schedule/future-replacement/commit" },
  { feature: "external_media_url", matches: (path) => path === "/api/media/validate-link" },
  { feature: "telegram_report_delivery", matches: (path) => /^\/api\/reports\/[^/]+\/telegram$/.test(path) }
];

export function deferredLaunchFeatureForRoute(path: string): DeferredLaunchFeature | undefined {
  return routeMatchers.find((entry) => entry.matches(path))?.feature;
}

export const deferredWorkerTypes = [
  "telegram_calendar",
  "daily_digest",
  "report_pdf",
  "report_ready"
] as const;

export function assertDeferredWorkerType(type: string): boolean {
  return !deferredWorkerTypes.includes(type as (typeof deferredWorkerTypes)[number]);
}

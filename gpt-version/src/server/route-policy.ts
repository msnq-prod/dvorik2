import type { Permission } from "../shared/types";

export type RoutePolicy = Readonly<{ permission: Permission }>;

const exactPolicies = new Map<string, RoutePolicy>([
  ["POST /api/products", { permission: "products:write" }],
  ["POST /api/product-groups", { permission: "products:write" }],
  ["POST /api/manufacturers", { permission: "products:write" }],
  ["POST /api/product-prices", { permission: "products:write" }],
  ["POST /api/locations", { permission: "products:write" }],
  ["POST /api/media/upload", { permission: "products:write" }],
  ["POST /api/stock/operations", { permission: "stock:move" }],
  ["POST /api/inventory/apply", { permission: "inventory:write" }],
  ["POST /api/inventory/sessions", { permission: "inventory:write" }],
  ["POST /api/consumption", { permission: "inventory:write" }],
  ["POST /api/stock/adjustments", { permission: "inventory:write" }],
  ["POST /api/schedule", { permission: "schedule:manage" }],
  ["POST /api/hr-events", { permission: "staff:manage" }],
  ["POST /api/labels/preview", { permission: "labels:print" }],
  ["POST /api/labels/pdf", { permission: "labels:print" }],
  ["POST /api/backups", { permission: "techlog:read" }],
  ["PUT /api/saby/mappings", { permission: "saby:manage" }]
]);

const patternPolicies: readonly Readonly<{ matches(method: string, path: string): boolean; policy: RoutePolicy }>[] = [
  { matches: (method, path) => method === "PATCH" && /^\/api\/products\/[^/]+$/.test(path), policy: { permission: "products:write" } },
  { matches: (method, path) => method === "POST" && /^\/api\/products\/[^/]+\/packagings$/.test(path), policy: { permission: "products:write" } },
  { matches: (method, path) => method === "PATCH" && /^\/api\/locations\/[^/]+$/.test(path), policy: { permission: "products:write" } },
  { matches: (method, path) => method === "POST" && /^\/api\/stock\/operations\/[^/]+\/reverse$/.test(path), policy: { permission: "techlog:read" } },
  { matches: (method, path) => method === "POST" && /^\/api\/inventory\/sessions\/[^/]+\/close$/.test(path), policy: { permission: "inventory:write" } },
  { matches: (method, path) => method === "PUT" && /^\/api\/schedule\/days\/[^/]+\/[^/]+$/.test(path), policy: { permission: "schedule:manage" } },
  { matches: (method, path) => method === "PATCH" && /^\/api\/schedule\/[^/]+$/.test(path), policy: { permission: "schedule:manage" } },
  { matches: (method, path) => method === "POST" && /^\/api\/schedule\/[^/]+\/copy$/.test(path), policy: { permission: "schedule:manage" } },
  { matches: (method, path) => method === "PUT" && /^\/api\/staff\/[^/]+\/profile$/.test(path), policy: { permission: "staff:manage" } },
  { matches: (method, path) => method === "PATCH" && /^\/api\/users\/[^/]+$/.test(path), policy: { permission: "users:manage" } },
  { matches: (method, path) => method === "POST" && /^\/api\/labels\/jobs\/[^/]+\/pdf$/.test(path), policy: { permission: "labels:print" } },
  { matches: (method, path) => method === "POST" && /^\/api\/backups\/[^/]+\/restore$/.test(path), policy: { permission: "techlog:read" } }
];

export function routePolicyFor(method: string, path: string): RoutePolicy | undefined {
  return exactPolicies.get(`${method.toUpperCase()} ${path}`) ?? patternPolicies.find((entry) => entry.matches(method.toUpperCase(), path))?.policy;
}

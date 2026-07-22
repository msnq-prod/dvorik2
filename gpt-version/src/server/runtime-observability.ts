import { nanoid } from "nanoid";

export function requestCorrelationId(value: string | undefined) {
  const candidate = String(value || "");
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(candidate) ? candidate : `http:${nanoid()}`;
}

export function safeLogPath(path: string) {
  return path.startsWith("/api/saby/webhook/") ? "/api/saby/webhook/[redacted]" : path;
}

export function securityHeaders(production: boolean) {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...(production ? {
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy": "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'"
    } : {})
  } as const;
}

export type HttpMetrics = ReturnType<typeof createHttpMetrics>;

export function createHttpMetrics() {
  let requests = 0;
  let failures = 0;
  let inFlight = 0;
  const byStatus = new Map<number, number>();
  return {
    begin() { requests += 1; inFlight += 1; },
    complete(status: number) {
      inFlight = Math.max(0, inFlight - 1);
      byStatus.set(status, (byStatus.get(status) || 0) + 1);
      if (status >= 500) failures += 1;
    },
    prometheus() {
      const statuses = [...byStatus.entries()].sort(([left], [right]) => left - right)
        .map(([status, count]) => `dvorik_http_responses_total{status="${status}"} ${count}`);
      return [
        "# TYPE dvorik_http_requests_total counter", `dvorik_http_requests_total ${requests}`,
        "# TYPE dvorik_http_failures_total counter", `dvorik_http_failures_total ${failures}`,
        "# TYPE dvorik_http_in_flight gauge", `dvorik_http_in_flight ${inFlight}`,
        ...statuses, ""
      ].join("\n");
    }
  };
}

const unsafeMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const signedMutationPaths = new Set(["/api/auth/telegram", "/api/telegram/webhook"]);

export function crossOriginMutationRejected(input: Readonly<{
  method: string;
  path: string;
  origin?: string;
  host: string;
  protocol: string;
  secFetchSite?: string;
}>) {
  if (!unsafeMethods.has(input.method.toUpperCase()) || !input.path.startsWith("/api/") || signedMutationPaths.has(input.path) || input.path.startsWith("/api/saby/webhook/")) return false;
  if (input.secFetchSite?.toLowerCase() === "cross-site") return true;
  if (!input.origin) return false;
  try {
    return new URL(input.origin).origin !== `${input.protocol}://${input.host}`;
  } catch {
    return true;
  }
}

export function isUnsafeApiMutation(method: string, path: string) {
  return unsafeMethods.has(method.toUpperCase()) && path.startsWith("/api/");
}

export function createFixedWindowRateLimiter(input: Readonly<{ limit: number; windowMs: number; now?: () => number }>) {
  const now = input.now ?? Date.now;
  const entries = new Map<string, { startedAt: number; count: number }>();
  return {
    allow(key: string) {
      const current = now();
      const existing = entries.get(key);
      if (!existing || current - existing.startedAt >= input.windowMs) {
        entries.set(key, { startedAt: current, count: 1 });
        return { allowed: true as const, retryAfterSeconds: 0 };
      }
      existing.count += 1;
      const retryAfterSeconds = Math.max(1, Math.ceil((input.windowMs - (current - existing.startedAt)) / 1_000));
      return { allowed: existing.count <= input.limit, retryAfterSeconds };
    }
  };
}

export function invalidJsonPayload(value: unknown, depth = 0): boolean {
  if (depth > 16) return true;
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return false;
  if (Array.isArray(value)) return value.length > 2_000 || value.some((item) => invalidJsonPayload(item, depth + 1));
  if (typeof value !== "object") return true;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length > 500) return true;
  return entries.some(([key, item]) => key === "__proto__" || key === "prototype" || key === "constructor" || invalidJsonPayload(item, depth + 1));
}

export type ApiErrorPayload = {
  code?: string;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(status: number, payload: ApiErrorPayload | null) {
    super(payload?.message || payload?.error || payload?.code || "Ошибка API");
    this.name = "ApiError";
    this.status = status;
    this.code = payload?.code || `HTTP_${status}`;
    this.fieldErrors = payload?.fieldErrors;
  }
}

export function api() {
  async function request<T>(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    const data = await response.json().catch(() => null) as ApiErrorPayload | null;
    if (!response.ok) {
      throw new ApiError(response.status, data);
    }
    return data as T;
  }

  return { request };
}

export type ApiClient = ReturnType<typeof api>;

export async function downloadPdf(url: string, body: unknown, fileName: string) {
  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as ApiErrorPayload | null;
    throw new ApiError(response.status, error || { message: "Не удалось сформировать PDF" });
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(objectUrl);
}

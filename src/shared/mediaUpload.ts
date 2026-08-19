export const MEDIA_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_UPLOAD_MAX_LABEL = "5 МиБ";
export const MEDIA_UPLOAD_ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MEDIA_UPLOAD_MAX_BASE64_CHARS = 4 * Math.ceil(MEDIA_UPLOAD_MAX_BYTES / 3);
export const MEDIA_UPLOAD_JSON_LIMIT_BYTES = MEDIA_UPLOAD_MAX_BASE64_CHARS + 1024;

export function normalizeMediaBase64(value: string) {
  return value.replace(/^data:[^,]+,/, "");
}

export function decodedBase64ByteLength(value: string) {
  const base64 = normalizeMediaBase64(value);
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) return null;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

export function mediaUploadValidation(size: number, mimeType: string) {
  if (!MEDIA_UPLOAD_ALLOWED_TYPES.includes(mimeType as typeof MEDIA_UPLOAD_ALLOWED_TYPES[number])) {
    return "Поддерживаются JPEG, PNG и WebP";
  }
  if (!Number.isInteger(size) || size < 1) return "Изображение должно содержать хотя бы 1 байт";
  if (size > MEDIA_UPLOAD_MAX_BYTES) return `Размер изображения не должен превышать ${MEDIA_UPLOAD_MAX_LABEL} (${MEDIA_UPLOAD_MAX_BYTES.toLocaleString("ru-RU")} байт)`;
  return null;
}

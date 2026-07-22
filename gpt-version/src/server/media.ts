import { lookup as dnsLookup } from "node:dns/promises";
import fs from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import sharp from "sharp";

export type MediaMimeType = "image/jpeg" | "image/png" | "image/webp";

export type StoredMedia = {
  key: string;
  url: string;
  bytes: number;
  storage: "local" | "object";
};

export interface MediaStorage {
  put(input: { key: string; body: Buffer; mimeType: MediaMimeType }): Promise<StoredMedia>;
  localDirectory?: string;
}

const extensionByMime: Record<MediaMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export function mediaKey(mimeType: MediaMimeType) {
  return `${nanoid()}.${extensionByMime[mimeType]}`;
}

export class LocalMediaStorage implements MediaStorage {
  readonly localDirectory: string;

  constructor(directory: string, private readonly publicPrefix = "/media") {
    this.localDirectory = directory;
  }

  async put({ key, body }: { key: string; body: Buffer; mimeType: MediaMimeType }): Promise<StoredMedia> {
    if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(key)) throw new Error("Unsafe media key");
    await fs.mkdir(this.localDirectory, { recursive: true });
    await fs.writeFile(path.join(this.localDirectory, key), body, { flag: "wx" });
    return { key, url: `${this.publicPrefix}/${key}`, bytes: body.length, storage: "local" };
  }
}

/** Generic S3-compatible gateway adapter. It deliberately needs a configured public URL,
 * so a failed/misconfigured object store can never return an unreachable media link. */
export class ObjectStorageAdapter implements MediaStorage {
  constructor(private readonly config: { endpoint: string; bucket: string; publicBaseUrl: string; token?: string }) {}

  async put({ key, body, mimeType }: { key: string; body: Buffer; mimeType: MediaMimeType }): Promise<StoredMedia> {
    const base = this.config.endpoint.replace(/\/$/, "");
    const bucket = encodeURIComponent(this.config.bucket);
    const response = await fetch(`${base}/${bucket}/${encodeURIComponent(key)}`, {
      method: "PUT",
      headers: {
        "content-type": mimeType,
        "content-length": String(body.length),
        ...(this.config.token ? { authorization: `Bearer ${this.config.token}` } : {})
      },
      body
    });
    if (!response.ok) throw new Error(`Object storage rejected upload (${response.status})`);
    return {
      key,
      url: `${this.config.publicBaseUrl.replace(/\/$/, "")}/${encodeURIComponent(key)}`,
      bytes: body.length,
      storage: "object"
    };
  }
}

export class FallbackMediaStorage implements MediaStorage {
  constructor(private readonly primary: MediaStorage | undefined, private readonly fallback: MediaStorage) {}
  get localDirectory() { return this.fallback.localDirectory; }

  async put(input: { key: string; body: Buffer; mimeType: MediaMimeType }): Promise<StoredMedia> {
    if (!this.primary) return this.fallback.put(input);
    try {
      return await this.primary.put(input);
    } catch (error) {
      console.warn("Object storage upload failed; using local media fallback", error instanceof Error ? error.message : error);
      return this.fallback.put(input);
    }
  }
}

export function createMediaStorage(options: {
  localDirectory: string;
  endpoint?: string;
  bucket?: string;
  publicBaseUrl?: string;
  token?: string;
  allowLocalFallback?: boolean;
}): MediaStorage {
  const local = new LocalMediaStorage(options.localDirectory);
  const primary = options.endpoint && options.bucket && options.publicBaseUrl
    ? new ObjectStorageAdapter({ endpoint: options.endpoint, bucket: options.bucket, publicBaseUrl: options.publicBaseUrl, token: options.token })
    : undefined;
  if (options.allowLocalFallback === false) {
    if (!primary) throw new Error("Object storage is required when local media fallback is disabled");
    return primary;
  }
  return new FallbackMediaStorage(primary, local);
}

export async function assertImageProcessorCapability(processor: typeof sharp = sharp) {
  const { data, info } = await processor({ create: { width: 2, height: 2, channels: 3, background: "#ffffff" } }).jpeg().toBuffer({ resolveWithObject: true });
  if (!data.length || info.format !== "jpeg" || info.width !== 2 || info.height !== 2) throw new Error("Image processor capability check failed");
  return { engine: "sharp", vips: sharp.versions.vips };
}

export async function compressImage(input: Buffer, mimeType: MediaMimeType, processor: typeof sharp = sharp): Promise<{ body: Buffer; mimeType: MediaMimeType; compressed: boolean; width: number; height: number }> {
  let image = processor(input, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true });
  image = mimeType === "image/jpeg"
    ? image.jpeg({ quality: 82, mozjpeg: true })
    : mimeType === "image/webp"
      ? image.webp({ quality: 82 })
      : image.png({ compressionLevel: 9, palette: true });
  const { data, info } = await image.toBuffer({ resolveWithObject: true });
  if (!data.length || !info.width || !info.height) throw new Error("Image processor returned invalid output");
  return { body: data, mimeType, compressed: data.length < input.length, width: info.width, height: info.height };
}

function isPrivateAddress(address: string) {
  if (address === "::1" || address === "0.0.0.0" || address.startsWith("fe80:") || address.startsWith("fc") || address.startsWith("fd")) return true;
  const parts = address.split(".").map(Number);
  return parts.length === 4 && (parts[0] === 10 || parts[0] === 127 || parts[0] === 0 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168));
}

export function validateMediaUrlSyntax(value: string) {
  if (value.startsWith("/media/")) return new URL(value, "http://local.media");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("Некорректная ссылка на изображение"); }
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname) throw new Error("Ссылка на изображение должна быть HTTP(S)");
  if (["localhost", "localhost.localdomain"].includes(url.hostname) || isPrivateAddress(url.hostname)) throw new Error("Локальные адреса изображений запрещены");
  return url;
}

export async function validateExternalMediaUrl(
  value: string,
  deps: { lookup?: (hostname: string) => Promise<Array<{ address: string }>>; request?: typeof fetch } = {}
): Promise<{ url: string; contentType: string; bytes?: number }> {
  const url = validateMediaUrlSyntax(value);
  if (url.hostname === "local.media") return { url: value, contentType: "local" };
  const lookup = deps.lookup || ((hostname: string) => dnsLookup(hostname, { all: true }));
  const records = await lookup(url.hostname);
  if (records.some((record) => isPrivateAddress(record.address))) throw new Error("Адрес изображения ведёт во внутреннюю сеть");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await (deps.request || fetch)(url.toString(), { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (!response.ok) throw new Error("Изображение по ссылке недоступно");
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) throw new Error("Ссылка не ведёт на изображение");
    const rawLength = response.headers.get("content-length");
    const bytes = rawLength ? Number(rawLength) : undefined;
    if (bytes && (!Number.isFinite(bytes) || bytes > 15 * 1024 * 1024)) throw new Error("Изображение по ссылке больше 15 МБ");
    return { url: url.toString(), contentType, bytes };
  } finally {
    clearTimeout(timeout);
  }
}

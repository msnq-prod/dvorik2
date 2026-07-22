import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { assertImageProcessorCapability, compressImage, FallbackMediaStorage, LocalMediaStorage, validateExternalMediaUrl, validateMediaUrlSyntax } from "./media";

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dvorik-media-"));
const local = new LocalMediaStorage(directory);
const stored = await local.put({ key: "safe_name.jpg", body: Buffer.from("image"), mimeType: "image/jpeg" });
assert.equal(stored.url, "/media/safe_name.jpg");
assert.equal((await fs.readFile(path.join(directory, "safe_name.jpg"))).toString(), "image");
await assert.rejects(() => local.put({ key: "../unsafe.jpg", body: Buffer.from("x"), mimeType: "image/jpeg" }));

const fallback = new FallbackMediaStorage({ put: async () => { throw new Error("offline"); } }, local);
const fallbackStored = await fallback.put({ key: "fallback.webp", body: Buffer.from("image"), mimeType: "image/webp" });
assert.equal(fallbackStored.storage, "local");

assert.throws(() => validateMediaUrlSyntax("http://127.0.0.1/private.png"));
assert.throws(() => validateMediaUrlSyntax("file:///tmp/private.png"));
const checked = await validateExternalMediaUrl("https://cdn.example.com/photo.jpg", {
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  request: async () => new Response(null, { status: 200, headers: { "content-type": "image/jpeg", "content-length": "1024" } })
});
assert.equal(checked.contentType, "image/jpeg");
await assert.rejects(() => validateExternalMediaUrl("https://cdn.example.com/private.jpg", {
  lookup: async () => [{ address: "10.1.1.1", family: 4 }]
}));
await assert.rejects(() => validateExternalMediaUrl("https://cdn.example.com/not-image", {
  lookup: async () => [{ address: "93.184.216.34", family: 4 }],
  request: async () => new Response(null, { status: 200, headers: { "content-type": "text/html" } })
}));

const capability = await assertImageProcessorCapability();
assert.equal(capability.engine, "sharp");
assert.ok(capability.vips);
const width = 3000;
const height = 2000;
const pixels = Buffer.alloc(width * height * 3);
for (let index = 0; index < pixels.length; index += 3) {
  const pixel = index / 3;
  pixels[index] = pixel % 251;
  pixels[index + 1] = Math.floor(pixel / width) % 241;
  pixels[index + 2] = Math.floor(pixel / 97) % 239;
}
const largeOrientedJpeg = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 100 }).withMetadata({ orientation: 6 }).toBuffer();
const processed = await compressImage(largeOrientedJpeg, "image/jpeg");
const processedMetadata = await sharp(processed.body).metadata();
assert.equal(processed.width, 1280);
assert.equal(processed.height, 1920);
assert.equal(processedMetadata.width, 1280);
assert.equal(processedMetadata.height, 1920);
assert.equal(processedMetadata.format, "jpeg");
assert.equal(processedMetadata.orientation, undefined);
assert.ok(processed.body.length < largeOrientedJpeg.length);
assert.equal(processed.compressed, true);
await assert.rejects(() => compressImage(largeOrientedJpeg, "image/jpeg", (() => { throw new Error("processor offline"); }) as unknown as typeof sharp), /processor offline/);

await fs.rm(directory, { recursive: true, force: true });
console.log("media tests passed");

import assert from "node:assert/strict";
import { decodedBase64ByteLength, MEDIA_UPLOAD_JSON_LIMIT_BYTES, MEDIA_UPLOAD_MAX_BASE64_CHARS, MEDIA_UPLOAD_MAX_BYTES, mediaUploadValidation } from "./mediaUpload";

const exact = Buffer.alloc(MEDIA_UPLOAD_MAX_BYTES).toString("base64");
const plusOne = Buffer.alloc(MEDIA_UPLOAD_MAX_BYTES + 1).toString("base64");
assert.equal(exact.length, MEDIA_UPLOAD_MAX_BASE64_CHARS);
assert.equal(plusOne.length, MEDIA_UPLOAD_MAX_BASE64_CHARS);
assert.equal(decodedBase64ByteLength(exact), MEDIA_UPLOAD_MAX_BYTES);
assert.equal(decodedBase64ByteLength(plusOne), MEDIA_UPLOAD_MAX_BYTES + 1);
assert.ok(MEDIA_UPLOAD_JSON_LIMIT_BYTES > JSON.stringify({ mimeType: "image/png", base64: exact }).length);
assert.equal(mediaUploadValidation(MEDIA_UPLOAD_MAX_BYTES, "image/png"), null);
assert.match(mediaUploadValidation(MEDIA_UPLOAD_MAX_BYTES + 1, "image/png") || "", /5 МиБ/);
assert.match(mediaUploadValidation(10, "image/gif") || "", /JPEG, PNG и WebP/);
assert.equal(decodedBase64ByteLength("not base64"), null);
console.log("media upload limit tests passed");

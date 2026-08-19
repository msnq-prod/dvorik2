import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
assert.equal(source.includes("sessionDatabase.transaction("), false, "HTTP transport must not own business transactions");
assert.equal(/\n\s*database\.execute\(\s*["'`](?:INSERT|UPDATE|DELETE)\b/i.test(source), false, "HTTP transport must not contain mutation SQL");
assert.match(source, /new CatalogService\(/);
assert.match(source, /new NotificationPreferenceService\(/);
assert.match(source, /new ArtifactCommandService\(/);
console.log("transport boundary tests passed");

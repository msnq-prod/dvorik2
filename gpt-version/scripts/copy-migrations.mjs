import fs from "node:fs";
import path from "node:path";

const source = path.resolve("src/server/migrations");
const destination = path.resolve("dist/migrations");
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
console.log("Copied SQL migrations to dist/migrations");

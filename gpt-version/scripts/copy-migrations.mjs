import fs from "node:fs";
import path from "node:path";

const source = path.resolve("src/server/migrations");
const destination = path.resolve("dist/migrations");
fs.rmSync(destination, { recursive: true, force: true });
fs.cpSync(source, destination, { recursive: true });
const cashSource = path.resolve("src/cash/migrations");
const cashDestination = path.resolve("dist/cash/migrations");
fs.rmSync(cashDestination, { recursive: true, force: true });
fs.cpSync(cashSource, cashDestination, { recursive: true });
const staffSource = path.resolve("src/staff/migrations");
const staffDestination = path.resolve("dist/staff/migrations");
fs.rmSync(staffDestination, { recursive: true, force: true });
fs.cpSync(staffSource, staffDestination, { recursive: true });
console.log("Copied SQL migrations to dist/migrations");

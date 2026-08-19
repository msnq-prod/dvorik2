import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src/modules");
const moduleNames = ["platform", "warehouse", "staff", "cash", "company"] as const;

function files(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : entry.name.endsWith(".ts") ? [target] : [];
  });
}

for (const moduleName of moduleNames) {
  const directory = path.join(root, moduleName);
  for (const file of files(directory)) {
    const source = fs.readFileSync(file, "utf8");
    const serverImports = file.endsWith(".test.ts") ? [] : [...source.matchAll(/from\s+["']([^"']*server\/[^"']+)["']/g)].map((match) => match[1]).filter((value) => !value.endsWith("/server/database"));
    assert.deepEqual(serverImports, [], `${file} imports server implementation: ${serverImports.join(", ")}`);
    for (const other of moduleNames.filter((name) => name !== moduleName)) {
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const imported of imports.filter((value) => value.includes(`/modules/${other}/`) || value.includes(`../${other}/`))) {
        assert.match(imported, new RegExp(`(?:modules/)?${other}/?(?:index)?$`), `${file} imports internal ${other} module path: ${imported}`);
      }
    }
  }
}

const cashSource = files(path.resolve("src/cash")).filter((file) => !file.includes("/migrations/") && !file.endsWith(".test.ts")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const coreTable of ["inventory_balances", "stock_operations", "users", "employee_profiles", "supplies", "inventory_lots"]) {
  assert.equal(new RegExp(`\\b${coreTable}\\b`, "i").test(cashSource), false, `Cash runtime accesses core table ${coreTable}`);
}

const staffSource = files(path.resolve("src/staff")).filter((file) => !file.includes("/migrations/") && !file.endsWith(".test.ts") && !file.endsWith("/migrate-from-core.ts")).map((file) => fs.readFileSync(file, "utf8")).join("\n");
for (const coreTable of ["users", "employee_profiles", "hr_events", "shifts", "shift_assignments", "inventory_balances", "stock_operations"]) {
  assert.equal(new RegExp(`\\b(?:FROM|JOIN|INTO|UPDATE|TABLE)\\s+${coreTable}\\b`, "i").test(staffSource), false, `Staff runtime accesses core table ${coreTable}`);
}

console.log("module architecture tests passed");

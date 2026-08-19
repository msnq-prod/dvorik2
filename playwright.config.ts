import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5177",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/start-e2e-server.mjs",
    url: "http://127.0.0.1:5177/api/health",
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      PORT: "5177",
      DVORIK_SQLITE_FILE: "/tmp/dvorik-gpt-version-e2e.sqlite"
    }
  },
  projects: [
    { name: "mobile-390x844", use: { viewport: { width: 390, height: 844 } } },
    { name: "tablet-768x1024", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop-1440x900", use: { viewport: { width: 1440, height: 900 } } }
  ]
});

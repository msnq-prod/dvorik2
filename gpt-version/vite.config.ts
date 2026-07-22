import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  build: {
    outDir: "../../dist/public",
    emptyOutDir: true
  },
  server: {
    host: "0.0.0.0"
  }
});

import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { port: 4175 },
  build: { chunkSizeWarningLimit: 650 },
});

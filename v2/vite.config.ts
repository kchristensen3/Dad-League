import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 800 },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:3000", changeOrigin: false },
      "/auth": { target: "http://localhost:3000", changeOrigin: false },
      "/cal": { target: "http://localhost:3000", changeOrigin: false },
      "^/(privacy|terms)(-policy|-of-service)?$": { target: "http://localhost:3000", changeOrigin: false },
    },
  },
});

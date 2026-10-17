import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../../../", import.meta.url));
export default defineConfig({
  root,
  plugins: [react()],
  server: { port: 5174, strictPort: true, host: "127.0.0.1", open: false },
  build: {
    outDir: "dist/voice-coach",
    emptyOutDir: true,
    rollupOptions: {
      input: fileURLToPath(new URL("./index.html", import.meta.url)),
    },
  },
});

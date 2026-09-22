import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/activity": { target: "ws://127.0.0.1:8081", ws: true },
      "/ws": { target: "ws://127.0.0.1:8081", ws: true },
      "/api": {
        target: "http://127.0.0.1:8081",
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});

import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  resolve: {
    alias: {
      "#speakup/browser": new URL("./src/services/browser.ts", import.meta.url)
        .pathname,
    },
  },
  build:
    mode === "message-views"
      ? {
          outDir: "../_build/message-views",
          emptyOutDir: true,
          rollupOptions: {
            treeshake: {
              moduleSideEffects: (id) => !/\/dist\/client(?:\/|\.js$)/.test(id),
            },
            input: {
              message: new URL("./message-dom.html", import.meta.url).pathname,
            },
          },
        }
      : {
          rollupOptions: {
            treeshake: {
              moduleSideEffects: (id) => !/\/dist\/client(?:\/|\.js$)/.test(id),
            },
          },
        },
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
}));

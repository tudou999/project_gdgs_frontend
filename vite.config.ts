import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { visualizer } from "rollup-plugin-visualizer";
const isAnalyze = process.env.ANALYZE === "true";

export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    isAnalyze &&
      visualizer({
        gzipSize: true,
        brotliSize: true,
        emitFile: false,
        filename: "test.html",
        open: true,
      }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  // 开发服务器配置
  server: {
    port: 5173,
    open: false,
    host: true,
    proxy: {
      "/api/v1": {
        target: "http://10.23.22.125:8080",
        changeOrigin: true,

        ws: false,
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq) => {
            proxyReq.setHeader("Accept-Encoding", "identity");
          });
        },
      },
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    minify: "esbuild",
    chunkSizeWarningLimit: 1500,
  },
});

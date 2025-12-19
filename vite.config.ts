import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv } from "vite"; // 👈 引入 loadEnv
import vue from "@vitejs/plugin-vue";
import vueDevTools from "vite-plugin-vue-devtools";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isAnalyze = env.ANALYZE === "true";

  return {
    plugins: [
      vue(),
      vueDevTools(),
      isAnalyze &&
        visualizer({
          gzipSize: true,
          brotliSize: true,
          emitFile: false,
          filename: "stats.html",
          open: true,
        }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
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
  };
});

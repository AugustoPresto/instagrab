import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync } from "fs";

// Plugin: after build, copy popup.html to dist root (Chrome expects it at dist/popup.html)
function copyPopupHtml() {
  return {
    name: "copy-popup-html",
    closeBundle() {
      try {
        copyFileSync(
          resolve(__dirname, "dist/src/popup/index.html"),
          resolve(__dirname, "dist/popup.html")
        );
      } catch (e) {
        // ignore if not found
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), copyPopupHtml()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        content: resolve(__dirname, "src/content/index.ts"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
  publicDir: "public",
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});



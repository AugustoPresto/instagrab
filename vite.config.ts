import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { copyFileSync, readFileSync, writeFileSync } from "fs";

// Plugin: after build, copy popup.html to dist root and fix absolute paths
function copyPopupHtml() {
  return {
    name: "copy-popup-html",
    closeBundle() {
      try {
        const src = resolve(__dirname, "dist/src/popup/index.html");
        const dest = resolve(__dirname, "dist/popup.html");
        let html = readFileSync(src, "utf-8");
        // Chrome extensions don't support absolute paths — make them relative
        html = html.replace(/src="\/popup\.js"/g, 'src="./popup.js"');
        html = html.replace(/href="\/([^"]+)"/g, 'href="./$1"');
        writeFileSync(dest, html);
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



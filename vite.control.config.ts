import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/control/",
  plugins: [react()],
  build: {
    outDir: "control-dist",
    emptyOutDir: true,
    rollupOptions: {
      input: { index: "control.html" },
    },
  },
});

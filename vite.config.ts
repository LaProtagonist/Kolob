import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

function publicInvestorTerminalCapexAdapter() {
  const runtime = path.resolve(process.cwd(), "src/lib/investor-terminal-capex-runtime.ts");
  return {
    name: "public-investor-terminal-capex-adapter",
    enforce: "pre" as const,
    resolveId(source: string, importer?: string) {
      const sourceFile = importer?.split("?", 1)[0] ?? "";
      if (!sourceFile.endsWith("/src/lib/launch-budget.ts") && !sourceFile.endsWith("/src/lib/network-scaling.ts")) return null;
      if (source === "./capex-runtime" || source === "./capex-runtime.js") return runtime;
      return null;
    },
  };
}

export default defineConfig({
  plugins: [react(), publicInvestorTerminalCapexAdapter()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": "http://127.0.0.1:8787",
      "/leads": "http://127.0.0.1:8787"
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4173
  }
});

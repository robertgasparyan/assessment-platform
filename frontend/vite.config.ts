import path from "node:path";
import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import frontendPackageJson from "./package.json" with { type: "json" };

function readGitSha() {
  if (process.env.VITE_GIT_SHA?.trim()) {
    return process.env.VITE_GIT_SHA.trim();
  }

  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim();
  } catch {
    return "unknown";
  }
}

const frontendBuildInfo = {
  version: process.env.VITE_APP_VERSION?.trim() || frontendPackageJson.version,
  commit: readGitSha(),
  builtAt: process.env.VITE_BUILD_TIME?.trim() || new Date().toISOString(),
  environment: process.env.VITE_DEPLOY_ENV?.trim() || process.env.NODE_ENV || "development"
};

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(frontendBuildInfo.version),
    __APP_GIT_SHA__: JSON.stringify(frontendBuildInfo.commit),
    __APP_BUILD_TIME__: JSON.stringify(frontendBuildInfo.builtAt),
    __APP_DEPLOY_ENV__: JSON.stringify(frontendBuildInfo.environment)
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});

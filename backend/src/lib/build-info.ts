import { execSync } from "node:child_process";
import backendPackageJson from "../../package.json" with { type: "json" };

function readGitSha() {
  if (process.env.APP_GIT_SHA?.trim()) {
    return process.env.APP_GIT_SHA.trim();
  }

  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf-8" }).trim() || null;
  } catch {
    return null;
  }
}

const startedAt = new Date().toISOString();

export const backendBuildInfo = {
  version: process.env.APP_VERSION?.trim() || backendPackageJson.version,
  commit: readGitSha(),
  builtAt: process.env.APP_BUILD_TIME?.trim() || startedAt,
  environment: process.env.APP_ENVIRONMENT?.trim() || process.env.NODE_ENV || "development"
};

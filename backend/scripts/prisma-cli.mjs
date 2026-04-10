import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendDir = path.resolve(__dirname, "..");
const rootEnvPath = path.resolve(backendDir, "../.env");

dotenv.config({ path: rootEnvPath });

const prismaCliPath = path.resolve(backendDir, "../node_modules/prisma/build/index.js");
const args = [prismaCliPath, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, {
  cwd: backendDir,
  stdio: "inherit",
  env: process.env
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);

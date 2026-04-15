import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { prisma } from "../db.js";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export type JsonExportMode = "portable" | "full";
export type PostgresDumpFormat = "plain" | "custom";

type PgDumpCapability = {
  available: boolean;
  executable: string;
  version: string | null;
  checkedAt: string;
  error: string | null;
};

function buildTimestampLabel(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function decodeComponent(value: string) {
  return decodeURIComponent(value.replace(/\+/g, "%20"));
}

function parseDatabaseUrl(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  const database = parsed.pathname.replace(/^\//, "");

  return {
    host: parsed.hostname,
    port: parsed.port || "5432",
    user: decodeComponent(parsed.username),
    password: decodeComponent(parsed.password),
    database: decodeComponent(database),
    sslMode: parsed.searchParams.get("sslmode")
  };
}

async function getAllExportData() {
  const [
    platformSettings,
    users,
    userTeamMemberships,
    teams,
    categories,
    assessmentTemplates,
    templateDrafts,
    questionLibraryItems,
    domainLibraryItems,
    templateVersions,
    templateDomains,
    templateQuestions,
    questionLevels,
    assessmentRuns,
    assessmentRunAssignments,
    assessmentResponses,
    reportShareLinks,
    auditLogs,
    notifications
  ] = await Promise.all([
    prisma.platformSetting.findMany(),
    prisma.user.findMany(),
    prisma.userTeamMembership.findMany(),
    prisma.team.findMany(),
    prisma.category.findMany(),
    prisma.assessmentTemplate.findMany(),
    prisma.templateDraft.findMany(),
    prisma.questionLibraryItem.findMany(),
    prisma.domainLibraryItem.findMany(),
    prisma.templateVersion.findMany(),
    prisma.templateDomain.findMany(),
    prisma.templateQuestion.findMany(),
    prisma.questionLevel.findMany(),
    prisma.assessmentRun.findMany(),
    prisma.assessmentRunAssignment.findMany(),
    prisma.assessmentResponse.findMany(),
    prisma.reportShareLink.findMany(),
    prisma.auditLog.findMany(),
    prisma.notification.findMany()
  ]);

  return {
    platformSettings,
    users,
    userTeamMemberships,
    teams,
    categories,
    assessmentTemplates,
    templateDrafts,
    questionLibraryItems,
    domainLibraryItems,
    templateVersions,
    templateDomains,
    templateQuestions,
    questionLevels,
    assessmentRuns,
    assessmentRunAssignments,
    assessmentResponses,
    reportShareLinks,
    auditLogs,
    notifications
  };
}

function redactPortableExport(data: Awaited<ReturnType<typeof getAllExportData>>) {
  return {
    ...data,
    users: data.users.map(({ passwordHash, sessionToken, sessionExpiresAt, inviteToken, ...user }) => ({
      ...user,
      passwordHash: null,
      sessionToken: null,
      sessionExpiresAt: null,
      inviteToken: null
    })),
    reportShareLinks: data.reportShareLinks.map(({ token, ...link }) => ({
      ...link,
      token: null
    }))
  };
}

function buildEntityCounts(data: Awaited<ReturnType<typeof getAllExportData>>) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
  );
}

export async function buildJsonExport({
  mode,
  actorUserId
}: {
  mode: JsonExportMode;
  actorUserId: string;
}) {
  const rawData = await getAllExportData();
  const exportedData = mode === "portable" ? redactPortableExport(rawData) : rawData;
  const generatedAt = new Date();
  const payload = {
    meta: {
      exportType: "assessment-platform-json",
      version: "1.0",
      mode,
      generatedAt: generatedAt.toISOString(),
      generatedByUserId: actorUserId,
      warnings:
        mode === "portable"
          ? [
              "Portable mode redacts password hashes, active session tokens, invite tokens, and report share tokens.",
              "Portable mode is intended for data portability, not full-fidelity credential backup."
            ]
          : [
              "Full mode includes sensitive authentication and access data.",
              "Handle this file as a privileged backup artifact."
            ],
      entityCounts: buildEntityCounts(rawData)
    },
    data: exportedData
  };

  return {
    filename: `assessment-platform-export-${mode}-${buildTimestampLabel(generatedAt)}.json`,
    mimeType: "application/json; charset=utf-8",
    content: JSON.stringify(payload, null, 2)
  };
}

async function executePgDump(args: string[], env: NodeJS.ProcessEnv) {
  const result = await execFileAsync(config.pgDumpPath, args, {
    env,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 8
  });

  return result;
}

export async function getPgDumpCapability(): Promise<PgDumpCapability> {
  const checkedAt = new Date().toISOString();

  try {
    const { stdout, stderr } = await executePgDump(["--version"], process.env);
    return {
      available: true,
      executable: config.pgDumpPath,
      version: (stdout || stderr).trim() || null,
      checkedAt,
      error: null
    };
  } catch (error) {
    return {
      available: false,
      executable: config.pgDumpPath,
      version: null,
      checkedAt,
      error: error instanceof Error ? error.message : "pg_dump is unavailable"
    };
  }
}

export async function createPostgresDump({
  format
}: {
  format: PostgresDumpFormat;
}) {
  const capability = await getPgDumpCapability();

  if (!capability.available) {
    throw new Error(capability.error || "pg_dump is unavailable on this server");
  }

  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is not configured");
  }

  const connection = parseDatabaseUrl(config.databaseUrl);
  const timestamp = buildTimestampLabel();
  const extension = format === "plain" ? "sql" : "dump";
  const tempPath = path.join(os.tmpdir(), `assessment-platform-${timestamp}-${randomUUID()}.${extension}`);

  const args = [
    "--host",
    connection.host,
    "--port",
    connection.port,
    "--username",
    connection.user,
    "--dbname",
    connection.database,
    "--no-owner",
    "--no-privileges",
    "--file",
    tempPath
  ];

  if (format === "custom") {
    args.push("--format=custom");
  } else {
    args.push("--format=plain");
    args.push("--encoding=UTF8");
  }

  const env = {
    ...process.env,
    PGPASSWORD: connection.password,
    PGSSLMODE: connection.sslMode ?? process.env.PGSSLMODE
  };

  try {
    await executePgDump(args, env);
  } catch (error) {
    await fs.rm(tempPath, { force: true });
    throw error instanceof Error ? error : new Error("pg_dump failed");
  }

  return {
    filename: `assessment-platform-postgres-${format}-${timestamp}.${extension}`,
    mimeType: format === "plain" ? "application/sql; charset=utf-8" : "application/octet-stream",
    tempPath,
    cleanup: async () => {
      await fs.rm(tempPath, { force: true });
    }
  };
}

export function streamTempFile({
  tempPath,
  filename,
  mimeType,
  response
}: {
  tempPath: string;
  filename: string;
  mimeType: string;
  response: {
    setHeader(name: string, value: string): void;
    on(event: "close" | "finish", listener: () => void): void;
  } & NodeJS.WritableStream;
}) {
  response.setHeader("Content-Type", mimeType);
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.setHeader("Cache-Control", "no-store");

  return createReadStream(tempPath).pipe(response);
}

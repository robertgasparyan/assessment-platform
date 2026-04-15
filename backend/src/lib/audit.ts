import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

type AuditInput = {
  actorUserId?: string | null;
  assessmentRunId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  metadata?: unknown;
};

type NotificationInput = {
  userId: string;
  assessmentRunId?: string | null;
  type: string;
  title: string;
  message: string;
  linkUrl?: string | null;
};

export async function recordAuditLog(input: AuditInput) {
  const metadata =
    input.metadata === undefined
      ? undefined
      : input.metadata === null
        ? Prisma.JsonNull
        : (input.metadata as Prisma.InputJsonValue);

  await prisma.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      assessmentRunId: input.assessmentRunId ?? null,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary,
      ...(metadata !== undefined ? { metadata } : {})
    }
  });
}

export async function createNotification(input: NotificationInput) {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      assessmentRunId: input.assessmentRunId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      linkUrl: input.linkUrl ?? null
    }
  });
}

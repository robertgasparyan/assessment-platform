import {
  AssessmentParticipantStatus,
  AssessmentParticipantVisibility,
  AssessmentPeriodType,
  AssessmentResponseMode,
  AssessmentRunStatus,
  AssessmentTargetType,
  EmailDeliveryStatus,
  Prisma,
  TeamMembershipRole,
  UserRole
} from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { createSessionToken, hashPassword, verifyPassword } from "./lib/auth.js";
import { requireAdminAuth, requireRole, buildSessionExpiry } from "./lib/request-auth.js";
import { serializeAssessmentRun, serializeTemplateVersion } from "./lib/serializers.js";
import { recordAuditLog, createNotification } from "./lib/audit.js";
import { buildAssessmentResultsPayload } from "./lib/results.js";
import { generateResultsQuestionAnswer, getCachedOrGenerateResultsExecutiveSummary } from "./lib/ai-results.js";
import { generateAggregationInsight } from "./lib/ai-aggregation.js";
import { getCachedOrGenerateReportsAiBrief } from "./lib/ai-reports.js";
import {
  generateDomainAssist,
  generateChatTemplateDraft,
  generateFullTemplateDraft,
  generateSingleDomainQuestion,
  generateDomainQuestions,
  generateQuestionAssist,
  generateSingleTemplateDomain,
  generateTemplateConsistencyReview,
  generateTemplateDomains,
  generateTemplateScaffold
} from "./lib/ai-templates.js";
import { createTemplate, deleteTemplate, updateTemplate } from "./lib/template-service.js";
import {
  buildJsonExport,
  createPostgresDump,
  getPgDumpCapability,
  streamTempFile,
  type JsonExportMode,
  type PostgresDumpFormat
} from "./lib/admin-export.js";
import {
  getAiAssistantSettings,
  getApplicationBrandingSettings,
  getNavigationSearchSettings,
  getReportEmailDeliverySettings,
  updateAiAssistantSettings,
  updateSmtpConfiguration,
  updateApplicationBrandingSettings,
  updateNavigationSearchSettings,
  updateReportEmailDeliverySettings
} from "./lib/platform-settings.js";
import { buildDeterministicAssistantResponse, generateAiAssistantResponse } from "./lib/ai-assistant.js";
import {
  getAiSettingsSummary,
  getAiStatusForUser,
  testAiProviderConnection,
  updateAiSettings,
  type AiProvider
} from "./lib/ai-settings.js";
import { sendReportEmail } from "./lib/smtp.js";
import { config } from "./config.js";

const router = Router();

const templateSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  category: z.string().optional(),
  scoringLabels: z.array(z.string().min(1)).min(1),
  domains: z.array(
    z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      questions: z.array(
        z.object({
          prompt: z.string().min(1),
          guidance: z.string().optional(),
          levels: z.array(
            z.object({
              value: z.number().int().positive(),
              label: z.string().min(1),
              description: z.string().min(1)
            })
          ).min(2)
        })
      ).min(1)
    })
  ).min(1)
});

const quarterAssessmentRunSchema = z.object({
  title: z.string().min(2),
  teamId: z.string().min(1),
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1),
  ownerUserId: z.string().min(1).optional(),
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().datetime().optional(),
  guestParticipationEnabled: z.boolean().optional(),
  allowDuplicate: z.boolean().optional(),
  periodType: z.literal("QUARTER"),
  periodLabel: z.string().optional(),
  year: z.number().int().min(2024).max(2100),
  quarter: z.number().int().min(1).max(4)
});

const customRangeAssessmentRunSchema = z.object({
  title: z.string().min(2),
  teamId: z.string().min(1),
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1),
  ownerUserId: z.string().min(1).optional(),
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().datetime().optional(),
  guestParticipationEnabled: z.boolean().optional(),
  allowDuplicate: z.boolean().optional(),
  periodType: z.literal("CUSTOM_RANGE"),
  periodLabel: z.string().optional(),
  startDate: z.string().datetime(),
  endDate: z.string().datetime()
});

const pointInTimeAssessmentRunSchema = z.object({
  title: z.string().min(2),
  teamId: z.string().min(1),
  templateId: z.string().min(1),
  templateVersionId: z.string().min(1),
  ownerUserId: z.string().min(1).optional(),
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().datetime().optional(),
  guestParticipationEnabled: z.boolean().optional(),
  allowDuplicate: z.boolean().optional(),
  periodType: z.literal("POINT_IN_TIME"),
  periodLabel: z.string().optional(),
  referenceDate: z.string().datetime()
});

const participantCollectionSchema = z.object({
  userIds: z.array(z.string().min(1)).optional(),
  externalContactIds: z.array(z.string().min(1)).optional()
});

const assessmentParticipationSchema = z.object({
  responseMode: z.nativeEnum(AssessmentResponseMode).optional(),
  participantVisibility: z.nativeEnum(AssessmentParticipantVisibility).optional(),
  minimumParticipantResponses: z.number().int().min(1).optional().nullable(),
  participantCollection: participantCollectionSchema.optional()
});

const assessmentRunSchema = z
  .union([
    quarterAssessmentRunSchema.merge(assessmentParticipationSchema),
    customRangeAssessmentRunSchema.merge(assessmentParticipationSchema),
    pointInTimeAssessmentRunSchema.merge(assessmentParticipationSchema)
  ])
  .superRefine((input, context) => {
    if (input.periodType === "CUSTOM_RANGE" && new Date(input.endDate) < new Date(input.startDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after start date",
        path: ["endDate"]
      });
    }

    const participantCount =
      (input.participantCollection?.userIds?.length ?? 0)
      + (input.participantCollection?.externalContactIds?.length ?? 0);

    if (input.responseMode === AssessmentResponseMode.INDIVIDUAL_AGGREGATED && participantCount === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Individual aggregated runs need at least one participant.",
        path: ["participantCollection"]
      });
    }
  });

const responseSchema = z.object({
  responses: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedValue: z.number().int().positive(),
      selectedLabel: z.string().min(1),
      comment: z.string().nullable().optional()
    })
  )
});

const submitAssessmentSchema = z.object({
  submissionSummary: z.string().trim().max(2000).optional()
});

const internalParticipantsSchema = z.object({
  userIds: z.array(z.string().min(1)).min(1)
});

const externalParticipantsSchema = z.object({
  externalContactIds: z.array(z.string().min(1)).min(1),
  expiresInDays: z.number().int().min(1).max(90).optional()
});

const participantLinkLifecycleSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional().nullable()
});

const actionItemSchema = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  domainTitle: z.string().trim().max(180).optional().or(z.literal("")),
  ownerName: z.string().trim().max(120).optional().or(z.literal("")),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(["OPEN", "IN_PROGRESS", "DONE", "BLOCKED"]).optional()
});

const updateAssessmentRunSchema = z.object({
  title: z.string().min(2),
  ownerUserId: z.string().min(1).optional().nullable(),
  ownerName: z.string().trim().min(1).optional().or(z.literal("")),
  dueDate: z.string().datetime().optional().nullable(),
  periodLabel: z.string().trim().min(1).optional().or(z.literal(""))
});

const categorySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional()
});

const teamSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  groupId: z.string().min(1).optional().nullable()
});

const teamGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  sortOrder: z.number().int().optional()
});

const teamMemberSchema = z.object({
  userId: z.string().min(1),
  membershipRole: z.nativeEnum(TeamMembershipRole)
});

const userMembershipSchema = z.object({
  teamId: z.string().min(1),
  membershipRole: z.nativeEnum(TeamMembershipRole)
});

const createUserSchema = z.object({
  displayName: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  role: z.nativeEnum(UserRole),
  isActive: z.boolean().optional(),
  password: z.string().min(4).optional().or(z.literal("")),
  mustChangePassword: z.boolean().optional(),
  memberships: z.array(userMembershipSchema).default([])
});

const updateUserSchema = z.object({
  displayName: z.string().min(1),
  username: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  role: z.nativeEnum(UserRole),
  isActive: z.boolean(),
  mustChangePassword: z.boolean().optional(),
  memberships: z.array(userMembershipSchema).default([])
});

const resetUserPasswordSchema = z.object({
  newPassword: z.string().min(4)
});

const inviteUserSchema = z.object({
  expiresInDays: z.number().int().min(1).max(30).optional()
});

const reportShareSchema = z.object({
  expiresInDays: z.number().int().min(1).max(90).optional()
});

const guestAssessmentLinkSchema = z.object({
  inviteLabel: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  externalContactId: z.string().trim().min(1).optional().or(z.literal("")),
  expiresInDays: z.number().int().min(1).max(30).optional()
});

const externalContactSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  email: z.string().trim().email().optional().or(z.literal("")),
  organization: z.string().trim().max(160).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal(""))
});

const guestAssessmentIdentitySchema = z.object({
  guestDisplayName: z.string().trim().min(1).max(120),
  guestEmail: z.string().trim().email().optional().or(z.literal(""))
});

const guestAssessmentResponsesSchema = guestAssessmentIdentitySchema.extend({
  responses: z.array(
    z.object({
      questionId: z.string().min(1),
      selectedValue: z.number().int().positive(),
      selectedLabel: z.string().min(1),
      comment: z.string().nullable().optional()
    })
  )
});

const guestAssessmentSubmitSchema = guestAssessmentIdentitySchema;

const guestParticipationSettingsSchema = z.object({
  guestParticipationEnabled: z.boolean(),
  guestResultsVisible: z.boolean()
});

const resultsAiQuestionSchema = z.object({
  question: z.string().trim().min(3),
  compareToRunId: z.string().trim().min(1).optional(),
  history: z
    .array(
      z.object({
        question: z.string(),
        answer: z.string()
      })
    )
    .max(8)
    .optional()
});

const reportEmailDeliverySchema = z.object({
  enabled: z.boolean()
});

const smtpConfigurationSchema = z.object({
  host: z.string().trim().min(1),
  port: z.number().int().min(1).max(65535),
  from: z.string().trim().min(1)
});

const applicationBrandingSchema = z.object({
  applicationTitle: z.string().trim().max(80)
});

const navigationSearchSchema = z.object({
  enabled: z.boolean()
});

const aiAssistantSettingsSchema = z.object({
  enabled: z.boolean()
});

const aiProviderSchema = z.enum(["ollama", "openai", "claude", "gemini"]);

const aiProviderConfigSchema = z.object({
  enabled: z.boolean(),
  baseUrl: z.string().trim().min(1),
  model: z.string().trim(),
  apiKey: z.string().optional(),
  clearApiKey: z.boolean().optional()
});

const aiSettingsSchema = z.object({
  enabled: z.boolean(),
  activeProvider: aiProviderSchema,
  showProviderToUsers: z.boolean(),
  providers: z.object({
    ollama: aiProviderConfigSchema,
    openai: aiProviderConfigSchema,
    claude: aiProviderConfigSchema,
    gemini: aiProviderConfigSchema
  })
});

const aiProviderTestSchema = z.object({
  provider: aiProviderSchema,
  config: aiProviderConfigSchema
});

const aiAssistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(500),
  currentPath: z.string().trim().max(200).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(800)
      })
    )
    .max(8)
    .optional()
});

const reportsAiBriefSchema = z.object({
  viewMode: z.enum(["team", "team-template"]),
  selectedQuestionLabel: z.string().nullable(),
  selectedDomainLabel: z.string().nullable(),
  summary: z.object({
    rowsCount: z.number().int().min(0),
    averageLatestScore: z.number().nullable(),
    highestRowLabel: z.string().nullable(),
    mostCommonWeakestDomainTitle: z.string().nullable()
  }),
  filters: z.object({
    search: z.string(),
    team: z.string(),
    template: z.string(),
    category: z.string(),
    domain: z.string(),
    question: z.string()
  }),
  rows: z.array(
    z.object({
      teamName: z.string(),
      templateName: z.string(),
      periodLabel: z.string(),
      overallScore: z.number().nullable(),
      strongestDomainTitle: z.string().nullable(),
      weakestDomainTitle: z.string().nullable()
    })
  ),
  domainSnapshot: z.array(
    z.object({
      title: z.string(),
      averageScore: z.number().nullable(),
      teamCount: z.number().int().min(0)
    })
  ),
  questionSnapshot: z.array(
    z.object({
      teamName: z.string(),
      templateName: z.string(),
      domainTitle: z.string(),
      selectedLabel: z.string().nullable(),
      selectedValue: z.number().nullable()
    })
  )
});

const templateAiQuestionAssistSchema = z.object({
  templateName: z.string(),
  domainTitle: z.string(),
  scoringLabels: z.array(z.string()),
  prompt: z.string(),
  guidance: z.string(),
  levels: z.array(
    z.object({
      value: z.number(),
      label: z.string(),
      description: z.string()
    })
  )
});

const templateAiDomainAssistSchema = z.object({
  templateName: z.string(),
  domainTitle: z.string(),
  description: z.string(),
  questionPrompts: z.array(z.string())
});

const templateAiConsistencyReviewSchema = z.object({
  templateName: z.string(),
  templateDescription: z.string(),
  category: z.string(),
  scoringLabels: z.array(z.string()),
  domains: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      questions: z.array(
        z.object({
          prompt: z.string(),
          guidance: z.string(),
          levels: z.array(
            z.object({
              value: z.number(),
              label: z.string(),
              description: z.string()
            })
          )
        })
      )
    })
  )
});

const templateAiScaffoldSchema = z.object({
  brief: z.string().trim().min(10),
  category: z.string(),
  scoringLabels: z.array(z.string()).min(2)
});

const templateAiDomainSuggestionsSchema = z.object({
  templateName: z.string(),
  templateDescription: z.string(),
  category: z.string(),
  scoringLabels: z.array(z.string()).min(2),
  brief: z.string().trim().min(10)
});

const templateAiSingleDomainSchema = z.object({
  templateName: z.string(),
  templateDescription: z.string(),
  category: z.string(),
  scoringLabels: z.array(z.string()).min(2),
  brief: z.string().trim().min(10),
  existingDomainTitles: z.array(z.string())
});

const templateAiSingleQuestionSchema = z.object({
  templateName: z.string(),
  templateDescription: z.string(),
  scoringLabels: z.array(z.string()).min(2),
  domainTitle: z.string(),
  domainDescription: z.string(),
  brief: z.string().trim().min(10),
  existingQuestionPrompts: z.array(z.string())
});

const templateAiDomainQuestionsSchema = z.object({
  templateName: z.string(),
  templateDescription: z.string(),
  scoringLabels: z.array(z.string()).min(2),
  domainTitle: z.string(),
  domainDescription: z.string(),
  brief: z.string().trim().min(10)
});

const templateAiFullDraftSchema = z.object({
  brief: z.string().trim().min(10),
  category: z.string(),
  scoringLabels: z.array(z.string()).min(2)
});

const templateAiChatDraftSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().trim().min(1).max(4000)
    })
  ).min(1).max(20),
  category: z.string(),
  scoringLabels: z.array(z.string()).min(2)
});

const sendReportEmailSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().trim().max(120).optional().or(z.literal("")),
  note: z.string().trim().max(1500).optional().or(z.literal("")),
  expiresInDays: z.number().int().min(1).max(90).optional()
});

const jsonExportSchema = z.object({
  mode: z.enum(["portable", "full"]).default("portable")
});

const postgresDumpSchema = z.object({
  format: z.enum(["plain", "custom"]).default("custom")
});

const levelSchema = z.object({
  value: z.number().int().positive(),
  label: z.string().min(1),
  description: z.string().min(1)
});

const questionLibrarySchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(1),
  guidance: z.string().optional(),
  levels: z.array(levelSchema).min(2)
});

const domainLibrarySchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  questions: z.array(questionLibrarySchema).min(1)
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1)
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(4)
});

const activateAccountSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(4)
});

const templateDraftSchema = z.object({
  name: z.string(),
  slug: z.string(),
  description: z.string().optional(),
  category: z.string().optional(),
  scoringLabels: z.array(z.string()).min(2),
  domains: z.array(
    z.object({
      id: z.string().optional(),
      title: z.string(),
      description: z.string().optional(),
      libraryId: z.string().optional(),
      questions: z.array(
        z.object({
          id: z.string().optional(),
          prompt: z.string(),
          guidance: z.string().optional(),
          libraryId: z.string().optional(),
          levels: z.array(
            z.object({
              value: z.number().int().positive(),
              label: z.string(),
              description: z.string()
            })
          ).min(2)
        })
      )
    })
  )
});

const templateDraftStatusSchema = z.object({
  status: z.enum(["DRAFT", "READY_FOR_REVIEW"])
});

function serializeTemplateDraft(draft: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  status: string;
  scoringLabels: unknown;
  draftData: unknown;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: draft.id,
    name: draft.name,
    slug: draft.slug,
    description: draft.description,
    category: draft.category,
    status: draft.status,
    scoringLabels: draft.scoringLabels as string[],
    ...((draft.draftData as object) ?? {}),
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt
  };
}

function serializeUser(user: {
  id: string;
  displayName: string;
  username: string;
  email: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  teamMemberships?: Array<{
    id: string;
    membershipRole: TeamMembershipRole;
    team: {
      id: string;
      name: string;
      description: string | null;
    };
  }>;
}) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    teams: (user.teamMemberships ?? []).map((membership) => ({
      id: membership.team.id,
      name: membership.team.name,
      description: membership.team.description,
      membershipRole: membership.membershipRole
    }))
  };
}

function serializeAssessmentRunSummary(run: {
  id: string;
  title: string;
  targetId?: string | null;
  responseMode?: AssessmentResponseMode;
  minimumParticipantResponses?: number | null;
  ownerUserId: string | null;
  ownerName: string | null;
  dueDate: Date | null;
  guestParticipationEnabled: boolean;
  periodType: AssessmentPeriodType;
  periodLabel: string;
  periodBucket: string;
  status: AssessmentRunStatus;
  overallScore: number | null;
  submissionSummary: string | null;
  submittedAt: Date | null;
  updatedAt: Date;
  team: {
    id: string;
    name: string;
    description: string | null;
    group?: {
      id: string;
      name: string;
      description: string | null;
    } | null;
    createdAt?: Date;
    updatedAt?: Date;
  };
  target?: {
    id: string;
    type: AssessmentTargetType;
    displayName: string;
  } | null;
  templateVersion: {
    id?: string;
    name: string;
    versionNumber: number;
  };
  templateVersionId?: string;
}) {
  return {
    id: run.id,
    title: run.title,
    target: run.target
      ? {
          id: run.target.id,
          type: run.target.type,
          displayName: run.target.displayName
        }
      : {
          id: run.targetId ?? run.team.id,
          type: AssessmentTargetType.TEAM,
          displayName: run.team.name
        },
    responseMode: run.responseMode ?? AssessmentResponseMode.SHARED,
    minimumParticipantResponses: run.minimumParticipantResponses ?? null,
    ownerUser: run.ownerUserId
      ? {
          id: run.ownerUserId
        }
      : null,
    ownerName: run.ownerName,
    dueDate: run.dueDate,
    guestParticipationEnabled: run.guestParticipationEnabled,
    periodType: run.periodType,
    periodLabel: run.periodLabel,
    periodBucket: run.periodBucket,
    status: run.status,
    overallScore: run.overallScore,
    submittedAt: run.submittedAt,
    submissionSummary: run.submissionSummary,
    updatedAt: run.updatedAt,
    team: {
      id: run.team.id,
      name: run.team.name,
      description: run.team.description ?? undefined,
      group: run.team.group
        ? {
            id: run.team.group.id,
            name: run.team.group.name,
            description: run.team.group.description
          }
        : null
    },
    templateVersion: {
      id: run.templateVersionId ?? run.templateVersion.id ?? "",
      name: run.templateVersion.name,
      versionNumber: run.templateVersion.versionNumber
    }
  };
}

function startOfQuarter(year: number, quarter: number) {
  return new Date(Date.UTC(year, (quarter - 1) * 3, 1));
}

function formatDateLabel(date: Date) {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC"
  });
}

function buildAssessmentPeriod(input: z.infer<typeof assessmentRunSchema>) {
  if (input.periodType === "QUARTER") {
    return {
      periodType: AssessmentPeriodType.QUARTER,
      periodLabel: input.periodLabel?.trim() || `Q${input.quarter} ${input.year}`,
      periodBucket: `QUARTER:${input.year}:Q${input.quarter}`,
      periodSortDate: startOfQuarter(input.year, input.quarter),
      year: input.year,
      quarter: input.quarter,
      startDate: null,
      endDate: null,
      referenceDate: null
    };
  }

  if (input.periodType === "CUSTOM_RANGE") {
    const startDate = new Date(input.startDate);
    const endDate = new Date(input.endDate);
    return {
      periodType: AssessmentPeriodType.CUSTOM_RANGE,
      periodLabel: input.periodLabel?.trim() || `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}`,
      periodBucket: `CUSTOM_RANGE:${startDate.toISOString().slice(0, 10)}:${endDate.toISOString().slice(0, 10)}`,
      periodSortDate: startDate,
      year: null,
      quarter: null,
      startDate,
      endDate,
      referenceDate: null
    };
  }

  const referenceDate = new Date(input.referenceDate);
  return {
    periodType: AssessmentPeriodType.POINT_IN_TIME,
    periodLabel: input.periodLabel?.trim() || formatDateLabel(referenceDate),
    periodBucket: `POINT_IN_TIME:${referenceDate.toISOString().slice(0, 10)}`,
    periodSortDate: referenceDate,
    year: null,
    quarter: null,
    startDate: null,
    endDate: null,
    referenceDate
  };
}

async function findDuplicateRuns(input: z.infer<typeof assessmentRunSchema>) {
  const period = buildAssessmentPeriod(input);
  return prisma.assessmentRun.findMany({
    where: {
      teamId: input.teamId,
      templateId: input.templateId,
      periodBucket: period.periodBucket,
      status: {
        in: [AssessmentRunStatus.DRAFT, AssessmentRunStatus.IN_PROGRESS, AssessmentRunStatus.SUBMITTED]
      }
    },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      templateVersion: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });
}

async function ensureTeamAssessmentTarget(
  transaction: Prisma.TransactionClient,
  teamId: string
) {
  const team = await transaction.team.findUnique({
    where: { id: teamId },
    select: { id: true, name: true }
  });

  if (!team) {
    throw new Error("Team not found");
  }

  return transaction.assessmentTarget.upsert({
    where: { teamId: team.id },
    create: {
      type: AssessmentTargetType.TEAM,
      displayName: team.name,
      teamId: team.id
    },
    update: {
      displayName: team.name
    }
  });
}

function normalizeParticipantUserIds(userIds: string[]) {
  return Array.from(new Set(userIds.map((userId) => userId.trim()).filter(Boolean)));
}

async function findInvalidTeamParticipantUserIds(teamId: string, userIds: string[]) {
  const normalizedUserIds = normalizeParticipantUserIds(userIds);
  if (normalizedUserIds.length === 0) {
    return [];
  }

  const memberships = await prisma.userTeamMembership.findMany({
    where: {
      teamId,
      userId: {
        in: normalizedUserIds
      },
      user: {
        isActive: true
      }
    },
    select: {
      userId: true
    }
  });

  const validUserIds = new Set(memberships.map((membership) => membership.userId));
  return normalizedUserIds.filter((userId) => !validUserIds.has(userId));
}

async function createInternalParticipantSet({
  transaction,
  assessmentRunId,
  userIds
}: {
  transaction: Prisma.TransactionClient;
  assessmentRunId: string;
  userIds: string[];
}) {
  const normalizedUserIds = normalizeParticipantUserIds(userIds);
  if (normalizedUserIds.length === 0) {
    return;
  }

  const users = await transaction.user.findMany({
    where: {
      id: { in: normalizedUserIds },
      isActive: true
    },
    select: {
      id: true,
      displayName: true,
      email: true
    }
  });

  await Promise.all(
    users.map((user) =>
      transaction.assessmentRunParticipant.upsert({
        where: {
          assessmentRunId_userId: {
            assessmentRunId,
            userId: user.id
          }
        },
        create: {
          assessmentRunId,
          userId: user.id,
          displayName: user.displayName,
          email: user.email,
          status: AssessmentParticipantStatus.INVITED
        },
        update: {
          displayName: user.displayName,
          email: user.email
        }
      })
    )
  );
}

function normalizeExternalContactIds(contactIds: string[]) {
  return Array.from(new Set(contactIds.map((contactId) => contactId.trim()).filter(Boolean)));
}

async function createExternalParticipantSet({
  transaction,
  assessmentRunId,
  externalContactIds,
  expiresAt
}: {
  transaction: Prisma.TransactionClient;
  assessmentRunId: string;
  externalContactIds: string[];
  expiresAt?: Date | null;
}) {
  const normalizedContactIds = normalizeExternalContactIds(externalContactIds);
  if (normalizedContactIds.length === 0) {
    return;
  }

  const contacts = await transaction.externalContact.findMany({
    where: {
      id: { in: normalizedContactIds }
    },
    select: {
      id: true,
      displayName: true,
      email: true
    }
  });

  await Promise.all(
    contacts.map((contact) =>
      transaction.assessmentRunParticipant.upsert({
        where: {
          assessmentRunId_externalContactId: {
            assessmentRunId,
            externalContactId: contact.id
          }
        },
        create: {
          assessmentRunId,
          externalContactId: contact.id,
          externalAccessToken: createShareToken(),
          externalAccessExpiresAt: expiresAt ?? null,
          displayName: contact.displayName,
          email: contact.email,
          status: AssessmentParticipantStatus.INVITED
        },
        update: {
          displayName: contact.displayName,
          email: contact.email,
          externalAccessRevoked: false,
          externalAccessExpiresAt: expiresAt ?? undefined,
          externalAccessToken: createShareToken()
        }
      })
    )
  );
}

function serializeAssessmentRunParticipant(participant: {
  id: string;
  displayName: string;
  email: string | null;
  status: AssessmentParticipantStatus;
  invitedAt: Date;
  startedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: {
    id: string;
    displayName: string;
    username: string;
    email: string | null;
  } | null;
  externalContact: {
    id: string;
    displayName: string;
    email: string | null;
    organization: string | null;
  } | null;
  externalAccessToken?: string | null;
  externalAccessExpiresAt?: Date | null;
  externalAccessRevoked?: boolean;
  emailDeliveries?: Array<{
    id: string;
    type: string;
    status: EmailDeliveryStatus;
    recipientEmail: string;
    sentAt: Date | null;
    failedAt: Date | null;
    createdAt: Date;
    errorMessage: string | null;
  }>;
  _count?: {
    responses: number;
  };
}) {
  return {
    id: participant.id,
    displayName: participant.displayName,
    email: participant.email,
    status: participant.status,
    invitedAt: participant.invitedAt,
    startedAt: participant.startedAt,
    submittedAt: participant.submittedAt,
    createdAt: participant.createdAt,
    updatedAt: participant.updatedAt,
    user: participant.user,
    externalContact: participant.externalContact,
    externalAccessUrl: participant.externalAccessToken ? `/external-participant-assessments/${participant.externalAccessToken}` : null,
    externalAccessExpiresAt: participant.externalAccessExpiresAt ?? null,
    externalAccessRevoked: participant.externalAccessRevoked ?? false,
    latestEmailDelivery: participant.emailDeliveries?.[0]
      ? {
          id: participant.emailDeliveries[0].id,
          type: participant.emailDeliveries[0].type,
          status: participant.emailDeliveries[0].status,
          recipientEmail: participant.emailDeliveries[0].recipientEmail,
          sentAt: participant.emailDeliveries[0].sentAt,
          failedAt: participant.emailDeliveries[0].failedAt,
          createdAt: participant.emailDeliveries[0].createdAt,
          errorMessage: participant.emailDeliveries[0].errorMessage
        }
      : null,
    responseCount: participant._count?.responses ?? 0
  };
}

type ParticipantAssessmentRunGraph = Prisma.AssessmentRunGetPayload<{
  include: {
    team: {
      include: {
        group: true;
      };
    };
    target: true;
    ownerUser: true;
    templateVersion: {
      include: {
        domains: {
          include: {
            questions: {
              include: {
                levels: true;
              };
            };
          };
        };
      };
    };
  };
}>;

type ParticipantWithResponses = Prisma.AssessmentRunParticipantGetPayload<{
  include: {
    responses: true;
  };
}>;

function serializeParticipantAssessmentRun(run: ParticipantAssessmentRunGraph, participant: ParticipantWithResponses) {
  const domains = run.templateVersion.domains
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((domain) => {
      const questions = domain.questions
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((question) => {
          const participantResponse = participant.responses.find((item) => item.questionId === question.id);
          return {
            id: question.id,
            prompt: question.prompt,
            guidance: question.guidance,
            levels: question.levels
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((level) => ({
                id: level.id,
                value: level.value,
                label: level.label,
                description: level.description
              })),
            response: participantResponse
              ? {
                  selectedValue: participantResponse.selectedValue,
                  selectedLabel: participantResponse.selectedLabel,
                  comment: participantResponse.comment
                }
              : null
          };
        });

      const scoreValues = questions
        .map((question) => question.response?.selectedValue)
        .filter((value): value is number => typeof value === "number");

      return {
        id: domain.id,
        title: domain.title,
        description: domain.description,
        answeredQuestions: questions.filter((question) => question.response).length,
        totalQuestions: questions.length,
        averageScore: scoreValues.length
          ? Number((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length).toFixed(2))
          : null,
        questions
      };
    });

  return {
    id: run.id,
    title: run.title,
    target: run.target
      ? {
          id: run.target.id,
          type: run.target.type,
          displayName: run.target.displayName
        }
      : {
          id: run.team.id,
          type: AssessmentTargetType.TEAM,
          displayName: run.team.name
        },
    responseMode: run.responseMode,
    minimumParticipantResponses: run.minimumParticipantResponses,
    team: run.team,
    ownerUser: run.ownerUser
      ? {
          id: run.ownerUser.id,
          displayName: run.ownerUser.displayName,
          username: run.ownerUser.username,
          role: run.ownerUser.role
        }
      : null,
    ownerName: run.ownerName,
    assignmentHistory: [],
    dueDate: run.dueDate,
    guestParticipationEnabled: run.guestParticipationEnabled,
    guestResultsVisible: run.guestResultsVisible,
    periodType: run.periodType,
    periodLabel: run.periodLabel,
    periodBucket: run.periodBucket,
    periodSortDate: run.periodSortDate,
    year: run.year,
    quarter: run.quarter,
    startDate: run.startDate,
    endDate: run.endDate,
    referenceDate: run.referenceDate,
    status: run.status,
    submittedAt: run.submittedAt,
    submissionSummary: run.submissionSummary,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    overallScore: null,
    templateVersion: serializeTemplateVersion(run.templateVersion),
    domains,
    participant: {
      id: participant.id,
      status: participant.status,
      displayName: participant.displayName,
      email: participant.email,
      invitedAt: participant.invitedAt,
      startedAt: participant.startedAt,
      submittedAt: participant.submittedAt
    }
  };
}

type SessionUser = NonNullable<Express.Request["adminUser"]>;

const templateManagerRoles = new Set<UserRole>([UserRole.ADMIN, UserRole.TEMPLATE_MANAGER]);
const assessmentManagerRoles = new Set<UserRole>([UserRole.ADMIN, UserRole.TEAM_LEAD]);

async function getUserTeamIds(userId: string) {
  const memberships = await prisma.userTeamMembership.findMany({
    where: { userId },
    select: { teamId: true }
  });

  return memberships.map((membership) => membership.teamId);
}

async function buildAccessibleRunWhere(user: SessionUser): Promise<Prisma.AssessmentRunWhereInput> {
  if (user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER) {
    return {};
  }

  const teamIds = await getUserTeamIds(user.id);
  const visibility = {
    OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
  } satisfies Prisma.AssessmentRunWhereInput;

  if (user.role === UserRole.VIEWER) {
    return {
      AND: [visibility, { status: AssessmentRunStatus.SUBMITTED }]
    };
  }

  return visibility;
}

async function getAssistantActionOptions(user: SessionUser) {
  const actions = [
    {
      id: "dashboard",
      label: "Open Dashboard",
      description: "Go to the operational home page",
      to: "/",
      roles: [UserRole.ADMIN, UserRole.TEMPLATE_MANAGER, UserRole.TEAM_LEAD, UserRole.TEAM_MEMBER, UserRole.VIEWER]
    },
    {
      id: "assessments-create",
      label: "Create assessment",
      description: "Open Assessments on the Create tab",
      to: "/assessments?tab=create",
      roles: [UserRole.ADMIN, UserRole.TEAM_LEAD, UserRole.TEAM_MEMBER, UserRole.VIEWER]
    },
    {
      id: "assessments-active",
      label: "Open active assessments",
      description: "Review draft and in-progress runs",
      to: "/assessments?tab=active",
      roles: [UserRole.ADMIN, UserRole.TEAM_LEAD, UserRole.TEAM_MEMBER, UserRole.VIEWER]
    },
    {
      id: "assessments-submitted",
      label: "Open submitted assessments",
      description: "Review completed runs",
      to: "/assessments?tab=submitted",
      roles: [UserRole.ADMIN, UserRole.TEAM_LEAD, UserRole.TEAM_MEMBER, UserRole.VIEWER]
    },
    {
      id: "my-assessments",
      label: "Open My Assessments",
      description: "Go to your personal assessment workspace",
      to: "/my-assessments",
      roles: [UserRole.ADMIN, UserRole.TEMPLATE_MANAGER, UserRole.TEAM_LEAD, UserRole.TEAM_MEMBER, UserRole.VIEWER]
    },
    {
      id: "templates",
      label: "Open Templates",
      description: "Go to template authoring and versions",
      to: "/templates",
      roles: [UserRole.ADMIN, UserRole.TEMPLATE_MANAGER]
    },
    {
      id: "reports",
      label: "Open Reports",
      description: "Go to current-state reporting across teams",
      to: "/reports",
      roles: [UserRole.ADMIN, UserRole.TEMPLATE_MANAGER, UserRole.TEAM_LEAD, UserRole.TEAM_MEMBER, UserRole.VIEWER]
    },
    {
      id: "administration",
      label: "Open Administration",
      description: "Go to administrator settings",
      to: "/administration",
      roles: [UserRole.ADMIN]
    },
    {
      id: "users",
      label: "Open Users",
      description: "Go to user management",
      to: "/administration?tab=users",
      roles: [UserRole.ADMIN]
    },
    {
      id: "teams",
      label: "Open Teams",
      description: "Go to team administration",
      to: "/teams",
      roles: [UserRole.ADMIN]
    },
    {
      id: "audit-trail",
      label: "Open Audit Trail",
      description: "Go to governance and audit history",
      to: "/administration?tab=audit",
      roles: [UserRole.ADMIN]
    }
  ];

  return actions.filter((action) => action.roles.includes(user.role)).map(({ roles: _roles, ...action }) => action);
}

async function canAccessAssessmentRun(user: SessionUser, runId: string) {
  if (user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER) {
    return true;
  }

  const participant = await prisma.assessmentRunParticipant.findUnique({
    where: {
      assessmentRunId_userId: {
        assessmentRunId: runId,
        userId: user.id
      }
    },
    select: {
      id: true
    }
  });

  if (participant) {
    return true;
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      teamId: true,
      ownerUserId: true,
      status: true
    }
  });

  if (!run) {
    return false;
  }

  if (user.role === UserRole.VIEWER && run.status !== AssessmentRunStatus.SUBMITTED) {
    return false;
  }

  if (run.ownerUserId === user.id) {
    return true;
  }

  const teamIds = await getUserTeamIds(user.id);
  return teamIds.includes(run.teamId);
}

async function getInternalParticipantForUser(runId: string, userId: string) {
  return prisma.assessmentRunParticipant.findUnique({
    where: {
      assessmentRunId_userId: {
        assessmentRunId: runId,
        userId
      }
    },
    include: {
      responses: true
    }
  });
}

async function getActiveExternalParticipant(token: string) {
  return prisma.assessmentRunParticipant.findFirst({
    where: {
      externalAccessToken: token,
      externalAccessRevoked: false,
      externalContactId: {
        not: null
      },
      assessmentRun: {
        responseMode: AssessmentResponseMode.INDIVIDUAL_AGGREGATED,
        status: {
          in: [AssessmentRunStatus.DRAFT, AssessmentRunStatus.IN_PROGRESS]
        }
      },
      OR: [{ externalAccessExpiresAt: null }, { externalAccessExpiresAt: { gt: new Date() } }]
    },
    include: {
      responses: true
    }
  });
}

async function canManageAssessmentRun(user: SessionUser, runId: string) {
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      teamId: true,
      ownerUserId: true,
      status: true
    }
  });

  if (!run || run.status === AssessmentRunStatus.SUBMITTED) {
    return false;
  }

  if (run.ownerUserId === user.id) {
    return true;
  }

  if (user.role === UserRole.TEAM_LEAD) {
    const teamIds = await getUserTeamIds(user.id);
    return teamIds.includes(run.teamId);
  }

  return false;
}

async function canViewGuestParticipation(user: SessionUser, runId: string) {
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      teamId: true,
      ownerUserId: true
    }
  });

  if (!run) {
    return false;
  }

  if (run.ownerUserId === user.id) {
    return true;
  }

  if (user.role === UserRole.TEAM_LEAD) {
    const teamIds = await getUserTeamIds(user.id);
    return teamIds.includes(run.teamId);
  }

  return false;
}

async function canEditAssessmentResponses(user: SessionUser, runId: string) {
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      teamId: true,
      ownerUserId: true,
      status: true
    }
  });

  if (!run || run.status === AssessmentRunStatus.SUBMITTED || run.status === AssessmentRunStatus.ARCHIVED) {
    return false;
  }

  if (run.ownerUserId === user.id) {
    return true;
  }

  if (user.role === UserRole.TEAM_LEAD || user.role === UserRole.TEAM_MEMBER) {
    const teamIds = await getUserTeamIds(user.id);
    return teamIds.includes(run.teamId);
  }

  return false;
}

async function canCreateAssessmentForTeam(user: SessionUser, teamId: string) {
  if (user.role === UserRole.ADMIN) {
    return true;
  }

  if (!assessmentManagerRoles.has(user.role)) {
    return false;
  }

  const teamIds = await getUserTeamIds(user.id);
  return teamIds.includes(teamId);
}

async function canAccessTeam(user: SessionUser, teamId: string) {
  if (user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER) {
    return true;
  }

  const teamIds = await getUserTeamIds(user.id);
  return teamIds.includes(teamId);
}

function serializeTeam(team: {
  id: string;
  name: string;
  description: string | null;
  group?: {
    id: string;
    name: string;
    description: string | null;
  } | null;
  _count?: {
    memberships?: number;
    assessmentRuns?: number;
  };
}) {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    group: team.group
      ? {
          id: team.group.id,
          name: team.group.name,
          description: team.group.description
        }
      : null,
    counts: team._count
      ? {
          members: team._count.memberships ?? 0,
          assessmentRuns: team._count.assessmentRuns ?? 0
        }
      : undefined
  };
}

function roundDelta(value: number | null) {
  return typeof value === "number" ? Number(value.toFixed(2)) : null;
}

function createInviteToken() {
  return createSessionToken();
}

function createShareToken() {
  return createSessionToken();
}

function startOfTodayUtc() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getDuePriority(dueDate: Date | null) {
  if (!dueDate) {
    return { rank: 3, label: "none" as const };
  }

  const today = startOfTodayUtc();
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { rank: 0, label: "overdue" as const };
  }

  if (diffDays <= 3) {
    return { rank: 1, label: "due_soon" as const };
  }

  return { rank: 2, label: "scheduled" as const };
}

function getDueBadgeLabel(dueDate: Date | null) {
  const priority = getDuePriority(dueDate);
  if (priority.label === "overdue") {
    return "Overdue";
  }
  if (priority.label === "due_soon") {
    return "Due soon";
  }
  return null;
}

function buildShareUrl(token: string) {
  return `${config.clientUrl.replace(/\/$/, "")}/shared-results/${token}`;
}

function buildGuestAssessmentUrl(token: string) {
  return `${config.clientUrl.replace(/\/$/, "")}/guest-assessments/${token}`;
}

function buildExternalParticipantAssessmentUrl(token: string) {
  return `${config.clientUrl.replace(/\/$/, "")}/external-participant-assessments/${token}`;
}

function serializeGuestAssessmentLink(link: {
  id: string;
  token: string;
  externalContactId?: string | null;
  inviteLabel: string | null;
  guestDisplayName: string | null;
  guestEmail: string | null;
  isRevoked: boolean;
  expiresAt: Date | null;
  startedAt: Date | null;
  lastAccessedAt: Date | null;
  submittedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: link.id,
    token: link.token,
    externalContactId: link.externalContactId ?? null,
    inviteLabel: link.inviteLabel,
    guestDisplayName: link.guestDisplayName,
    guestEmail: link.guestEmail,
    isRevoked: link.isRevoked,
    expiresAt: link.expiresAt,
    startedAt: link.startedAt,
    lastAccessedAt: link.lastAccessedAt,
    submittedAt: link.submittedAt,
    createdAt: link.createdAt,
    guestUrl: `/guest-assessments/${link.token}`
  };
}

function serializeExternalContact(contact: {
  id: string;
  displayName: string;
  email: string | null;
  organization: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    guestAssessmentLinks: number;
    assessmentParticipants: number;
    assessmentTargets: number;
  };
}) {
  const usage = contact._count
    ? {
        guestLinks: contact._count.guestAssessmentLinks,
        participants: contact._count.assessmentParticipants,
        targets: contact._count.assessmentTargets,
        total:
          contact._count.guestAssessmentLinks
          + contact._count.assessmentParticipants
          + contact._count.assessmentTargets
      }
    : undefined;

  return {
    id: contact.id,
    displayName: contact.displayName,
    email: contact.email,
    organization: contact.organization,
    notes: contact.notes,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    usage
  };
}

function serializeEmailDeliveryLog(log: Prisma.EmailDeliveryLogGetPayload<{
  include: {
    assessmentRun: {
      select: {
        id: true;
        title: true;
        periodLabel: true;
        team: { select: { id: true; name: true } };
      };
    };
    createdByUser: { select: { id: true; displayName: true; username: true } };
    guestLink: { select: { id: true; inviteLabel: true; guestDisplayName: true; guestEmail: true } };
    participant: { select: { id: true; displayName: true; email: true } };
  };
}>) {
  return {
    id: log.id,
    type: log.type,
    status: log.status,
    recipientEmail: log.recipientEmail,
    recipientName: log.recipientName,
    subject: log.subject,
    errorMessage: log.errorMessage,
    sentAt: log.sentAt,
    failedAt: log.failedAt,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    assessmentRun: log.assessmentRun
      ? {
          id: log.assessmentRun.id,
          title: log.assessmentRun.title,
          periodLabel: log.assessmentRun.periodLabel,
          team: log.assessmentRun.team
        }
      : null,
    guestLink: log.guestLink,
    participant: log.participant,
    createdByUser: log.createdByUser
  };
}

function serializeActionItem(item: {
  id: string;
  assessmentRunId: string;
  title: string;
  description: string | null;
  domainTitle: string | null;
  ownerName: string | null;
  dueDate: Date | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  createdByUser?: {
    id: string;
    displayName: string;
    username: string;
  } | null;
}) {
  return {
    id: item.id,
    assessmentRunId: item.assessmentRunId,
    title: item.title,
    description: item.description,
    domainTitle: item.domainTitle,
    ownerName: item.ownerName,
    dueDate: item.dueDate,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    createdByUser: item.createdByUser ?? null
  };
}

async function assertEmailDeliveryAvailable() {
  const settings = await getReportEmailDeliverySettings();
  if (!settings.enabled || !settings.available) {
    throw new Error("Email delivery is disabled or SMTP is not configured.");
  }
}

function buildApplicationUrl(path: string) {
  return new URL(path, config.clientUrl).toString();
}

async function sendTrackedEmail(input: {
  type: string;
  to: string;
  recipientName?: string | null;
  subject: string;
  body: string;
  actorUserId?: string | null;
  assessmentRunId?: string | null;
  guestLinkId?: string | null;
  participantId?: string | null;
}) {
  const log = await prisma.emailDeliveryLog.create({
    data: {
      type: input.type,
      status: EmailDeliveryStatus.PENDING,
      recipientEmail: input.to,
      recipientName: input.recipientName?.trim() || null,
      subject: input.subject,
      assessmentRunId: input.assessmentRunId ?? null,
      guestLinkId: input.guestLinkId ?? null,
      participantId: input.participantId ?? null,
      createdByUserId: input.actorUserId ?? null
    }
  });

  try {
    await assertEmailDeliveryAvailable();
    await sendReportEmail({
      to: input.to,
      subject: input.subject,
      body: input.body
    });

    return prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: {
        status: EmailDeliveryStatus.SENT,
        sentAt: new Date()
      }
    });
  } catch (error) {
    await prisma.emailDeliveryLog.update({
      where: { id: log.id },
      data: {
        status: EmailDeliveryStatus.FAILED,
        failedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

async function getActiveGuestAssessmentLink(token: string) {
  return prisma.guestAssessmentLink.findFirst({
    where: {
      token,
      isRevoked: false,
      assessmentRun: {
        guestParticipationEnabled: true,
        status: {
          in: [AssessmentRunStatus.DRAFT, AssessmentRunStatus.IN_PROGRESS]
        }
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    include: {
      assessmentRun: {
        include: {
          team: {
            include: {
              group: true
            }
          },
          target: true,
          ownerUser: true,
          assignmentHistory: {
            include: {
              assignedByUser: true,
              fromUser: true,
              toUser: true
            },
            orderBy: {
              createdAt: "desc"
            }
          },
          templateVersion: {
            include: {
              domains: {
                include: {
                  questions: {
                    include: {
                      levels: true
                    }
                  }
                }
              }
            }
          },
          responses: true
        }
      }
    }
  });
}

async function saveAssessmentRunResponses({
  runId,
  responses,
  actorUserId,
  summary,
  metadata
}: {
  runId: string;
  responses: Array<{
    questionId: string;
    selectedValue: number;
    selectedLabel: string;
    comment?: string | null;
  }>;
  actorUserId?: string | null;
  summary: string;
  metadata?: unknown;
}) {
  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId }
  });

  if (!run) {
    return null;
  }

  await prisma.$transaction(
    responses.map((item) =>
      prisma.assessmentResponse.upsert({
        where: {
          assessmentRunId_questionId: {
            assessmentRunId: runId,
            questionId: item.questionId
          }
        },
        update: {
          selectedValue: item.selectedValue,
          selectedLabel: item.selectedLabel,
          comment: item.comment ?? null
        },
        create: {
          assessmentRunId: runId,
          questionId: item.questionId,
          selectedValue: item.selectedValue,
          selectedLabel: item.selectedLabel,
          comment: item.comment ?? null
        }
      })
    )
  );

  await prisma.assessmentRun.update({
    where: { id: runId },
    data: {
      status:
        run.status === AssessmentRunStatus.DRAFT && responses.length > 0
          ? AssessmentRunStatus.IN_PROGRESS
          : run.status
    }
  });

  await logAudit({
    actorUserId,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: actorUserId ? "assessment_run.responses_saved" : "assessment_run.guest_responses_saved",
    summary,
    metadata
  });

  return run;
}

function serializeReportEmailDeliverySettings(
  settings: Awaited<ReturnType<typeof getReportEmailDeliverySettings>>,
  includeSmtpDetails = false
) {
  return {
    ...settings,
    ...(includeSmtpDetails ? { smtp: settings.smtp } : {})
  };
}

function buildReportEmailBody({
  runTitle,
  teamName,
  periodLabel,
  templateName,
  overallScore,
  senderName,
  shareUrl,
  note,
  expiresAt
}: {
  runTitle: string;
  teamName: string;
  periodLabel: string;
  templateName: string;
  overallScore: number | null;
  senderName: string;
  shareUrl: string;
  note?: string;
  expiresAt: Date | null;
}) {
  const lines = [
    `${senderName} shared a submitted assessment report with you.`,
    "",
    `Assessment: ${runTitle}`,
    `Team: ${teamName}`,
    `Period: ${periodLabel}`,
    `Template: ${templateName}`,
    `Overall score: ${typeof overallScore === "number" ? overallScore.toFixed(2) : "-"}`,
    expiresAt ? `Link expires: ${formatDateLabel(expiresAt)}` : "Link expires: Never",
    "",
    "Open report:",
    shareUrl
  ];

  const trimmedNote = note?.trim();
  if (trimmedNote) {
    lines.splice(1, 0, "Sender note:", trimmedNote, "");
  }

  return lines.join("\n");
}

async function recordAssignmentChange({
  assessmentRunId,
  assignedByUserId,
  fromUserId,
  toUserId,
  fromOwnerName,
  toOwnerName
}: {
  assessmentRunId: string;
  assignedByUserId: string;
  fromUserId?: string | null;
  toUserId?: string | null;
  fromOwnerName?: string | null;
  toOwnerName?: string | null;
}) {
  const normalizedFromName = fromOwnerName?.trim() || null;
  const normalizedToName = toOwnerName?.trim() || null;
  if (fromUserId === toUserId && normalizedFromName === normalizedToName) {
    return;
  }

  await prisma.assessmentRunAssignment.create({
    data: {
      assessmentRunId,
      assignedByUserId,
      fromUserId: fromUserId ?? null,
      toUserId: toUserId ?? null,
      fromOwnerName: normalizedFromName,
      toOwnerName: normalizedToName
    }
  });
}

async function createRunNotification({
  runId,
  userId,
  type,
  title,
  message
}: {
  runId: string;
  userId?: string | null;
  type: string;
  title: string;
  message: string;
}) {
  if (!userId) {
    return;
  }

  await createNotification({
    userId,
    assessmentRunId: runId,
    type,
    title,
    message,
    linkUrl: `/assessments/${runId}`
  });
}

async function logAudit(input: {
  actorUserId?: string | null;
  assessmentRunId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  metadata?: unknown;
}) {
  await recordAuditLog(input);
}

async function buildQuestionLibraryUsage() {
  const [drafts, versions, domains] = await Promise.all([
    prisma.templateDraft.findMany({
      select: {
        id: true,
        draftData: true
      }
    }),
    prisma.templateVersion.findMany({
      select: {
        id: true,
        domains: {
          select: {
            questions: {
              select: {
                prompt: true
              }
            }
          }
        }
      }
    }),
    prisma.domainLibraryItem.findMany({
      select: {
        id: true,
        questions: true
      }
    })
  ]);

  const usage = new Map<string, { draftCount: number; templateCount: number; domainCount: number }>();

  const increment = (id: string, key: "draftCount" | "templateCount" | "domainCount") => {
    const current = usage.get(id) ?? { draftCount: 0, templateCount: 0, domainCount: 0 };
    current[key] += 1;
    usage.set(id, current);
  };

  for (const draft of drafts) {
    const seen = new Set<string>();
    const domainsData = ((draft.draftData as { domains?: Array<{ questions?: Array<{ libraryId?: string }> }> })?.domains ?? []);
    for (const domain of domainsData) {
      for (const question of domain.questions ?? []) {
        if (question.libraryId && !seen.has(question.libraryId)) {
          seen.add(question.libraryId);
          increment(question.libraryId, "draftCount");
        }
      }
    }
  }

  const versionPromptSets = versions.map((version) => {
    const prompts = new Set<string>();
    for (const domain of version.domains) {
      for (const question of domain.questions) {
        prompts.add(question.prompt);
      }
    }
    return prompts;
  });

  const domainQuestionPromptSets = domains.map((domain) => {
    const prompts = new Set<string>();
    const questions = (domain.questions as Array<{ prompt?: string }>) ?? [];
    for (const question of questions) {
      if (question.prompt) {
        prompts.add(question.prompt);
      }
    }
    return { id: domain.id, prompts };
  });

  return {
    usage,
    versionPromptSets,
    domainQuestionPromptSets
  };
}

async function buildDomainLibraryUsage() {
  const [drafts, versions] = await Promise.all([
    prisma.templateDraft.findMany({
      select: {
        id: true,
        draftData: true
      }
    }),
    prisma.templateVersion.findMany({
      select: {
        id: true,
        domains: {
          select: {
            title: true
          }
        }
      }
    })
  ]);

  const usage = new Map<string, { draftCount: number; templateCount: number }>();

  const increment = (id: string, key: "draftCount" | "templateCount") => {
    const current = usage.get(id) ?? { draftCount: 0, templateCount: 0 };
    current[key] += 1;
    usage.set(id, current);
  };

  for (const draft of drafts) {
    const seen = new Set<string>();
    const domainsData = ((draft.draftData as { domains?: Array<{ libraryId?: string }> })?.domains ?? []);
    for (const domain of domainsData) {
      if (domain.libraryId && !seen.has(domain.libraryId)) {
        seen.add(domain.libraryId);
        increment(domain.libraryId, "draftCount");
      }
    }
  }

  const versionTitleSets = versions.map((version) => new Set(version.domains.map((domain) => domain.title)));

  return {
    usage,
    versionTitleSets
  };
}

async function getLatestSubmittedRunsByTeam() {
  const runs = await prisma.assessmentRun.findMany({
    where: {
      status: AssessmentRunStatus.SUBMITTED
    },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      ownerUser: true,
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: {
                include: {
                  levels: true
                }
              }
            }
          }
        }
      },
      responses: true
    },
    orderBy: [{ periodSortDate: "desc" }, { createdAt: "desc" }]
  });

  const perTeam = new Map<string, (typeof runs)[number]>();

  for (const run of runs) {
    if (!perTeam.has(run.teamId)) {
      perTeam.set(run.teamId, run);
    }
  }

  return Array.from(perTeam.values());
}

async function getLatestSubmittedRunsByTeamTemplate() {
  const runs = await prisma.assessmentRun.findMany({
    where: {
      status: AssessmentRunStatus.SUBMITTED
    },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      ownerUser: true,
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: {
                include: {
                  levels: true
                }
              }
            }
          }
        }
      },
      responses: true
    },
    orderBy: [{ periodSortDate: "desc" }, { createdAt: "desc" }]
  });

  const perTeamTemplate = new Map<string, (typeof runs)[number]>();

  for (const run of runs) {
    const key = `${run.teamId}:${run.templateId}`;
    if (!perTeamTemplate.has(key)) {
      perTeamTemplate.set(key, run);
    }
  }

  return Array.from(perTeamTemplate.values());
}

router.get("/health", async (_request, response) => {
  response.json({ ok: true });
});

router.get("/settings/application-branding", async (_request, response) => {
  response.json(await getApplicationBrandingSettings());
});

router.get("/settings/navigation-search", async (_request, response) => {
  response.json(await getNavigationSearchSettings());
});

router.get("/settings/ai-assistant", async (_request, response) => {
  const settings = await getAiAssistantSettings();
  const aiStatus = await getAiStatusForUser();

  response.json({
    enabled: settings.enabled,
    available: settings.enabled && aiStatus.enabled
  });
});

router.get("/settings/ai-status", async (_request, response) => {
  response.json(await getAiStatusForUser());
});

router.post("/auth/login", async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.user.findUnique({
    where: { username: input.username }
  });

  if (!user || !user.isActive || !verifyPassword(input.password, user.passwordHash)) {
    return response.status(401).json({ message: "Invalid username or password" });
  }

  const sessionToken = createSessionToken();
  const sessionExpiresAt = buildSessionExpiry();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      sessionToken,
      sessionExpiresAt,
      lastLoginAt: new Date()
    }
  });

  await logAudit({
    actorUserId: user.id,
    entityType: "user",
    entityId: user.id,
    action: "auth.login",
    summary: `${user.displayName} logged in`
  });

  response.json({
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    },
    mustChangePassword: user.mustChangePassword,
    sessionExpiresAt
  });
});

router.post("/auth/activate-account", async (request, response) => {
  const input = activateAccountSchema.parse(request.body);
  const user = await prisma.user.findFirst({
    where: {
      inviteToken: input.token,
      inviteExpiresAt: {
        gt: new Date()
      },
      isActive: true
    }
  });

  if (!user) {
    return response.status(400).json({ message: "Invitation link is invalid or expired" });
  }

  const sessionToken = createSessionToken();
  const sessionExpiresAt = buildSessionExpiry();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: false,
      inviteToken: null,
      inviteExpiresAt: null,
      sessionToken,
      sessionExpiresAt,
      lastLoginAt: new Date()
    }
  });

  await logAudit({
    actorUserId: user.id,
    entityType: "user",
    entityId: user.id,
    action: "auth.activate",
    summary: `${user.displayName} activated their account`
  });

  response.json({
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    },
    mustChangePassword: false,
    sessionExpiresAt
  });
});

router.get("/shared-results/:token", async (request, response) => {
  const shareLink = await prisma.reportShareLink.findFirst({
    where: {
      token: String(request.params.token),
      isRevoked: false,
      assessmentRun: {
        status: AssessmentRunStatus.SUBMITTED
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    include: {
      assessmentRun: {
        select: {
          id: true
        }
      }
    }
  });

  if (!shareLink) {
    return response.status(404).json({ message: "Shared report is invalid or expired" });
  }

  const payload = await buildAssessmentResultsPayload(shareLink.assessmentRun.id);
  if (!payload) {
    return response.status(404).json({ message: "Assessment results not found" });
  }

  response.json({
    ...payload,
    sharedView: {
      token: shareLink.token,
      expiresAt: shareLink.expiresAt,
      createdAt: shareLink.createdAt
    }
  });
});

router.get("/guest-assessments/:token", async (request, response) => {
  const link = await getActiveGuestAssessmentLink(String(request.params.token));

  if (!link) {
    return response.status(404).json({ message: "Guest assessment link is invalid or expired" });
  }

  await prisma.guestAssessmentLink.update({
    where: { id: link.id },
    data: {
      lastAccessedAt: new Date(),
      startedAt: link.startedAt ?? new Date()
    }
  });

  response.json({
    ...serializeAssessmentRun(link.assessmentRun),
    guestAccess: {
      token: link.token,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      inviteLabel: link.inviteLabel,
      guestDisplayName: link.guestDisplayName,
      guestEmail: link.guestEmail,
      submittedAt: link.submittedAt,
      resultsVisible: link.assessmentRun.guestResultsVisible
    }
  });
});

router.put("/guest-assessments/:token/responses", async (request, response) => {
  const input = guestAssessmentResponsesSchema.parse(request.body);
  const link = await getActiveGuestAssessmentLink(String(request.params.token));

  if (!link) {
    return response.status(404).json({ message: "Guest assessment link is invalid or expired" });
  }

  if (link.assessmentRun.status === AssessmentRunStatus.SUBMITTED || link.assessmentRun.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "This assessment is no longer accepting guest responses" });
  }

  const normalizedName = input.guestDisplayName.trim();
  const normalizedEmail = input.guestEmail?.trim() || null;

  await prisma.guestAssessmentLink.update({
    where: { id: link.id },
    data: {
      guestDisplayName: normalizedName,
      guestEmail: normalizedEmail,
      lastAccessedAt: new Date(),
      startedAt: link.startedAt ?? new Date()
    }
  });

  const run = await saveAssessmentRunResponses({
    runId: link.assessmentRunId,
    responses: input.responses,
    actorUserId: null,
    summary: `${normalizedName} saved guest responses for ${link.assessmentRun.title}`,
    metadata: {
      guestAssessmentLinkId: link.id,
      guestDisplayName: normalizedName,
      guestEmail: normalizedEmail,
      responseCount: input.responses.length
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  response.json({ ok: true });
});

router.post("/guest-assessments/:token/submit", async (request, response) => {
  const input = guestAssessmentSubmitSchema.parse(request.body ?? {});
  const link = await getActiveGuestAssessmentLink(String(request.params.token));

  if (!link) {
    return response.status(404).json({ message: "Guest assessment link is invalid or expired" });
  }

  const normalizedName = input.guestDisplayName.trim();
  const normalizedEmail = input.guestEmail?.trim() || null;
  const run = await prisma.assessmentRun.findUnique({
    where: { id: link.assessmentRunId },
    include: {
      responses: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED || run.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "This assessment can no longer be submitted from a guest link" });
  }

  const overallScore = run.responses.length
    ? Number((run.responses.reduce((sum, item) => sum + item.selectedValue, 0) / run.responses.length).toFixed(2))
    : null;

  const [updated] = await prisma.$transaction([
    prisma.assessmentRun.update({
      where: { id: run.id },
      data: {
        status: AssessmentRunStatus.SUBMITTED,
        submittedAt: new Date(),
        overallScore
      }
    }),
    prisma.guestAssessmentLink.update({
      where: { id: link.id },
      data: {
        guestDisplayName: normalizedName,
        guestEmail: normalizedEmail,
        submittedAt: new Date(),
        lastAccessedAt: new Date(),
        startedAt: link.startedAt ?? new Date()
      }
    })
  ]);

  await logAudit({
    actorUserId: null,
    assessmentRunId: run.id,
    entityType: "assessment_run",
    entityId: run.id,
    action: "assessment_run.guest_submitted",
    summary: `${normalizedName} submitted guest assessment ${updated.title}`,
    metadata: {
      guestAssessmentLinkId: link.id,
      guestDisplayName: normalizedName,
      guestEmail: normalizedEmail
    }
  });

  response.json({ ok: true });
});

router.get("/guest-assessments/:token/results", async (request, response) => {
  const link = await prisma.guestAssessmentLink.findFirst({
    where: {
      token: String(request.params.token),
      isRevoked: false,
      submittedAt: {
        not: null
      },
      assessmentRun: {
        is: {
          guestParticipationEnabled: true,
          status: AssessmentRunStatus.SUBMITTED,
          guestResultsVisible: true
        }
      },
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
    },
    include: {
      assessmentRun: {
        select: {
          id: true
        }
      }
    }
  });

  if (!link) {
    return response.status(404).json({ message: "Guest results are unavailable for this link" });
  }

  const payload = await buildAssessmentResultsPayload(link.assessmentRun.id);
  if (!payload) {
    return response.status(404).json({ message: "Assessment results not found" });
  }

  response.json({
    ...payload,
    guestAccess: {
      token: link.token,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      inviteLabel: link.inviteLabel,
      guestDisplayName: link.guestDisplayName,
      guestEmail: link.guestEmail,
      submittedAt: link.submittedAt,
      resultsVisible: true
    }
  });
});

router.get("/external-participant-assessments/:token", async (request, response) => {
  const participant = await getActiveExternalParticipant(String(request.params.token));

  if (!participant) {
    return response.status(404).json({ message: "External participant assessment link is invalid or expired" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: participant.assessmentRunId },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      ownerUser: true,
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: {
                include: {
                  levels: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (participant.status === AssessmentParticipantStatus.INVITED) {
    await prisma.assessmentRunParticipant.update({
      where: { id: participant.id },
      data: {
        status: AssessmentParticipantStatus.NOT_STARTED,
        startedAt: participant.startedAt ?? new Date()
      }
    });
    participant.status = AssessmentParticipantStatus.NOT_STARTED;
    participant.startedAt = participant.startedAt ?? new Date();
  }

  response.json(serializeParticipantAssessmentRun(run, participant));
});

router.put("/external-participant-assessments/:token/responses", async (request, response) => {
  const input = responseSchema.parse(request.body);
  const participant = await getActiveExternalParticipant(String(request.params.token));

  if (!participant) {
    return response.status(404).json({ message: "External participant assessment link is invalid or expired" });
  }

  if (participant.status === AssessmentParticipantStatus.SUBMITTED) {
    return response.status(400).json({ message: "This individual response has already been submitted." });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: participant.assessmentRunId },
    select: {
      id: true,
      title: true,
      status: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED || run.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "This assessment is no longer accepting participant responses." });
  }

  await prisma.$transaction(async (transaction) => {
    await Promise.all(
      input.responses.map((item) =>
        transaction.participantAssessmentResponse.upsert({
          where: {
            participantId_questionId: {
              participantId: participant.id,
              questionId: item.questionId
            }
          },
          update: {
            selectedValue: item.selectedValue,
            selectedLabel: item.selectedLabel,
            comment: item.comment ?? null
          },
          create: {
            participantId: participant.id,
            questionId: item.questionId,
            selectedValue: item.selectedValue,
            selectedLabel: item.selectedLabel,
            comment: item.comment ?? null
          }
        })
      )
    );

    await transaction.assessmentRunParticipant.update({
      where: { id: participant.id },
      data: {
        status: AssessmentParticipantStatus.IN_PROGRESS,
        startedAt: participant.startedAt ?? new Date()
      }
    });

    if (run.status === AssessmentRunStatus.DRAFT && input.responses.length > 0) {
      await transaction.assessmentRun.update({
        where: { id: run.id },
        data: {
          status: AssessmentRunStatus.IN_PROGRESS
        }
      });
    }
  });

  response.json({ ok: true });
});

router.post("/external-participant-assessments/:token/submit", async (request, response) => {
  const participant = await getActiveExternalParticipant(String(request.params.token));

  if (!participant) {
    return response.status(404).json({ message: "External participant assessment link is invalid or expired" });
  }

  if (participant.status === AssessmentParticipantStatus.SUBMITTED) {
    return response.status(400).json({ message: "This individual response has already been submitted." });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: participant.assessmentRunId },
    include: {
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: true
            }
          }
        }
      }
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED || run.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "This assessment is no longer accepting participant responses." });
  }

  const requiredQuestionIds = run.templateVersion.domains.flatMap((domain) => domain.questions.map((question) => question.id));
  const answeredQuestionIds = new Set(participant.responses.map((item) => item.questionId));
  const missingCount = requiredQuestionIds.filter((questionId) => !answeredQuestionIds.has(questionId)).length;

  if (missingCount > 0) {
    return response.status(400).json({ message: `Answer all required questions before submitting. ${missingCount} unanswered.` });
  }

  const updated = await prisma.assessmentRunParticipant.update({
    where: { id: participant.id },
    data: {
      status: AssessmentParticipantStatus.SUBMITTED,
      submittedAt: new Date(),
      startedAt: participant.startedAt ?? new Date()
    }
  });

  await logAudit({
    actorUserId: null,
    assessmentRunId: run.id,
    entityType: "assessment_run_participant",
    entityId: participant.id,
    action: "assessment_run_participant.external_submitted",
    summary: `${participant.displayName} submitted an external individual response for ${run.title}`,
    metadata: {
      externalContactId: participant.externalContactId
    }
  });

  response.json(serializeAssessmentRunParticipant({ ...updated, user: null, externalContact: null, _count: { responses: participant.responses.length } }));
});

router.use(requireAdminAuth);

router.get("/admin/export-options", requireRole(UserRole.ADMIN), async (_request, response) => {
  const capability = await getPgDumpCapability();

  response.json({
    json: {
      modes: [
        {
          value: "portable" satisfies JsonExportMode,
          label: "Portable JSON",
          description: "Redacts password hashes, active session tokens, invite tokens, and report share tokens."
        },
        {
          value: "full" satisfies JsonExportMode,
          label: "Full JSON",
          description: "Includes sensitive authentication and access data. Handle as a privileged backup."
        }
      ]
    },
    postgres: {
      available: capability.available,
      executable: capability.executable,
      version: capability.version,
      checkedAt: capability.checkedAt,
      error: capability.error,
      formats: [
        {
          value: "custom" satisfies PostgresDumpFormat,
          label: "Custom dump (.dump)",
          description: "Best for pg_restore and full-fidelity PostgreSQL backup workflows."
        },
        {
          value: "plain" satisfies PostgresDumpFormat,
          label: "Plain SQL (.sql)",
          description: "Portable SQL script export for PostgreSQL-compatible restore workflows."
        }
      ]
    }
  });
});

router.post("/admin/exports/json", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = jsonExportSchema.parse(request.body ?? {});
  const exported = await buildJsonExport({
    mode: input.mode,
    actorUserId: request.adminUser!.id
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "system_export",
    entityId: `json:${input.mode}`,
    action: "admin.export_json",
    summary: `${request.adminUser!.displayName} exported ${input.mode} JSON backup data`,
    metadata: {
      mode: input.mode,
      filename: exported.filename
    }
  });

  response.setHeader("Content-Type", exported.mimeType);
  response.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
  response.setHeader("Cache-Control", "no-store");
  response.send(exported.content);
});

router.post("/admin/exports/postgres-dump", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = postgresDumpSchema.parse(request.body ?? {});
  const dump = await createPostgresDump({
    format: input.format
  });

  const cleanup = async () => {
    await dump.cleanup();
  };

  response.on("finish", cleanup);
  response.on("close", cleanup);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "system_export",
    entityId: `postgres:${input.format}`,
    action: "admin.export_postgres_dump",
    summary: `${request.adminUser!.displayName} exported PostgreSQL dump data`,
    metadata: {
      format: input.format,
      filename: dump.filename
    }
  });

  streamTempFile({
    tempPath: dump.tempPath,
    filename: dump.filename,
    mimeType: dump.mimeType,
    response
  });
});

router.get("/auth/me", async (request, response) => {
  response.json({
    user: request.adminUser
  });
});

router.get("/settings/report-email-delivery", async (request, response) => {
  const settings = await getReportEmailDeliverySettings();
  response.json(serializeReportEmailDeliverySettings(settings, request.adminUser?.role === UserRole.ADMIN));
});

router.get("/settings/ai-configuration", requireRole(UserRole.ADMIN), async (_request, response) => {
  response.json(await getAiSettingsSummary());
});

router.put("/settings/report-email-delivery", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = reportEmailDeliverySchema.parse(request.body ?? {});
  const settings = await updateReportEmailDeliverySettings(input.enabled);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "platform_setting",
    entityId: "report_email_delivery",
    action: "platform_setting.report_email_delivery_updated",
    summary: `${request.adminUser!.displayName} ${input.enabled ? "enabled" : "disabled"} submitted report email delivery`,
    metadata: {
      enabled: input.enabled
    }
  });

  response.json(serializeReportEmailDeliverySettings(settings, true));
});

router.put("/settings/smtp-configuration", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = smtpConfigurationSchema.parse(request.body ?? {});
  const settings = await updateSmtpConfiguration({
    host: input.host,
    port: input.port,
    from: input.from
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "platform_setting",
    entityId: "smtp_configuration",
    action: "platform_setting.smtp_configuration_updated",
    summary: `${request.adminUser!.displayName} updated SMTP host/port configuration`,
    metadata: {
      host: input.host,
      port: input.port,
      from: input.from
    }
  });

  response.json(serializeReportEmailDeliverySettings(settings, true));
});

router.put("/settings/application-branding", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = applicationBrandingSchema.parse(request.body ?? {});
  const settings = await updateApplicationBrandingSettings(input.applicationTitle);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "platform_setting",
    entityId: "application_branding",
    action: "platform_setting.application_branding_updated",
    summary: `${request.adminUser!.displayName} updated the application title`,
    metadata: {
      applicationTitle: settings.applicationTitle
    }
  });

  response.json(settings);
});

router.put("/settings/navigation-search", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = navigationSearchSchema.parse(request.body ?? {});
  const settings = await updateNavigationSearchSettings(input.enabled);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "platform_setting",
    entityId: "navigation_search",
    action: "platform_setting.navigation_search_updated",
    summary: `${request.adminUser!.displayName} ${settings.enabled ? "enabled" : "disabled"} spotlight search`,
    metadata: {
      enabled: settings.enabled
    }
  });

  response.json(settings);
});

router.put("/settings/ai-assistant", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = aiAssistantSettingsSchema.parse(request.body ?? {});
  const settings = await updateAiAssistantSettings(input.enabled);
  const aiStatus = await getAiStatusForUser();

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "platform_setting",
    entityId: "ai_assistant",
    action: "platform_setting.ai_assistant_updated",
    summary: `${request.adminUser!.displayName} ${settings.enabled ? "enabled" : "disabled"} the AI assistant`,
    metadata: {
      enabled: settings.enabled
    }
  });

  response.json({
    enabled: settings.enabled,
    available: settings.enabled && aiStatus.enabled
  });
});

router.put("/settings/ai-configuration", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = aiSettingsSchema.parse(request.body ?? {});
  const settings = await updateAiSettings(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "platform_setting",
    entityId: "ai_configuration",
    action: "platform_setting.ai_configuration_updated",
    summary: `${request.adminUser!.displayName} updated AI configuration`,
    metadata: {
      enabled: settings.enabled,
      activeProvider: settings.activeProvider,
      showProviderToUsers: settings.showProviderToUsers,
      providerStates: Object.fromEntries(
        (Object.keys(settings.providers) as AiProvider[]).map((provider) => [provider, settings.providers[provider].enabled])
      )
    }
  });

  response.json(settings);
});

router.post("/settings/ai-configuration/test", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = aiProviderTestSchema.parse(request.body ?? {});
  response.json(await testAiProviderConnection(input));
});

router.post("/assistant/respond", async (request, response) => {
  if (!request.adminUser) {
    return response.status(401).json({ message: "Authentication required" });
  }

  const settings = await getAiAssistantSettings();
  if (!settings.enabled) {
    return response.status(403).json({ message: "AI assistant is disabled by the administrator" });
  }

  const input = aiAssistantRequestSchema.parse(request.body ?? {});
  const user = request.adminUser;
  const [runVisibility, actionOptions] = await Promise.all([
    buildAccessibleRunWhere(user),
    getAssistantActionOptions(user)
  ]);

  const [activeRuns, recentSubmissions, templates, assistantTeams, assistantGroups, userCount, teamCount] = await Promise.all([
    prisma.assessmentRun.findMany({
      where: {
        AND: [runVisibility, { status: { in: [AssessmentRunStatus.DRAFT, AssessmentRunStatus.IN_PROGRESS] } }]
      },
      select: {
        id: true,
        title: true,
        periodLabel: true,
        dueDate: true,
        status: true,
        team: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      take: 8
    }),
    prisma.assessmentRun.findMany({
      where: {
        AND: [runVisibility, { status: AssessmentRunStatus.SUBMITTED }]
      },
      select: {
        id: true,
        title: true,
        periodLabel: true,
        overallScore: true,
        submittedAt: true,
        team: {
          select: {
            name: true
          }
        },
        templateVersion: {
          select: {
            name: true
          }
        }
      },
      orderBy: [{ submittedAt: "desc" }, { periodSortDate: "desc" }, { createdAt: "desc" }],
      take: 8
    }),
    templateManagerRoles.has(user.role)
      ? prisma.assessmentTemplate.findMany({
          include: {
            versions: {
              orderBy: { versionNumber: "desc" },
              take: 1
            }
          },
          orderBy: {
            updatedAt: "desc"
          },
          take: 8
        })
      : Promise.resolve([]),
    prisma.team.findMany({
      where:
        user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
          ? undefined
          : {
              memberships: {
                some: {
                  userId: user.id
                }
              }
            },
      include: {
        group: true,
        _count: {
          select: {
            memberships: true,
            assessmentRuns: true
          }
        }
      },
      orderBy: { name: "asc" },
      take: 8
    }),
    prisma.teamGroup.findMany({
      include: {
        _count: {
          select: {
            teams: true
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      take: 8
    }),
    user.role === UserRole.ADMIN ? prisma.user.count() : Promise.resolve(null),
    user.role === UserRole.ADMIN ? prisma.team.count() : Promise.resolve(null)
  ]);

  const latestSubmittedByTeam = new Map<string, (typeof recentSubmissions)[number]>();
  for (const run of recentSubmissions) {
    if (!latestSubmittedByTeam.has(run.team.name)) {
      latestSubmittedByTeam.set(run.team.name, run);
    }
  }

  const scoredRecentSubmissions = recentSubmissions.filter(
    (run): run is (typeof recentSubmissions)[number] & { overallScore: number } => typeof run.overallScore === "number"
  );
  const overdueActiveRuns = activeRuns.filter((run) => getDuePriority(run.dueDate).label === "overdue");
  const dueSoonActiveRuns = activeRuns.filter((run) => getDuePriority(run.dueDate).label === "due_soon");
  const averageSubmittedScore = scoredRecentSubmissions.length
    ? Number(
        (
          scoredRecentSubmissions.reduce((sum, run) => sum + run.overallScore, 0) /
          scoredRecentSubmissions.length
        ).toFixed(2)
      )
    : null;

  const itemOptions = [
    ...activeRuns.map((run) => ({
      id: `active:${run.id}`,
      title: run.title,
      subtitle: `${run.team.name} · ${run.periodLabel}`,
      badge: getDueBadgeLabel(run.dueDate) || (run.status === AssessmentRunStatus.DRAFT ? "Draft" : "In progress"),
      to: `/assessments/${run.id}`
    })),
    ...recentSubmissions.map((run) => ({
      id: `submitted:${run.id}`,
      title: run.title,
      subtitle: `${run.team.name} · ${run.templateVersion.name} · ${run.periodLabel}`,
      badge: typeof run.overallScore === "number" ? `Score ${run.overallScore.toFixed(2)}` : "Submitted",
      to: `/assessments/${run.id}/results`
    })),
    ...templates.map((template) => ({
      id: `template:${template.id}`,
      title: template.name,
      subtitle: template.category?.trim() ? template.category : "Template",
      badge: template.versions[0] ? `v${template.versions[0].versionNumber}` : "Template",
      to: "/templates"
    })),
    ...assistantTeams.map((team) => ({
      id: `team:${team.id}`,
      title: team.name,
      subtitle: team.group?.name ? `${team.group.name} · ${team._count.memberships} members` : `${team._count.memberships} members · Ungrouped`,
      badge: `${team._count.assessmentRuns} runs`,
      to: `/teams/${team.id}`
    })),
    ...assistantGroups.map((group) => ({
      id: `group:${group.id}`,
      title: group.name,
      subtitle: group.description?.trim() ? group.description : "Team group",
      badge: `${group._count.teams} teams`,
      to: `/team-groups/${group.id}`
    }))
  ];

  const assistantContext = {
    currentPath: input.currentPath?.trim() || "/",
    user: {
      displayName: user.displayName,
      role: user.role
    },
    summary: {
      activeAssessments: activeRuns.length,
      overdueAssessments: overdueActiveRuns.length,
      dueSoonAssessments: dueSoonActiveRuns.length,
      recentSubmissions: recentSubmissions.length,
      templates: templates.length,
      reportsTeamCoverage: latestSubmittedByTeam.size,
      averageSubmittedScore,
      usersManaged: userCount,
      teamsManaged: teamCount
    },
    actions: actionOptions.map(({ id, label, description }) => ({
      id,
      label,
      description
    })),
    items: itemOptions.map(({ id, title, subtitle, badge }) => ({
      id,
      title,
      subtitle,
      badge
    })),
    conversationHistory: input.history ?? []
  };

  const deterministicReply = buildDeterministicAssistantResponse({
    message: input.message,
    context: assistantContext
  });

  const assistantReply =
    deterministicReply ??
    (await generateAiAssistantResponse({
      message: input.message,
      context: assistantContext
    }));

  const actionMap = new Map(actionOptions.map((action) => [action.id, action]));
  const itemMap = new Map(itemOptions.map((item) => [item.id, item]));

  response.json({
    message: assistantReply.message,
    followUp: assistantReply.followUp,
    providerLabel: "providerLabel" in assistantReply ? assistantReply.providerLabel : null,
    actions: (assistantReply.actionIds ?? [])
      .map((id) => actionMap.get(id))
      .filter((action): action is NonNullable<typeof action> => Boolean(action))
      .map((action) => ({
        id: action.id,
        label: action.label,
        to: action.to
      })),
    items: (assistantReply.itemIds ?? [])
      .map((id) => itemMap.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .map((item) => ({
        id: item.id,
        title: item.title,
        subtitle: item.subtitle,
        badge: item.badge,
        to: item.to
      }))
  });

  await logAudit({
    actorUserId: user.id,
    entityType: "assistant",
    entityId: "ai_assistant",
    action: deterministicReply ? "assistant.query_deterministic_answered" : "assistant.query_ai_answered",
    summary: `${user.displayName} asked the AI assistant a platform question`,
    metadata: {
      currentPath: assistantContext.currentPath,
      message: input.message,
      usedDeterministicRouting: Boolean(deterministicReply),
      matchedActionIds: assistantReply.actionIds ?? [],
      matchedItemIds: assistantReply.itemIds ?? []
    }
  });
});

router.post("/auth/logout", async (request, response) => {
  if (!request.adminUser) {
    return response.status(401).json({ message: "Authentication required" });
  }

  await prisma.user.update({
    where: { id: request.adminUser.id },
    data: {
      sessionToken: null,
      sessionExpiresAt: null
    }
  });

  await logAudit({
    actorUserId: request.adminUser.id,
    entityType: "user",
    entityId: request.adminUser.id,
    action: "auth.logout",
    summary: `${request.adminUser.displayName} logged out`
  });

  response.json({ ok: true });
});

router.post("/auth/change-password", async (request, response) => {
  const input = changePasswordSchema.parse(request.body);

  if (!request.adminUser) {
    return response.status(401).json({ message: "Authentication required" });
  }

  const user = await prisma.user.findUnique({
    where: { id: request.adminUser.id }
  });

  if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
    return response.status(400).json({ message: "Current password is incorrect" });
  }

  const updatedPasswordHash = hashPassword(input.newPassword);
  const sessionToken = createSessionToken();
  const sessionExpiresAt = buildSessionExpiry();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: updatedPasswordHash,
      mustChangePassword: false,
      sessionToken,
      sessionExpiresAt
    }
  });

  await logAudit({
    actorUserId: user.id,
    entityType: "user",
    entityId: user.id,
    action: "user.password_changed",
    summary: `${user.displayName} changed their password`
  });

  response.json({
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    },
    mustChangePassword: false,
    sessionExpiresAt
  });
});

router.get("/notifications", async (request, response) => {
  const user = request.adminUser!;
  const persisted = await prisma.notification.findMany({
    where: {
      userId: user.id
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });

  const dueRuns = await prisma.assessmentRun.findMany({
    where: {
      ownerUserId: user.id,
      status: {
        in: [AssessmentRunStatus.DRAFT, AssessmentRunStatus.IN_PROGRESS]
      },
      dueDate: {
        not: null
      }
    },
    include: {
      team: true
    },
    orderBy: {
      dueDate: "asc"
    },
    take: 10
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const computed = dueRuns.flatMap((run) => {
    if (!run.dueDate) {
      return [];
    }

    const diffDays = Math.ceil((run.dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) {
      return [
        {
          id: `due-overdue-${run.id}`,
          type: "DUE_OVERDUE",
          title: "Assessment overdue",
          message: `${run.title} for ${run.team.name} is overdue.`,
          linkUrl: `/assessments/${run.id}`,
          isRead: false,
          createdAt: run.dueDate,
          readAt: null
        }
      ];
    }

    if (diffDays <= 3) {
      return [
        {
          id: `due-soon-${run.id}`,
          type: "DUE_SOON",
          title: "Assessment due soon",
          message: `${run.title} for ${run.team.name} is due in ${diffDays} day${diffDays === 1 ? "" : "s"}.`,
          linkUrl: `/assessments/${run.id}`,
          isRead: false,
          createdAt: run.dueDate,
          readAt: null
        }
      ];
    }

    return [];
  });

  response.json({
    unreadCount: persisted.filter((item) => !item.isRead).length + computed.length,
    items: [...computed, ...persisted]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        message: item.message,
        linkUrl: item.linkUrl,
        isRead: item.isRead,
        createdAt: item.createdAt,
        readAt: item.readAt ?? null
      }))
  });
});

router.post("/notifications/:id/read", async (request, response) => {
  const notificationId = String(request.params.id);
  if (notificationId.startsWith("due-")) {
    return response.json({ ok: true });
  }

  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId: request.adminUser!.id
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  response.json({ ok: true });
});

router.post("/notifications/read-all", async (request, response) => {
  await prisma.notification.updateMany({
    where: {
      userId: request.adminUser!.id,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });

  response.json({ ok: true });
});

router.get("/audit-logs", requireRole(UserRole.ADMIN), async (_request, response) => {
  const logs = await prisma.auditLog.findMany({
    include: {
      actorUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 200
  });

  response.json(
    logs.map((log) => ({
      id: log.id,
      entityType: log.entityType,
      entityId: log.entityId,
      action: log.action,
      summary: log.summary,
      metadata: log.metadata,
      createdAt: log.createdAt,
      actorUser: log.actorUser
    }))
  );
});

router.get("/users", requireRole(UserRole.ADMIN), async (_request, response) => {
  const users = await prisma.user.findMany({
    include: {
      teamMemberships: {
        include: {
          team: true
        }
      }
    },
    orderBy: [{ role: "asc" }, { displayName: "asc" }]
  });

  response.json(users.map(serializeUser));
});

router.get("/users/assignable", async (request, response) => {
  const user = request.adminUser!;
  const teamIds =
    user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER ? [] : await getUserTeamIds(user.id);
  const users = await prisma.user.findMany({
    where:
      user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
        ? { isActive: true }
        : {
            isActive: true,
            OR: [
              { id: user.id },
              {
                teamMemberships: {
                  some: {
                    teamId: {
                      in: teamIds
                    }
                  }
                }
              }
            ]
          },
    include: {
      teamMemberships: {
        include: {
          team: true
        }
      }
    },
    orderBy: [{ displayName: "asc" }]
  });

  response.json(users.map(serializeUser));
});

router.post("/users", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = createUserSchema.parse(request.body);
  const initialPassword = input.password?.trim() ? input.password.trim() : createSessionToken().slice(0, 16);
  const created = await prisma.user.create({
    data: {
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      email: input.email?.trim() || null,
      role: input.role,
      isActive: input.isActive ?? true,
      mustChangePassword: input.mustChangePassword ?? true,
      passwordHash: hashPassword(initialPassword),
      teamMemberships: {
        create: input.memberships.map((membership) => ({
          teamId: membership.teamId,
          membershipRole: membership.membershipRole
        }))
      }
    },
    include: {
      teamMemberships: {
        include: {
          team: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "user",
    entityId: created.id,
    action: "user.created",
    summary: `${request.adminUser!.displayName} created user ${created.displayName}`,
    metadata: {
      role: created.role
    }
  });

  response.status(201).json(serializeUser(created));
});

router.post("/users/:id/invite", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = inviteUserSchema.parse(request.body);
  const userId = String(request.params.id);
  const inviteToken = createInviteToken();
  const inviteExpiresAt = new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      inviteToken,
      inviteExpiresAt,
      mustChangePassword: true
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "user",
    entityId: updated.id,
    action: "user.invite_generated",
    summary: `${request.adminUser!.displayName} generated an activation link for ${updated.displayName}`
  });

  response.json({
    userId: updated.id,
    inviteToken,
    inviteExpiresAt
  });
});

router.put("/users/:id", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = updateUserSchema.parse(request.body);
  const userId = String(request.params.id);
  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.userTeamMembership.deleteMany({
      where: { userId }
    });

    return transaction.user.update({
      where: { id: userId },
      data: {
        displayName: input.displayName.trim(),
        username: input.username.trim(),
        email: input.email?.trim() || null,
        role: input.role,
        isActive: input.isActive,
        mustChangePassword: input.mustChangePassword ?? false,
        sessionToken: input.isActive ? undefined : null,
        sessionExpiresAt: input.isActive ? undefined : null,
        teamMemberships: {
          create: input.memberships.map((membership) => ({
            teamId: membership.teamId,
            membershipRole: membership.membershipRole
          }))
        }
      },
      include: {
        teamMemberships: {
          include: {
            team: true
          }
        }
      }
    });
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "user",
    entityId: updated.id,
    action: "user.updated",
    summary: `${request.adminUser!.displayName} updated user ${updated.displayName}`,
    metadata: {
      role: updated.role,
      isActive: updated.isActive
    }
  });

  response.json(serializeUser(updated));
});

router.post("/users/:id/reset-password", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = resetUserPasswordSchema.parse(request.body);
  const userId = String(request.params.id);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: true,
      sessionToken: null,
      sessionExpiresAt: null
    },
    select: {
      id: true,
      displayName: true,
      username: true
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "user",
    entityId: updated.id,
    action: "user.password_reset",
    summary: `${request.adminUser!.displayName} reset the password for ${updated.displayName}`
  });

  response.json({
    message: "Password reset",
    user: updated
  });
});

router.get("/teams", async (request, response) => {
  const user = request.adminUser!;
  const teams = await prisma.team.findMany({
    where:
      user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
        ? undefined
        : {
            memberships: {
              some: {
                userId: user.id
              }
            }
          },
    include: {
      group: true,
      _count: {
        select: {
          memberships: true,
          assessmentRuns: true
        }
      }
    },
    orderBy: { name: "asc" }
  });
  response.json(teams.map(serializeTeam));
});

router.get("/team-groups", async (_request, response) => {
  const groups = await prisma.teamGroup.findMany({
    include: {
      teams: {
        include: {
          _count: {
            select: {
              memberships: true,
              assessmentRuns: true
            }
          },
          assessmentRuns: {
            select: {
              status: true,
              overallScore: true,
              submittedAt: true
            }
          }
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  response.json(
    groups.map((group) => {
      const runs = group.teams.flatMap((team) => team.assessmentRuns);
      const submittedRuns = runs.filter((run) => run.status === AssessmentRunStatus.SUBMITTED);
      const submittedScores = submittedRuns.map((run) => run.overallScore).filter((score): score is number => typeof score === "number");
      const latestSubmittedAt = submittedRuns
        .map((run) => run.submittedAt)
        .filter((value): value is Date => value instanceof Date)
        .sort((left, right) => right.getTime() - left.getTime())[0] ?? null;

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        sortOrder: group.sortOrder,
        teamCount: group.teams.length,
        metrics: {
          teamCount: group.teams.length,
          memberCount: group.teams.reduce((sum, team) => sum + team._count.memberships, 0),
          totalRunCount: group.teams.reduce((sum, team) => sum + team._count.assessmentRuns, 0),
          activeRunCount: runs.filter(
            (run) => run.status === AssessmentRunStatus.DRAFT || run.status === AssessmentRunStatus.IN_PROGRESS || run.status === AssessmentRunStatus.ARCHIVED
          ).length,
          submittedRunCount: submittedRuns.length,
          averageSubmittedScore: submittedScores.length
            ? Number((submittedScores.reduce((sum, score) => sum + score, 0) / submittedScores.length).toFixed(2))
            : null,
          latestSubmittedAt
        }
      };
    })
  );
});

router.post("/team-groups", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = teamGroupSchema.parse(request.body);
  const created = await prisma.teamGroup.create({
    data: {
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder ?? 0
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "team_group",
    entityId: created.id,
    action: "team_group.created",
    summary: `${request.adminUser!.displayName} created team group ${created.name}`,
    metadata: {
      name: created.name,
      sortOrder: created.sortOrder
    }
  });

  response.status(201).json({
    ...created,
    teamCount: 0,
    metrics: {
      teamCount: 0,
      memberCount: 0,
      totalRunCount: 0,
      activeRunCount: 0,
      submittedRunCount: 0,
      averageSubmittedScore: null,
      latestSubmittedAt: null
    }
  });
});

router.put("/team-groups/:id", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = teamGroupSchema.parse(request.body);
  const previous = await prisma.teamGroup.findUnique({
    where: { id: String(request.params.id) }
  });

  const updated = await prisma.teamGroup.update({
    where: { id: String(request.params.id) },
    data: {
      name: input.name,
      description: input.description,
      sortOrder: input.sortOrder ?? 0
    },
    include: {
      _count: {
        select: {
          teams: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "team_group",
    entityId: updated.id,
    action: "team_group.updated",
    summary: `${request.adminUser!.displayName} updated team group ${updated.name}`,
    metadata: {
      before: previous
        ? {
            name: previous.name,
            description: previous.description,
            sortOrder: previous.sortOrder
          }
        : null,
      after: {
        name: updated.name,
        description: updated.description,
        sortOrder: updated.sortOrder
      }
    }
  });

  response.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    sortOrder: updated.sortOrder,
    teamCount: updated._count.teams
  });
});

router.get("/team-groups/:id", async (request, response) => {
  const group = await prisma.teamGroup.findUnique({
    where: { id: String(request.params.id) },
    include: {
      teams: {
        include: {
          _count: {
            select: {
              memberships: true,
              assessmentRuns: true
            }
          },
          assessmentRuns: {
            include: {
              templateVersion: true
            },
            orderBy: [{ periodSortDate: "desc" }, { updatedAt: "desc" }]
          }
        },
        orderBy: { name: "asc" }
      }
    }
  });

  if (!group) {
    return response.status(404).json({ message: "Team group not found" });
  }

  response.json({
    id: group.id,
    name: group.name,
    description: group.description,
    sortOrder: group.sortOrder,
    teams: group.teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      counts: {
        members: team._count.memberships,
        assessmentRuns: team._count.assessmentRuns
      },
      activeRuns: team.assessmentRuns
        .filter((run) => run.status === AssessmentRunStatus.DRAFT || run.status === AssessmentRunStatus.IN_PROGRESS || run.status === AssessmentRunStatus.ARCHIVED)
        .map((run) => ({
          id: run.id,
          title: run.title,
          periodLabel: run.periodLabel,
          status: run.status,
          dueDate: run.dueDate,
          updatedAt: run.updatedAt,
          guestParticipationEnabled: run.guestParticipationEnabled,
          templateVersion: {
            id: run.templateVersion.id,
            name: run.templateVersion.name,
            versionNumber: run.templateVersion.versionNumber
          }
        })),
      submittedRuns: team.assessmentRuns
        .filter((run) => run.status === AssessmentRunStatus.SUBMITTED)
        .map((run) => ({
          id: run.id,
          title: run.title,
          periodLabel: run.periodLabel,
          submittedAt: run.submittedAt,
          overallScore: run.overallScore,
          guestParticipationEnabled: run.guestParticipationEnabled,
          templateVersion: {
            id: run.templateVersion.id,
            name: run.templateVersion.name,
            versionNumber: run.templateVersion.versionNumber
          }
        }))
    }))
  });
});

router.delete("/team-groups/:id", requireRole(UserRole.ADMIN), async (request, response) => {
  const group = await prisma.teamGroup.findUnique({
    where: { id: String(request.params.id) },
    include: {
      _count: {
        select: {
          teams: true
        }
      }
    }
  });

  await prisma.teamGroup.delete({
    where: { id: String(request.params.id) }
  });

  if (group) {
    await logAudit({
      actorUserId: request.adminUser!.id,
      entityType: "team_group",
      entityId: group.id,
      action: "team_group.deleted",
      summary: `${request.adminUser!.displayName} removed team group ${group.name}`,
      metadata: {
        name: group.name,
        affectedTeams: group._count.teams
      }
    });
  }

  response.status(204).send();
});

router.get("/teams/:id", async (request, response) => {
  const user = request.adminUser!;
  const teamId = String(request.params.id);

  if (!(await canAccessTeam(user, teamId))) {
    return response.status(403).json({ message: "You do not have access to this team" });
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      group: true,
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              displayName: true,
              username: true,
              role: true,
              isActive: true
            }
          }
        },
        orderBy: [{ membershipRole: "asc" }, { user: { displayName: "asc" } }]
      },
      assessmentRuns: {
        include: {
          templateVersion: true
        },
        orderBy: [{ periodSortDate: "desc" }, { updatedAt: "desc" }]
      },
      _count: {
        select: {
          memberships: true,
          assessmentRuns: true
        }
      }
    }
  });

  if (!team) {
    return response.status(404).json({ message: "Team not found" });
  }

  response.json({
    ...serializeTeam(team),
    members: team.memberships.map((membership) => ({
      id: membership.user.id,
      displayName: membership.user.displayName,
      username: membership.user.username,
      role: membership.user.role,
      isActive: membership.user.isActive,
      membershipRole: membership.membershipRole
    })),
    activeRuns: team.assessmentRuns
      .filter((run) => run.status === AssessmentRunStatus.DRAFT || run.status === AssessmentRunStatus.IN_PROGRESS || run.status === AssessmentRunStatus.ARCHIVED)
      .map((run) => ({
        id: run.id,
        title: run.title,
        periodLabel: run.periodLabel,
        status: run.status,
        dueDate: run.dueDate,
        updatedAt: run.updatedAt,
        guestParticipationEnabled: run.guestParticipationEnabled,
        templateVersion: {
          id: run.templateVersion.id,
          name: run.templateVersion.name,
          versionNumber: run.templateVersion.versionNumber
        }
      })),
    submittedRuns: team.assessmentRuns
      .filter((run) => run.status === AssessmentRunStatus.SUBMITTED)
      .map((run) => ({
        id: run.id,
        title: run.title,
        periodLabel: run.periodLabel,
        submittedAt: run.submittedAt,
        overallScore: run.overallScore,
        guestParticipationEnabled: run.guestParticipationEnabled,
        templateVersion: {
          id: run.templateVersion.id,
          name: run.templateVersion.name,
          versionNumber: run.templateVersion.versionNumber
        }
      }))
  });
});

router.post("/teams", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = teamSchema.parse(request.body);
  const created = await prisma.team.create({
    data: {
      name: input.name,
      description: input.description,
      groupId: input.groupId || null
    },
    include: {
      group: true,
      _count: {
        select: {
          memberships: true,
          assessmentRuns: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "team",
    entityId: created.id,
    action: "team.created",
    summary: `${request.adminUser!.displayName} created team ${created.name}`,
    metadata: {
      name: created.name,
      groupId: created.group?.id ?? null,
      groupName: created.group?.name ?? null
    }
  });

  response.status(201).json(serializeTeam(created));
});

router.put("/teams/:id", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = teamSchema.parse(request.body);
  const previous = await prisma.team.findUnique({
    where: { id: String(request.params.id) },
    include: {
      group: true
    }
  });

  const updated = await prisma.team.update({
    where: { id: String(request.params.id) },
    data: {
      name: input.name,
      description: input.description,
      groupId: input.groupId || null
    },
    include: {
      group: true,
      _count: {
        select: {
          memberships: true,
          assessmentRuns: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "team",
    entityId: updated.id,
    action: previous?.groupId !== updated.group?.id ? "team.group_assignment_updated" : "team.updated",
    summary:
      previous?.groupId !== updated.group?.id
        ? `${request.adminUser!.displayName} moved team ${updated.name} to ${updated.group?.name ?? "Ungrouped"}`
        : `${request.adminUser!.displayName} updated team ${updated.name}`,
    metadata: {
      before: previous
        ? {
            name: previous.name,
            description: previous.description,
            groupId: previous.group?.id ?? null,
            groupName: previous.group?.name ?? null
          }
        : null,
      after: {
        name: updated.name,
        description: updated.description,
        groupId: updated.group?.id ?? null,
        groupName: updated.group?.name ?? null
      }
    }
  });

  response.json(serializeTeam(updated));
});

router.delete("/teams/:id", requireRole(UserRole.ADMIN), async (request, response) => {
  const teamId = String(request.params.id);
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      group: true
    }
  });
  const runCount = await prisma.assessmentRun.count({
    where: { teamId }
  });

  if (runCount > 0) {
    return response.status(400).json({ message: "Teams with assessment history cannot be deleted. Archive or retain the team to preserve reporting history." });
  }

  await prisma.team.delete({
    where: { id: teamId }
  });

  if (team) {
    await logAudit({
      actorUserId: request.adminUser!.id,
      entityType: "team",
      entityId: team.id,
      action: "team.deleted",
      summary: `${request.adminUser!.displayName} removed team ${team.name}`,
      metadata: {
        name: team.name,
        groupId: team.group?.id ?? null,
        groupName: team.group?.name ?? null
      }
    });
  }

  response.status(204).send();
});

router.post("/teams/:id/members", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = teamMemberSchema.parse(request.body);
  const teamId = String(request.params.id);
  const [team, user, previousMembership] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: input.userId } }),
    prisma.userTeamMembership.findUnique({
      where: {
        userId_teamId: {
          userId: input.userId,
          teamId
        }
      }
    })
  ]);

  await prisma.userTeamMembership.upsert({
    where: {
      userId_teamId: {
        userId: input.userId,
        teamId
      }
    },
    create: {
      userId: input.userId,
      teamId,
      membershipRole: input.membershipRole
    },
    update: {
      membershipRole: input.membershipRole
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "team_membership",
    entityId: `${teamId}:${input.userId}`,
    action: previousMembership ? "team.membership_updated" : "team.member_added",
    summary: previousMembership
      ? `${request.adminUser!.displayName} updated ${user?.displayName ?? "a user"} membership on ${team?.name ?? "a team"}`
      : `${request.adminUser!.displayName} added ${user?.displayName ?? "a user"} to ${team?.name ?? "a team"}`,
    metadata: {
      teamId,
      teamName: team?.name ?? null,
      userId: input.userId,
      userDisplayName: user?.displayName ?? null,
      beforeRole: previousMembership?.membershipRole ?? null,
      afterRole: input.membershipRole
    }
  });

  response.json({ ok: true });
});

router.delete("/teams/:id/members/:userId", requireRole(UserRole.ADMIN), async (request, response) => {
  const teamId = String(request.params.id);
  const userId = String(request.params.userId);
  const [team, user, membership] = await Promise.all([
    prisma.team.findUnique({ where: { id: teamId } }),
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userTeamMembership.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId
        }
      }
    })
  ]);

  await prisma.userTeamMembership.delete({
    where: {
      userId_teamId: {
        userId,
        teamId
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "team_membership",
    entityId: `${teamId}:${userId}`,
    action: "team.member_removed",
    summary: `${request.adminUser!.displayName} removed ${user?.displayName ?? "a user"} from ${team?.name ?? "a team"}`,
    metadata: {
      teamId,
      teamName: team?.name ?? null,
      userId,
      userDisplayName: user?.displayName ?? null,
      membershipRole: membership?.membershipRole ?? null
    }
  });

  response.status(204).send();
});

router.get("/categories", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (_request, response) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" }
  });
  response.json(categories);
});

router.post("/categories", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = categorySchema.parse(request.body);
  const created = await prisma.category.create({
    data: {
      name: input.name,
      description: input.description
    }
  });
  response.status(201).json(created);
});

router.put("/categories/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = categorySchema.parse(request.body);
  const updated = await prisma.category.update({
    where: { id: String(request.params.id) },
    data: {
      name: input.name,
      description: input.description
    }
  });
  response.json(updated);
});

router.delete("/categories/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  await prisma.category.delete({
    where: { id: String(request.params.id) }
  });
  response.status(204).send();
});

router.get("/template-drafts", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (_request, response) => {
  const drafts = await prisma.templateDraft.findMany({
    orderBy: {
      updatedAt: "desc"
    }
  });

  response.json(drafts.map(serializeTemplateDraft));
});

router.get("/template-drafts/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const draft = await prisma.templateDraft.findUnique({
    where: { id: String(request.params.id) }
  });

  if (!draft) {
    return response.status(404).json({ message: "Template draft not found" });
  }

  response.json(serializeTemplateDraft(draft));
});

router.post("/template-drafts", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateDraftSchema.parse(request.body);
  const created = await prisma.templateDraft.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category,
      scoringLabels: input.scoringLabels,
      draftData: input
    }
  });

  response.status(201).json(serializeTemplateDraft(created));
});

router.put("/template-drafts/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateDraftSchema.parse(request.body);
  const updated = await prisma.templateDraft.update({
    where: { id: String(request.params.id) },
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      category: input.category,
      scoringLabels: input.scoringLabels,
      draftData: input
    }
  });

  response.json(serializeTemplateDraft(updated));
});

router.put("/template-drafts/:id/status", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateDraftStatusSchema.parse(request.body ?? {});
  const updated = await prisma.templateDraft.update({
    where: { id: String(request.params.id) },
    data: {
      status: input.status
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "template_draft",
    entityId: updated.id,
    action: "template_draft.status_updated",
    summary: `${request.adminUser!.displayName} marked template draft ${updated.name} as ${input.status.toLowerCase().replace(/_/g, " ")}`
  });

  response.json(serializeTemplateDraft(updated));
});

router.delete("/template-drafts/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  await prisma.templateDraft.delete({
    where: { id: String(request.params.id) }
  });

  response.status(204).send();
});

router.get("/question-library", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (_request, response) => {
  const questions = await prisma.questionLibraryItem.findMany({
    orderBy: {
      updatedAt: "desc"
    }
  });
  const { usage, versionPromptSets, domainQuestionPromptSets } = await buildQuestionLibraryUsage();

  response.json(
    questions.map((question) => {
      const baseUsage = usage.get(question.id) ?? { draftCount: 0, templateCount: 0, domainCount: 0 };
      const templateCount =
        baseUsage.templateCount
        + versionPromptSets.filter((prompts) => prompts.has(question.prompt)).length;
      const domainCount =
        baseUsage.domainCount
        + domainQuestionPromptSets.filter((domain) => domain.prompts.has(question.prompt)).length;

      return {
        id: question.id,
        title: question.title,
        prompt: question.prompt,
        guidance: question.guidance,
        levels: question.levels,
        usage: {
          draftCount: baseUsage.draftCount,
          templateCount,
          domainCount
        }
      };
    })
  );
});

router.post("/question-library", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = questionLibrarySchema.parse(request.body);
  const created = await prisma.questionLibraryItem.create({
    data: {
      title: input.title,
      prompt: input.prompt,
      guidance: input.guidance,
      levels: input.levels
    }
  });

  response.status(201).json({
    id: created.id,
    title: created.title,
    prompt: created.prompt,
    guidance: created.guidance,
    levels: created.levels
  });
});

router.put("/question-library/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = questionLibrarySchema.parse(request.body);
  const updated = await prisma.questionLibraryItem.update({
    where: { id: String(request.params.id) },
    data: {
      title: input.title,
      prompt: input.prompt,
      guidance: input.guidance,
      levels: input.levels
    }
  });

  response.json({
    id: updated.id,
    title: updated.title,
    prompt: updated.prompt,
    guidance: updated.guidance,
    levels: updated.levels
  });
});

router.delete("/question-library/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  await prisma.questionLibraryItem.delete({
    where: { id: String(request.params.id) }
  });

  response.status(204).send();
});

router.get("/domain-library", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (_request, response) => {
  const domains = await prisma.domainLibraryItem.findMany({
    orderBy: {
      updatedAt: "desc"
    }
  });
  const { usage, versionTitleSets } = await buildDomainLibraryUsage();

  response.json(
    domains.map((domain) => {
      const baseUsage = usage.get(domain.id) ?? { draftCount: 0, templateCount: 0 };
      const templateCount = baseUsage.templateCount + versionTitleSets.filter((titles) => titles.has(domain.title)).length;

      return {
        id: domain.id,
        title: domain.title,
        description: domain.description,
        questions: domain.questions,
        usage: {
          draftCount: baseUsage.draftCount,
          templateCount
        }
      };
    })
  );
});

router.post("/domain-library", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = domainLibrarySchema.parse(request.body);
  const created = await prisma.domainLibraryItem.create({
    data: {
      title: input.title,
      description: input.description,
      questions: input.questions
    }
  });

  response.status(201).json({
    id: created.id,
    title: created.title,
    description: created.description,
    questions: created.questions
  });
});

router.put("/domain-library/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = domainLibrarySchema.parse(request.body);
  const updated = await prisma.domainLibraryItem.update({
    where: { id: String(request.params.id) },
    data: {
      title: input.title,
      description: input.description,
      questions: input.questions
    }
  });

  response.json({
    id: updated.id,
    title: updated.title,
    description: updated.description,
    questions: updated.questions
  });
});

router.delete("/domain-library/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  await prisma.domainLibraryItem.delete({
    where: { id: String(request.params.id) }
  });

  response.status(204).send();
});

router.get("/templates", async (_request, response) => {
  const templates = await prisma.assessmentTemplate.findMany({
    include: {
      versions: {
        orderBy: { versionNumber: "desc" },
        take: 1
      },
      _count: {
        select: {
          assessmentRuns: true
        }
      },
      assessmentRuns: {
        where: {
          status: AssessmentRunStatus.SUBMITTED
        },
        select: {
          id: true
        }
      }
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  response.json(
    templates.map((template) => ({
      id: template.id,
      name: template.name,
      slug: template.slug,
      description: template.description,
      category: template.category,
      updatedAt: template.updatedAt,
      usage: {
        totalRuns: template._count.assessmentRuns,
        submittedRuns: template.assessmentRuns.length
      },
      latestVersion: template.versions[0]
        ? {
            id: template.versions[0].id,
            versionNumber: template.versions[0].versionNumber,
            scoringLabels: template.versions[0].scoringLabels
          }
        : null
    }))
  );
});

router.get("/templates/:id", async (request, response) => {
  const template = await prisma.assessmentTemplate.findUnique({
    where: { id: request.params.id },
    include: {
      assessmentRuns: {
        include: {
          team: true
        },
        orderBy: {
          updatedAt: "desc"
        },
        take: 10
      },
      _count: {
        select: {
          assessmentRuns: true
        }
      },
      versions: {
        include: {
          domains: {
            include: {
              questions: {
                include: {
                  levels: true
                }
              }
            }
          }
        },
        orderBy: {
          versionNumber: "desc"
        }
      }
    }
  });

  if (!template) {
    return response.status(404).json({ message: "Template not found" });
  }

  response.json({
    id: template.id,
    name: template.name,
    slug: template.slug,
    description: template.description,
    category: template.category,
    usage: {
      totalRuns: template._count.assessmentRuns,
      recentRuns: template.assessmentRuns.map((run) => ({
        id: run.id,
        title: run.title,
        teamName: run.team.name,
        periodLabel: run.periodLabel,
        status: run.status,
        updatedAt: run.updatedAt
      }))
    },
    versions: template.versions.map(serializeTemplateVersion)
  });
});

router.post("/templates", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateSchema.parse(request.body);
  const result = await createTemplate(input);
  response.status(201).json({
    id: result.template.id,
    version: serializeTemplateVersion(result.version)
  });
});

router.put("/templates/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateSchema.parse(request.body);
  const result = await updateTemplate(String(request.params.id), input);
  response.json({
    id: result.template.id,
    version: serializeTemplateVersion(result.version)
  });
});

router.delete("/templates/:id", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  await deleteTemplate(String(request.params.id));
  response.status(204).send();
});

router.get("/assessment-runs", async (request, response) => {
  const user = request.adminUser!;
  const teamIds =
    user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER ? [] : await getUserTeamIds(user.id);
  const runs = await prisma.assessmentRun.findMany({
    where:
      user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
        ? undefined
        : user.role === UserRole.VIEWER
          ? {
              status: AssessmentRunStatus.SUBMITTED,
              OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
            }
          : {
              OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
            },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      templateVersion: true
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  response.json(runs.map(serializeAssessmentRunSummary));
});

router.get("/my-assessments", async (request, response) => {
  const user = request.adminUser!;
  const teamIds = await getUserTeamIds(user.id);
  const accessibleRuns = await prisma.assessmentRun.findMany({
    where:
      user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
        ? undefined
        : user.role === UserRole.VIEWER
          ? {
              status: AssessmentRunStatus.SUBMITTED,
              OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
            }
          : {
              OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
            },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      templateVersion: true
    },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }]
  });

  const individualParticipantRuns =
    user.role === UserRole.VIEWER
      ? []
      : await prisma.assessmentRunParticipant.findMany({
          where: {
            userId: user.id,
            assessmentRun: {
              status: {
                notIn: [AssessmentRunStatus.SUBMITTED, AssessmentRunStatus.ARCHIVED]
              }
            }
          },
          include: {
            assessmentRun: {
              include: {
                team: {
                  include: {
                    group: true
                  }
                },
                target: true,
                templateVersion: true
              }
            }
          },
          orderBy: [{ submittedAt: "asc" }, { invitedAt: "desc" }]
        });
  const individualParticipantRunIds = new Set(individualParticipantRuns.map((participant) => participant.assessmentRunId));

  response.json({
    individualActive: individualParticipantRuns.map((participant) => ({
      ...serializeAssessmentRunSummary(participant.assessmentRun),
      participantStatus: participant.status,
      participantId: participant.id,
      participantSubmittedAt: participant.submittedAt
    })),
    assignedActive: accessibleRuns
      .filter((run) => run.ownerUserId === user.id && run.status !== AssessmentRunStatus.SUBMITTED && run.status !== AssessmentRunStatus.ARCHIVED)
      .map(serializeAssessmentRunSummary),
    teamActive: accessibleRuns
      .filter(
        (run) =>
          run.ownerUserId !== user.id
          && !individualParticipantRunIds.has(run.id)
          && run.status !== AssessmentRunStatus.SUBMITTED
          && run.status !== AssessmentRunStatus.ARCHIVED
      )
      .map(serializeAssessmentRunSummary),
    submittedAccessible: accessibleRuns
      .filter((run) => run.status === AssessmentRunStatus.SUBMITTED)
      .map(serializeAssessmentRunSummary)
  });
});

router.get("/external-contacts", async (_request, response) => {
  const contacts = await prisma.externalContact.findMany({
    include: {
      _count: {
        select: {
          guestAssessmentLinks: true,
          assessmentParticipants: true,
          assessmentTargets: true
        }
      }
    },
    orderBy: [{ displayName: "asc" }]
  });

  response.json(contacts.map(serializeExternalContact));
});

router.get("/external-contacts/:id/details", requireRole(UserRole.ADMIN), async (request, response) => {
  const contact = await prisma.externalContact.findUnique({
    where: { id: String(request.params.id) },
    include: {
      guestAssessmentLinks: {
        include: {
          assessmentRun: {
            select: {
              id: true,
              title: true,
              periodLabel: true,
              status: true,
              team: { select: { id: true, name: true } },
              templateVersion: { select: { id: true, name: true, versionNumber: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      },
      assessmentParticipants: {
        include: {
          assessmentRun: {
            select: {
              id: true,
              title: true,
              periodLabel: true,
              status: true,
              team: { select: { id: true, name: true } },
              templateVersion: { select: { id: true, name: true, versionNumber: true } }
            }
          },
          emailDeliveries: {
            orderBy: { createdAt: "desc" },
            take: 5
          },
          _count: { select: { responses: true } }
        },
        orderBy: { invitedAt: "desc" }
      },
      _count: {
        select: {
          guestAssessmentLinks: true,
          assessmentParticipants: true,
          assessmentTargets: true
        }
      }
    }
  });

  if (!contact) {
    return response.status(404).json({ message: "External contact not found" });
  }

  response.json({
    contact: serializeExternalContact(contact),
    guestLinks: contact.guestAssessmentLinks.map((link) => ({
      id: link.id,
      inviteLabel: link.inviteLabel,
      guestDisplayName: link.guestDisplayName,
      guestEmail: link.guestEmail,
      isRevoked: link.isRevoked,
      expiresAt: link.expiresAt,
      startedAt: link.startedAt,
      lastAccessedAt: link.lastAccessedAt,
      submittedAt: link.submittedAt,
      createdAt: link.createdAt,
      assessmentRun: link.assessmentRun
    })),
    participants: contact.assessmentParticipants.map((participant) => ({
      ...serializeAssessmentRunParticipant({
        ...participant,
        user: null,
        externalContact: {
          id: contact.id,
          displayName: contact.displayName,
          email: contact.email,
          organization: contact.organization
        }
      }),
      assessmentRun: participant.assessmentRun,
      recentEmailDeliveries: participant.emailDeliveries
    }))
  });
});

router.post("/external-contacts", async (request, response) => {
  const input = externalContactSchema.parse(request.body ?? {});
  const created = await prisma.externalContact.create({
    data: {
      displayName: input.displayName,
      email: input.email?.trim() || null,
      organization: input.organization?.trim() || null,
      notes: input.notes?.trim() || null,
      createdByUserId: request.adminUser!.id
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "external_contact",
    entityId: created.id,
    action: "external_contact.created",
    summary: `${request.adminUser!.displayName} created external contact ${created.displayName}`
  });

  response.status(201).json(serializeExternalContact(created));
});

router.put("/external-contacts/:id", requireRole(UserRole.ADMIN), async (request, response) => {
  const input = externalContactSchema.parse(request.body ?? {});
  const existing = await prisma.externalContact.findUnique({
    where: { id: String(request.params.id) }
  });

  if (!existing) {
    return response.status(404).json({ message: "External contact not found" });
  }

  const updated = await prisma.externalContact.update({
    where: { id: String(request.params.id) },
    data: {
      displayName: input.displayName,
      email: input.email?.trim() || null,
      organization: input.organization?.trim() || null,
      notes: input.notes?.trim() || null
    },
    include: {
      _count: {
        select: {
          guestAssessmentLinks: true,
          assessmentParticipants: true,
          assessmentTargets: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "external_contact",
    entityId: updated.id,
    action: "external_contact.updated",
    summary: `${request.adminUser!.displayName} updated external contact ${updated.displayName}`
  });

  response.json(serializeExternalContact(updated));
});

router.delete("/external-contacts/:id", requireRole(UserRole.ADMIN), async (request, response) => {
  const contact = await prisma.externalContact.findUnique({
    where: { id: String(request.params.id) },
    include: {
      _count: {
        select: {
          guestAssessmentLinks: true,
          assessmentParticipants: true,
          assessmentTargets: true
        }
      }
    }
  });

  if (!contact) {
    return response.status(404).json({ message: "External contact not found" });
  }

  const usageCount =
    contact._count.guestAssessmentLinks
    + contact._count.assessmentParticipants
    + contact._count.assessmentTargets;

  if (usageCount > 0) {
    return response.status(400).json({ message: "External contacts with assessment history cannot be deleted." });
  }

  await prisma.externalContact.delete({
    where: { id: contact.id }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "external_contact",
    entityId: contact.id,
    action: "external_contact.deleted",
    summary: `${request.adminUser!.displayName} deleted external contact ${contact.displayName}`
  });

  response.status(204).send();
});

router.get("/email-deliveries", requireRole(UserRole.ADMIN), async (_request, response) => {
  const deliveries = await prisma.emailDeliveryLog.findMany({
    take: 150,
    orderBy: [{ createdAt: "desc" }],
    include: {
      assessmentRun: {
        select: {
          id: true,
          title: true,
          periodLabel: true,
          team: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      createdByUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      },
      guestLink: {
        select: {
          id: true,
          inviteLabel: true,
          guestDisplayName: true,
          guestEmail: true
        }
      },
      participant: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      }
    }
  });

  response.json(deliveries.map(serializeEmailDeliveryLog));
});

router.get("/security-overview", requireRole(UserRole.ADMIN), async (_request, response) => {
  const now = new Date();
  const [activeSessions, expiredSessions, pendingInvites, expiredInvites, externalLinks, revokedExternalLinks] = await Promise.all([
    prisma.user.count({ where: { sessionToken: { not: null }, sessionExpiresAt: { gt: now } } }),
    prisma.user.count({ where: { sessionToken: { not: null }, OR: [{ sessionExpiresAt: null }, { sessionExpiresAt: { lte: now } }] } }),
    prisma.user.count({ where: { inviteToken: { not: null }, inviteExpiresAt: { gt: now } } }),
    prisma.user.count({ where: { inviteToken: { not: null }, OR: [{ inviteExpiresAt: null }, { inviteExpiresAt: { lte: now } }] } }),
    prisma.assessmentRunParticipant.count({
      where: {
        externalAccessToken: { not: null },
        externalAccessRevoked: false,
        OR: [{ externalAccessExpiresAt: null }, { externalAccessExpiresAt: { gt: now } }]
      }
    }),
    prisma.assessmentRunParticipant.count({
      where: {
        externalAccessToken: { not: null },
        externalAccessRevoked: true
      }
    })
  ]);

  response.json({
    activeSessions,
    expiredSessions,
    pendingInvites,
    expiredInvites,
    activeExternalParticipantLinks: externalLinks,
    revokedExternalParticipantLinks: revokedExternalLinks
  });
});

router.get("/security/external-participant-links", requireRole(UserRole.ADMIN), async (_request, response) => {
  const now = new Date();
  const participants = await prisma.assessmentRunParticipant.findMany({
    where: {
      externalAccessToken: { not: null },
      externalAccessRevoked: false,
      status: { not: AssessmentParticipantStatus.SUBMITTED },
      OR: [{ externalAccessExpiresAt: null }, { externalAccessExpiresAt: { gt: now } }]
    },
    include: {
      externalContact: true,
      assessmentRun: {
        select: {
          id: true,
          title: true,
          periodLabel: true,
          team: { select: { id: true, name: true } }
        }
      }
    },
    orderBy: [{ externalAccessExpiresAt: "asc" }, { createdAt: "desc" }],
    take: 50
  });

  response.json(
    participants.map((participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      email: participant.email,
      status: participant.status,
      externalAccessUrl: participant.externalAccessToken ? `/external-participant-assessments/${participant.externalAccessToken}` : null,
      externalAccessExpiresAt: participant.externalAccessExpiresAt,
      createdAt: participant.createdAt,
      externalContact: participant.externalContact
        ? {
            id: participant.externalContact.id,
            displayName: participant.externalContact.displayName,
            email: participant.externalContact.email,
            organization: participant.externalContact.organization
          }
        : null,
      assessmentRun: participant.assessmentRun
    }))
  );
});

router.post("/security/clear-expired-sessions", requireRole(UserRole.ADMIN), async (request, response) => {
  const result = await prisma.user.updateMany({
    where: {
      sessionToken: { not: null },
      OR: [{ sessionExpiresAt: null }, { sessionExpiresAt: { lte: new Date() } }]
    },
    data: {
      sessionToken: null,
      sessionExpiresAt: null
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "security",
    entityId: "expired_sessions",
    action: "security.expired_sessions_cleared",
    summary: `${request.adminUser!.displayName} cleared ${result.count} expired user sessions`
  });

  response.json({ count: result.count });
});

router.post("/security/clear-expired-invites", requireRole(UserRole.ADMIN), async (request, response) => {
  const result = await prisma.user.updateMany({
    where: {
      inviteToken: { not: null },
      OR: [{ inviteExpiresAt: null }, { inviteExpiresAt: { lte: new Date() } }]
    },
    data: {
      inviteToken: null,
      inviteExpiresAt: null
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "security",
    entityId: "expired_invites",
    action: "security.expired_invites_cleared",
    summary: `${request.adminUser!.displayName} cleared ${result.count} expired activation invites`
  });

  response.json({ count: result.count });
});

router.post("/assessment-runs/check-duplicate", async (request, response) => {
  const input = assessmentRunSchema.parse(request.body);
  const user = request.adminUser!;
  if (!(await canCreateAssessmentForTeam(user, input.teamId))) {
    return response.status(403).json({ message: "You do not have permission to create runs for this team" });
  }
  const matches = await findDuplicateRuns(input);
  const period = buildAssessmentPeriod(input);

  response.json({
    periodLabel: period.periodLabel,
    hasDuplicate: matches.length > 0,
    matches: matches.map((run) => ({
      id: run.id,
      title: run.title,
      status: run.status,
      periodLabel: run.periodLabel,
      updatedAt: run.updatedAt,
      teamName: run.team.name,
      templateName: run.templateVersion.name
    }))
  });
});

router.post("/assessment-runs", async (request, response) => {
  const input = assessmentRunSchema.parse(request.body);
  const user = request.adminUser!;
  if (!(await canCreateAssessmentForTeam(user, input.teamId))) {
    return response.status(403).json({ message: "You do not have permission to create runs for this team" });
  }
  const duplicates = await findDuplicateRuns(input);

  if (duplicates.length > 0 && !input.allowDuplicate) {
    return response.status(409).json({
      message: "A run already exists for this team, template, and period.",
      matches: duplicates.map((run) => ({
        id: run.id,
        title: run.title,
        status: run.status,
        periodLabel: run.periodLabel,
        updatedAt: run.updatedAt,
        teamName: run.team.name,
        templateName: run.templateVersion.name
      }))
    });
  }

  const participantUserIds = normalizeParticipantUserIds(input.participantCollection?.userIds ?? []);
  const externalContactIds = normalizeExternalContactIds(input.participantCollection?.externalContactIds ?? []);
  if (input.responseMode === AssessmentResponseMode.INDIVIDUAL_AGGREGATED) {
    const invalidUserIds = await findInvalidTeamParticipantUserIds(input.teamId, participantUserIds);
    if (invalidUserIds.length > 0) {
      return response.status(400).json({
        message: "Individual participants must be active members of the selected team.",
        invalidUserIds
      });
    }

    if (externalContactIds.length > 0) {
      const existingContacts = await prisma.externalContact.findMany({
        where: { id: { in: externalContactIds } },
        select: { id: true }
      });
      const existingContactIds = new Set(existingContacts.map((contact) => contact.id));
      const invalidExternalContactIds = externalContactIds.filter((contactId) => !existingContactIds.has(contactId));
      if (invalidExternalContactIds.length > 0) {
        return response.status(400).json({
          message: "One or more external contacts were not found.",
          invalidExternalContactIds
        });
      }
    }
  }

  const period = buildAssessmentPeriod(input) satisfies Pick<
    Prisma.AssessmentRunUncheckedCreateInput,
    "periodType" | "periodLabel" | "periodBucket" | "periodSortDate" | "year" | "quarter" | "startDate" | "endDate" | "referenceDate"
  >;
  const ownerName = input.ownerName?.trim() || null;
  const created = await prisma.$transaction(async (transaction) => {
    const target = await ensureTeamAssessmentTarget(transaction, input.teamId);
    const responseMode = input.responseMode ?? AssessmentResponseMode.SHARED;
    const nextRun = await transaction.assessmentRun.create({
      data: {
        title: input.title,
        teamId: input.teamId,
        targetId: target.id,
        responseMode,
        participantVisibility: input.participantVisibility ?? AssessmentParticipantVisibility.ANONYMOUS_AGGREGATED,
        minimumParticipantResponses: input.minimumParticipantResponses ?? null,
        templateId: input.templateId,
        templateVersionId: input.templateVersionId,
        ownerUserId: input.ownerUserId ?? null,
        ownerName,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        guestParticipationEnabled: Boolean(input.guestParticipationEnabled),
        ...period
      }
    });

    if (input.ownerUserId || ownerName) {
      await transaction.assessmentRunAssignment.create({
        data: {
          assessmentRunId: nextRun.id,
          assignedByUserId: user.id,
          toUserId: input.ownerUserId ?? null,
          toOwnerName: ownerName
        }
      });
    }

    if (responseMode === AssessmentResponseMode.INDIVIDUAL_AGGREGATED) {
      await createInternalParticipantSet({
        transaction,
        assessmentRunId: nextRun.id,
        userIds: participantUserIds
      });
      await createExternalParticipantSet({
        transaction,
        assessmentRunId: nextRun.id,
        externalContactIds,
        expiresAt: null
      });
    }

    return nextRun;
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: created.id,
    entityType: "assessment_run",
    entityId: created.id,
    action: "assessment_run.created",
    summary: `${user.displayName} created assessment run ${created.title}`,
    metadata: {
      responseMode: created.responseMode,
      targetId: created.targetId
    }
  });

  await createRunNotification({
    runId: created.id,
    userId: created.ownerUserId,
    type: "RUN_ASSIGNED",
    title: "Assessment assigned",
    message: `${created.title} has been assigned to you.`
  });

  response.status(201).json(created);
});

router.get("/assessment-runs/:id", async (request, response) => {
  if (!(await canAccessAssessmentRun(request.adminUser!, String(request.params.id)))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }
  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      ownerUser: true,
      assignmentHistory: {
        include: {
          assignedByUser: true,
          fromUser: true,
          toUser: true
        },
        orderBy: {
          createdAt: "desc"
        }
      },
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: {
                include: {
                  levels: true
                }
              }
            }
          }
        }
      },
      responses: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  response.json(serializeAssessmentRun(run));
});

router.get("/assessment-runs/:id/participants", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const participants = await prisma.assessmentRunParticipant.findMany({
    where: {
      assessmentRunId: runId
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          username: true,
          email: true
        }
      },
      externalContact: {
        select: {
          id: true,
          displayName: true,
          email: true,
          organization: true
        }
      },
      emailDeliveries: {
        orderBy: { createdAt: "desc" },
        take: 1
      },
      _count: {
        select: {
          responses: true
        }
      }
    },
    orderBy: [{ displayName: "asc" }, { invitedAt: "asc" }]
  });

  response.json(participants.map(serializeAssessmentRunParticipant));
});

router.post("/assessment-runs/:id/participants/internal-users", async (request, response) => {
  const runId = String(request.params.id);
  const input = internalParticipantsSchema.parse(request.body);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to manage participants for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      title: true,
      teamId: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  const participantUserIds = normalizeParticipantUserIds(input.userIds);
  const invalidUserIds = await findInvalidTeamParticipantUserIds(run.teamId, participantUserIds);
  if (invalidUserIds.length > 0) {
    return response.status(400).json({
      message: "Individual participants must be active members of the assessment team.",
      invalidUserIds
    });
  }

  const participants = await prisma.$transaction(async (transaction) => {
    await transaction.assessmentRun.update({
      where: { id: runId },
      data: {
        responseMode: AssessmentResponseMode.INDIVIDUAL_AGGREGATED
      }
    });

    await createInternalParticipantSet({
      transaction,
      assessmentRunId: runId,
      userIds: participantUserIds
    });

    return transaction.assessmentRunParticipant.findMany({
      where: {
        assessmentRunId: runId
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            email: true
          }
        },
        externalContact: {
          select: {
            id: true,
            displayName: true,
            email: true,
            organization: true
          }
        },
        emailDeliveries: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        _count: {
          select: {
            responses: true
          }
        }
      },
      orderBy: [{ displayName: "asc" }, { invitedAt: "asc" }]
    });
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: run.id,
    entityType: "assessment_run",
    entityId: run.id,
    action: "assessment_run.participants_updated",
    summary: `${user.displayName} updated individual participants for ${run.title}`,
    metadata: {
      responseMode: AssessmentResponseMode.INDIVIDUAL_AGGREGATED,
      participantUserIds
    }
  });

  response.json(participants.map(serializeAssessmentRunParticipant));
});

router.post("/assessment-runs/:id/participants/external-contacts", async (request, response) => {
  const runId = String(request.params.id);
  const input = externalParticipantsSchema.parse(request.body);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to manage participants for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      title: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  const externalContactIds = normalizeExternalContactIds(input.externalContactIds);
  const existingContacts = await prisma.externalContact.findMany({
    where: { id: { in: externalContactIds } },
    select: { id: true }
  });
  const existingContactIds = new Set(existingContacts.map((contact) => contact.id));
  const invalidExternalContactIds = externalContactIds.filter((contactId) => !existingContactIds.has(contactId));

  if (invalidExternalContactIds.length > 0) {
    return response.status(400).json({
      message: "One or more external contacts were not found.",
      invalidExternalContactIds
    });
  }

  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null;
  const participants = await prisma.$transaction(async (transaction) => {
    await transaction.assessmentRun.update({
      where: { id: runId },
      data: {
        responseMode: AssessmentResponseMode.INDIVIDUAL_AGGREGATED
      }
    });

    await createExternalParticipantSet({
      transaction,
      assessmentRunId: runId,
      externalContactIds,
      expiresAt
    });

    return transaction.assessmentRunParticipant.findMany({
      where: {
        assessmentRunId: runId
      },
      include: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            email: true
          }
        },
        externalContact: {
          select: {
            id: true,
            displayName: true,
            email: true,
            organization: true
          }
        },
        emailDeliveries: {
          orderBy: { createdAt: "desc" },
          take: 1
        },
        _count: {
          select: {
            responses: true
          }
        }
      },
      orderBy: [{ displayName: "asc" }, { invitedAt: "asc" }]
    });
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: run.id,
    entityType: "assessment_run",
    entityId: run.id,
    action: "assessment_run.external_participants_updated",
    summary: `${user.displayName} updated external individual participants for ${run.title}`,
    metadata: {
      responseMode: AssessmentResponseMode.INDIVIDUAL_AGGREGATED,
      externalContactIds,
      expiresAt
    }
  });

  response.json(participants.map(serializeAssessmentRunParticipant));
});

router.post("/assessment-runs/:id/participants/:participantId/send-invite-email", async (request, response) => {
  const runId = String(request.params.id);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to email participants for this run" });
  }

  const participant = await prisma.assessmentRunParticipant.findFirst({
    where: {
      id: String(request.params.participantId),
      assessmentRunId: runId
    },
    include: {
      assessmentRun: {
        include: {
          team: true,
          templateVersion: true
        }
      },
      user: true,
      externalContact: true
    }
  });

  const recipientEmail = participant?.user?.email || participant?.email || participant?.externalContact?.email;
  if (!participant || !recipientEmail) {
    return response.status(400).json({ message: "Participant does not have an email address." });
  }

  const isExternalParticipant = Boolean(participant.externalContactId);
  let externalAccessToken = isExternalParticipant && !participant.externalAccessRevoked ? participant.externalAccessToken : null;
  if (isExternalParticipant && !externalAccessToken) {
    const refreshedAccess = await prisma.assessmentRunParticipant.update({
      where: { id: participant.id },
      data: {
        externalAccessToken: createShareToken(),
        externalAccessRevoked: false
      },
      select: {
        externalAccessToken: true
      }
    });
    externalAccessToken = refreshedAccess.externalAccessToken;
  }
  const participantUrl = isExternalParticipant && externalAccessToken
    ? buildExternalParticipantAssessmentUrl(externalAccessToken)
    : buildApplicationUrl(`/assessments/${runId}/participant`);
  await sendTrackedEmail({
    type: isExternalParticipant ? "external_participant_invite" : "internal_participant_invite",
    to: recipientEmail,
    recipientName: participant.displayName,
    subject: `Assessment response requested: ${participant.assessmentRun.title}`,
    body: [
      `Hello ${participant.displayName},`,
      "",
      `${user.displayName} invited you to submit an individual assessment response.`,
      "",
      `Assessment: ${participant.assessmentRun.title}`,
      `Team: ${participant.assessmentRun.team.name}`,
      `Template: ${participant.assessmentRun.templateVersion.name} v${participant.assessmentRun.templateVersion.versionNumber}`,
      isExternalParticipant && participant.externalAccessExpiresAt ? `Link expires: ${participant.externalAccessExpiresAt.toISOString()}` : "",
      "",
      `Open your response workspace: ${participantUrl}`,
      "",
      "Your answers are saved separately and will be aggregated after the required participant submissions are complete."
    ].filter((line, index, lines) => line || lines[index - 1]).join("\n"),
    actorUserId: user.id,
    assessmentRunId: runId,
    participantId: participant.id
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: participant.id,
    action: "assessment_run_participant.invite_email_sent",
    summary: `${user.displayName} sent an individual assessment invite email to ${participant.displayName}`
  });

  response.json({ ok: true });
});

router.post("/assessment-runs/:id/participants/send-bulk-invites", async (request, response) => {
  const runId = String(request.params.id);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to email participants for this run" });
  }

  const participants = await prisma.assessmentRunParticipant.findMany({
    where: {
      assessmentRunId: runId,
      status: {
        not: AssessmentParticipantStatus.SUBMITTED
      }
    },
    include: {
      assessmentRun: {
        include: {
          team: true,
          templateVersion: true
        }
      },
      user: true,
      externalContact: true
    },
    orderBy: [{ displayName: "asc" }]
  });

  let sent = 0;
  let skipped = 0;
  const failures: Array<{ participantId: string; displayName: string; message: string }> = [];

  for (const participant of participants) {
    const recipientEmail = participant.user?.email || participant.email || participant.externalContact?.email;
    if (!recipientEmail) {
      skipped += 1;
      continue;
    }

    const isExternalParticipant = Boolean(participant.externalContactId);
    let externalAccessToken = isExternalParticipant && !participant.externalAccessRevoked ? participant.externalAccessToken : null;
    if (isExternalParticipant && !externalAccessToken) {
      const refreshedAccess = await prisma.assessmentRunParticipant.update({
        where: { id: participant.id },
        data: {
          externalAccessToken: createShareToken(),
          externalAccessRevoked: false
        },
        select: {
          externalAccessToken: true
        }
      });
      externalAccessToken = refreshedAccess.externalAccessToken;
    }

    const participantUrl = isExternalParticipant && externalAccessToken
      ? buildExternalParticipantAssessmentUrl(externalAccessToken)
      : buildApplicationUrl(`/assessments/${runId}/participant`);

    try {
      await sendTrackedEmail({
        type: isExternalParticipant ? "external_participant_invite" : "internal_participant_invite",
        to: recipientEmail,
        recipientName: participant.displayName,
        subject: `Assessment response requested: ${participant.assessmentRun.title}`,
        body: [
          `Hello ${participant.displayName},`,
          "",
          `${user.displayName} invited you to submit an individual assessment response.`,
          "",
          `Assessment: ${participant.assessmentRun.title}`,
          `Team: ${participant.assessmentRun.team.name}`,
          `Template: ${participant.assessmentRun.templateVersion.name} v${participant.assessmentRun.templateVersion.versionNumber}`,
          "",
          `Open your response workspace: ${participantUrl}`,
          "",
          "Your answers are saved separately and will be aggregated after the required participant submissions are complete."
        ].join("\n"),
        actorUserId: user.id,
        assessmentRunId: runId,
        participantId: participant.id
      });
      sent += 1;
    } catch (error) {
      failures.push({
        participantId: participant.id,
        displayName: participant.displayName,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: runId,
    action: "assessment_run_participant.bulk_invite_email_sent",
    summary: `${user.displayName} sent ${sent} participant invite emails`,
    metadata: { sent, skipped, failures: failures.length }
  });

  response.json({ sent, skipped, failed: failures.length, failures });
});

router.post("/assessment-runs/:id/participants/:participantId/send-reminder-email", async (request, response) => {
  const runId = String(request.params.id);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to email participants for this run" });
  }

  const participant = await prisma.assessmentRunParticipant.findFirst({
    where: {
      id: String(request.params.participantId),
      assessmentRunId: runId
    },
    include: {
      assessmentRun: {
        include: {
          team: true,
          templateVersion: true
        }
      },
      user: true,
      externalContact: true
    }
  });

  const recipientEmail = participant?.user?.email || participant?.email || participant?.externalContact?.email;
  if (!participant || !recipientEmail) {
    return response.status(400).json({ message: "Participant does not have an email address." });
  }

  if (participant.status === AssessmentParticipantStatus.SUBMITTED) {
    return response.status(400).json({ message: "Participant has already submitted." });
  }

  const isExternalParticipant = Boolean(participant.externalContactId);
  let externalAccessToken = isExternalParticipant && !participant.externalAccessRevoked ? participant.externalAccessToken : null;
  if (isExternalParticipant && !externalAccessToken) {
    const refreshedAccess = await prisma.assessmentRunParticipant.update({
      where: { id: participant.id },
      data: {
        externalAccessToken: createShareToken(),
        externalAccessRevoked: false
      },
      select: {
        externalAccessToken: true
      }
    });
    externalAccessToken = refreshedAccess.externalAccessToken;
  }

  const participantUrl = isExternalParticipant && externalAccessToken
    ? buildExternalParticipantAssessmentUrl(externalAccessToken)
    : buildApplicationUrl(`/assessments/${runId}/participant`);

  await sendTrackedEmail({
    type: isExternalParticipant ? "external_participant_reminder" : "internal_participant_reminder",
    to: recipientEmail,
    recipientName: participant.displayName,
    subject: `Reminder: assessment response needed for ${participant.assessmentRun.title}`,
    body: [
      `Hello ${participant.displayName},`,
      "",
      `${user.displayName} sent a reminder to complete your individual assessment response.`,
      "",
      `Assessment: ${participant.assessmentRun.title}`,
      `Team: ${participant.assessmentRun.team.name}`,
      `Template: ${participant.assessmentRun.templateVersion.name} v${participant.assessmentRun.templateVersion.versionNumber}`,
      "",
      `Open your response workspace: ${participantUrl}`
    ].join("\n"),
    actorUserId: user.id,
    assessmentRunId: runId,
    participantId: participant.id
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: participant.id,
    action: "assessment_run_participant.reminder_email_sent",
    summary: `${user.displayName} sent an individual assessment reminder email to ${participant.displayName}`
  });

  response.json({ ok: true });
});

router.post("/assessment-runs/:id/participants/send-bulk-reminders", async (request, response) => {
  const runId = String(request.params.id);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to email participants for this run" });
  }

  const participants = await prisma.assessmentRunParticipant.findMany({
    where: {
      assessmentRunId: runId,
      status: {
        not: AssessmentParticipantStatus.SUBMITTED
      }
    },
    include: {
      assessmentRun: {
        include: {
          team: true,
          templateVersion: true
        }
      },
      user: true,
      externalContact: true
    },
    orderBy: [{ displayName: "asc" }]
  });

  let sent = 0;
  let skipped = 0;
  const failures: Array<{ participantId: string; displayName: string; message: string }> = [];

  for (const participant of participants) {
    const recipientEmail = participant.user?.email || participant.email || participant.externalContact?.email;
    if (!recipientEmail) {
      skipped += 1;
      continue;
    }

    const isExternalParticipant = Boolean(participant.externalContactId);
    let externalAccessToken = isExternalParticipant && !participant.externalAccessRevoked ? participant.externalAccessToken : null;
    if (isExternalParticipant && !externalAccessToken) {
      const refreshedAccess = await prisma.assessmentRunParticipant.update({
        where: { id: participant.id },
        data: {
          externalAccessToken: createShareToken(),
          externalAccessRevoked: false
        },
        select: {
          externalAccessToken: true
        }
      });
      externalAccessToken = refreshedAccess.externalAccessToken;
    }

    const participantUrl = isExternalParticipant && externalAccessToken
      ? buildExternalParticipantAssessmentUrl(externalAccessToken)
      : buildApplicationUrl(`/assessments/${runId}/participant`);

    try {
      await sendTrackedEmail({
        type: isExternalParticipant ? "external_participant_reminder" : "internal_participant_reminder",
        to: recipientEmail,
        recipientName: participant.displayName,
        subject: `Reminder: assessment response needed for ${participant.assessmentRun.title}`,
        body: [
          `Hello ${participant.displayName},`,
          "",
          `${user.displayName} sent a reminder to complete your individual assessment response.`,
          "",
          `Assessment: ${participant.assessmentRun.title}`,
          `Team: ${participant.assessmentRun.team.name}`,
          `Template: ${participant.assessmentRun.templateVersion.name} v${participant.assessmentRun.templateVersion.versionNumber}`,
          "",
          `Open your response workspace: ${participantUrl}`
        ].join("\n"),
        actorUserId: user.id,
        assessmentRunId: runId,
        participantId: participant.id
      });
      sent += 1;
    } catch (error) {
      failures.push({
        participantId: participant.id,
        displayName: participant.displayName,
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: runId,
    action: "assessment_run_participant.bulk_reminder_email_sent",
    summary: `${user.displayName} sent ${sent} participant reminder emails`,
    metadata: {
      sent,
      skipped,
      failures: failures.length
    }
  });

  response.json({ sent, skipped, failed: failures.length, failures });
});

router.get("/assessment-runs/:id/participants/:participantId/email-deliveries", async (request, response) => {
  const runId = String(request.params.id);
  const participantId = String(request.params.participantId);

  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const participant = await prisma.assessmentRunParticipant.findFirst({
    where: {
      id: participantId,
      assessmentRunId: runId
    },
    select: { id: true }
  });

  if (!participant) {
    return response.status(404).json({ message: "Participant not found" });
  }

  const deliveries = await prisma.emailDeliveryLog.findMany({
    where: {
      participantId
    },
    orderBy: { createdAt: "desc" },
    take: 25,
    include: {
      assessmentRun: {
        select: {
          id: true,
          title: true,
          periodLabel: true,
          team: { select: { id: true, name: true } }
        }
      },
      createdByUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      },
      guestLink: {
        select: {
          id: true,
          inviteLabel: true,
          guestDisplayName: true,
          guestEmail: true
        }
      },
      participant: {
        select: {
          id: true,
          displayName: true,
          email: true
        }
      }
    }
  });

  response.json(deliveries.map(serializeEmailDeliveryLog));
});

router.put("/assessment-runs/:id/participants/:participantId/external-link/expiry", async (request, response) => {
  const runId = String(request.params.id);
  const input = participantLinkLifecycleSchema.parse(request.body ?? {});

  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to manage participant links for this run" });
  }

  const participant = await prisma.assessmentRunParticipant.findFirst({
    where: {
      id: String(request.params.participantId),
      assessmentRunId: runId,
      externalContactId: { not: null }
    },
    select: { id: true }
  });

  if (!participant) {
    return response.status(404).json({ message: "External participant not found." });
  }

  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null;
  const updated = await prisma.assessmentRunParticipant.update({
    where: { id: participant.id },
    data: {
      externalAccessExpiresAt: expiresAt
    },
    include: {
      user: { select: { id: true, displayName: true, username: true, email: true } },
      externalContact: { select: { id: true, displayName: true, email: true, organization: true } },
      emailDeliveries: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { responses: true } }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: updated.id,
    action: "assessment_run_participant.external_link_expiry_updated",
    summary: `${request.adminUser!.displayName} updated an external participant link expiry for ${updated.displayName}`,
    metadata: { expiresAt }
  });

  response.json(serializeAssessmentRunParticipant(updated));
});

router.delete("/assessment-runs/:id/participants/:participantId", async (request, response) => {
  const runId = String(request.params.id);
  const participantId = String(request.params.participantId);

  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to remove participants for this run" });
  }

  const participant = await prisma.assessmentRunParticipant.findFirst({
    where: {
      id: participantId,
      assessmentRunId: runId
    },
    include: {
      _count: { select: { responses: true } }
    }
  });

  if (!participant) {
    return response.status(404).json({ message: "Participant not found" });
  }

  if (participant.status === AssessmentParticipantStatus.SUBMITTED || participant._count.responses > 0) {
    return response.status(400).json({ message: "Participants with saved or submitted responses cannot be removed." });
  }

  await prisma.assessmentRunParticipant.delete({
    where: { id: participant.id }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: participant.id,
    action: "assessment_run_participant.removed",
    summary: `${request.adminUser!.displayName} removed participant ${participant.displayName}`
  });

  response.status(204).send();
});

router.post("/assessment-runs/:id/participants/:participantId/external-link/regenerate", async (request, response) => {
  const runId = String(request.params.id);
  const input = participantLinkLifecycleSchema.parse(request.body ?? {});

  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to manage participant links for this run" });
  }

  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null;
  const participant = await prisma.assessmentRunParticipant.findFirst({
    where: {
      id: String(request.params.participantId),
      assessmentRunId: runId,
      externalContactId: { not: null }
    },
    select: { id: true }
  });

  if (!participant) {
    return response.status(404).json({ message: "External participant not found." });
  }

  const updated = await prisma.assessmentRunParticipant.update({
    where: { id: participant.id },
    data: {
      externalAccessToken: createShareToken(),
      externalAccessExpiresAt: expiresAt,
      externalAccessRevoked: false
    },
    include: {
      user: { select: { id: true, displayName: true, username: true, email: true } },
      externalContact: { select: { id: true, displayName: true, email: true, organization: true } },
      emailDeliveries: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { responses: true } }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: updated.id,
    action: "assessment_run_participant.external_link_regenerated",
    summary: `${request.adminUser!.displayName} regenerated an external participant link for ${updated.displayName}`
  });

  response.json(serializeAssessmentRunParticipant(updated));
});

router.post("/assessment-runs/:id/participants/:participantId/external-link/revoke", async (request, response) => {
  const runId = String(request.params.id);

  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to manage participant links for this run" });
  }

  const participant = await prisma.assessmentRunParticipant.findFirst({
    where: {
      id: String(request.params.participantId),
      assessmentRunId: runId,
      externalContactId: { not: null }
    },
    select: { id: true }
  });

  if (!participant) {
    return response.status(404).json({ message: "External participant not found." });
  }

  const updated = await prisma.assessmentRunParticipant.update({
    where: { id: participant.id },
    data: {
      externalAccessRevoked: true
    },
    include: {
      user: { select: { id: true, displayName: true, username: true, email: true } },
      externalContact: { select: { id: true, displayName: true, email: true, organization: true } },
      emailDeliveries: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { responses: true } }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: updated.id,
    action: "assessment_run_participant.external_link_revoked",
    summary: `${request.adminUser!.displayName} revoked an external participant link for ${updated.displayName}`
  });

  response.json(serializeAssessmentRunParticipant(updated));
});

router.get("/assessment-runs/:id/participant-me", async (request, response) => {
  const runId = String(request.params.id);
  const participant = await getInternalParticipantForUser(runId, request.adminUser!.id);

  if (!participant) {
    return response.status(403).json({ message: "You are not an individual participant for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true,
      ownerUser: true,
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: {
                include: {
                  levels: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (participant.status === AssessmentParticipantStatus.INVITED) {
    await prisma.assessmentRunParticipant.update({
      where: { id: participant.id },
      data: {
        status: AssessmentParticipantStatus.NOT_STARTED
      }
    });
    participant.status = AssessmentParticipantStatus.NOT_STARTED;
  }

  response.json(serializeParticipantAssessmentRun(run, participant));
});

router.put("/assessment-runs/:id/participant-me/responses", async (request, response) => {
  const input = responseSchema.parse(request.body);
  const runId = String(request.params.id);
  const participant = await getInternalParticipantForUser(runId, request.adminUser!.id);

  if (!participant) {
    return response.status(403).json({ message: "You are not an individual participant for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      title: true,
      status: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED || run.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "This assessment is no longer accepting participant responses." });
  }

  if (participant.status === AssessmentParticipantStatus.SUBMITTED) {
    return response.status(400).json({ message: "Your individual response has already been submitted." });
  }

  await prisma.$transaction(async (transaction) => {
    await Promise.all(
      input.responses.map((item) =>
        transaction.participantAssessmentResponse.upsert({
          where: {
            participantId_questionId: {
              participantId: participant.id,
              questionId: item.questionId
            }
          },
          update: {
            selectedValue: item.selectedValue,
            selectedLabel: item.selectedLabel,
            comment: item.comment ?? null
          },
          create: {
            participantId: participant.id,
            questionId: item.questionId,
            selectedValue: item.selectedValue,
            selectedLabel: item.selectedLabel,
            comment: item.comment ?? null
          }
        })
      )
    );

    await transaction.assessmentRunParticipant.update({
      where: { id: participant.id },
      data: {
        status: AssessmentParticipantStatus.IN_PROGRESS,
        startedAt: participant.startedAt ?? new Date()
      }
    });

    if (run.status === AssessmentRunStatus.DRAFT && input.responses.length > 0) {
      await transaction.assessmentRun.update({
        where: { id: runId },
        data: {
          status: AssessmentRunStatus.IN_PROGRESS
        }
      });
    }
  });

  response.json({ ok: true });
});

router.post("/assessment-runs/:id/participant-me/submit", async (request, response) => {
  const runId = String(request.params.id);
  const participant = await getInternalParticipantForUser(runId, request.adminUser!.id);

  if (!participant) {
    return response.status(403).json({ message: "You are not an individual participant for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: true
            }
          }
        }
      }
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED || run.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "This assessment is no longer accepting participant responses." });
  }

  const requiredQuestionIds = run.templateVersion.domains.flatMap((domain) => domain.questions.map((question) => question.id));
  const answeredQuestionIds = new Set(participant.responses.map((item) => item.questionId));
  const missingCount = requiredQuestionIds.filter((questionId) => !answeredQuestionIds.has(questionId)).length;

  if (missingCount > 0) {
    return response.status(400).json({ message: `Answer all required questions before submitting. ${missingCount} unanswered.` });
  }

  const updated = await prisma.assessmentRunParticipant.update({
    where: { id: participant.id },
    data: {
      status: AssessmentParticipantStatus.SUBMITTED,
      submittedAt: new Date(),
      startedAt: participant.startedAt ?? new Date()
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run_participant",
    entityId: participant.id,
    action: "assessment_run_participant.submitted",
    summary: `${request.adminUser!.displayName} submitted an individual response for ${run.title}`
  });

  response.json(serializeAssessmentRunParticipant({ ...updated, user: null, externalContact: null, _count: { responses: participant.responses.length } }));
});

router.put("/assessment-runs/:id", async (request, response) => {
  const input = updateAssessmentRunSchema.parse(request.body);
  const runId = String(request.params.id);

  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to update this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Submitted runs cannot be edited." });
  }

  const updated = await prisma.assessmentRun.update({
    where: { id: runId },
    data: {
      title: input.title,
      ownerUserId: input.ownerUserId ?? null,
      ownerName: input.ownerName?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      periodLabel: input.periodLabel?.trim() || run.periodLabel
    }
  });

  await recordAssignmentChange({
    assessmentRunId: runId,
    assignedByUserId: request.adminUser!.id,
    fromUserId: run.ownerUserId,
    toUserId: input.ownerUserId ?? null,
    fromOwnerName: run.ownerName,
    toOwnerName: input.ownerName?.trim() || null
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.updated",
    summary: `${request.adminUser!.displayName} updated assessment run ${updated.title}`
  });

  if (run.ownerUserId !== updated.ownerUserId && updated.ownerUserId) {
    await createRunNotification({
      runId,
      userId: updated.ownerUserId,
      type: "RUN_REASSIGNED",
      title: "Assessment reassigned",
      message: `${updated.title} has been reassigned to you.`
    });
  }

  response.json(updated);
});

router.put("/assessment-runs/:id/responses", async (request, response) => {
  const input = responseSchema.parse(request.body);
  const runId = String(request.params.id);

  if (!(await canEditAssessmentResponses(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to update responses for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  await prisma.$transaction(
    input.responses.map((item) =>
      prisma.assessmentResponse.upsert({
        where: {
          assessmentRunId_questionId: {
            assessmentRunId: runId,
            questionId: item.questionId
          }
        },
        update: {
          selectedValue: item.selectedValue,
          selectedLabel: item.selectedLabel,
          comment: item.comment ?? null
        },
        create: {
          assessmentRunId: runId,
          questionId: item.questionId,
          selectedValue: item.selectedValue,
          selectedLabel: item.selectedLabel,
          comment: item.comment ?? null
        }
      })
    )
  );

  await prisma.assessmentRun.update({
    where: { id: request.params.id },
    data: {
      status:
        run.status === AssessmentRunStatus.DRAFT && input.responses.length > 0
          ? AssessmentRunStatus.IN_PROGRESS
          : run.status
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.responses_saved",
    summary: `${request.adminUser!.displayName} saved draft responses for ${run.title}`,
    metadata: {
      responseCount: input.responses.length
    }
  });

  response.json({ ok: true });
});

router.post("/assessment-runs/:id/aggregate-participant-responses", async (request, response) => {
  const runId = String(request.params.id);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to aggregate responses for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      participants: {
        include: {
          responses: true
        }
      },
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: {
                include: {
                  levels: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.responseMode !== AssessmentResponseMode.INDIVIDUAL_AGGREGATED) {
    return response.status(400).json({ message: "Only individual team-member runs can be aggregated." });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "This run is already submitted." });
  }

  if (run.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "Archived runs cannot be aggregated." });
  }

  if (run.participants.length === 0) {
    return response.status(400).json({ message: "Add participants before aggregating responses." });
  }

  const submittedParticipants = run.participants.filter((participant) => participant.status === AssessmentParticipantStatus.SUBMITTED);
  const requiredSubmittedParticipants = run.minimumParticipantResponses
    ? Math.min(run.minimumParticipantResponses, run.participants.length)
    : run.participants.length;

  if (submittedParticipants.length < requiredSubmittedParticipants) {
    return response.status(400).json({
      message: `Not enough participant submissions yet. ${submittedParticipants.length}/${requiredSubmittedParticipants} submitted.`
    });
  }

  const questions = run.templateVersion.domains.flatMap((domain) => domain.questions);
  const aggregatedResponses = questions.map((question) => {
    const responsesForQuestion = submittedParticipants.flatMap((participant) =>
      participant.responses.filter((participantResponse) => participantResponse.questionId === question.id)
    );

    if (responsesForQuestion.length < requiredSubmittedParticipants) {
      return null;
    }

    const averageScore = responsesForQuestion.reduce((sum, item) => sum + item.selectedValue, 0) / responsesForQuestion.length;
    const levels = [...question.levels].sort((a, b) => a.value - b.value);
    const nearestLevel =
      levels.reduce((nearest, level) =>
        Math.abs(level.value - averageScore) < Math.abs(nearest.value - averageScore) ? level : nearest
      , levels[0]) ?? {
        value: Math.round(averageScore),
        label: `Level ${Math.round(averageScore)}`
      };

    return {
      questionId: question.id,
      selectedValue: nearestLevel.value,
      selectedLabel: nearestLevel.label,
      averageScore,
      participantCount: responsesForQuestion.length
    };
  });

  const missingQuestionCount = aggregatedResponses.filter((item) => !item).length;
  if (missingQuestionCount > 0) {
    return response.status(400).json({
      message: `${missingQuestionCount} questions do not have enough submitted participant responses yet.`
    });
  }

  const completeAggregatedResponses = aggregatedResponses.filter((item): item is NonNullable<typeof item> => Boolean(item));
  const overallScore = completeAggregatedResponses.length
    ? Number(
        (
          completeAggregatedResponses.reduce((sum, item) => sum + item.averageScore, 0) / completeAggregatedResponses.length
        ).toFixed(2)
      )
    : null;

  const updated = await prisma.$transaction(async (transaction) => {
    await Promise.all(
      completeAggregatedResponses.map((item) =>
        transaction.assessmentResponse.upsert({
          where: {
            assessmentRunId_questionId: {
              assessmentRunId: runId,
              questionId: item.questionId
            }
          },
          update: {
            selectedValue: item.selectedValue,
            selectedLabel: item.selectedLabel,
            comment: `Aggregated from ${item.participantCount} submitted participant responses. Average score: ${item.averageScore.toFixed(2)}.`
          },
          create: {
            assessmentRunId: runId,
            questionId: item.questionId,
            selectedValue: item.selectedValue,
            selectedLabel: item.selectedLabel,
            comment: `Aggregated from ${item.participantCount} submitted participant responses. Average score: ${item.averageScore.toFixed(2)}.`
          }
        })
      )
    );

    return transaction.assessmentRun.update({
      where: { id: runId },
      data: {
        status: AssessmentRunStatus.SUBMITTED,
        submittedAt: new Date(),
        overallScore,
        submissionSummary: `Aggregated from ${submittedParticipants.length} submitted individual participant responses.`
      }
    });
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.participant_responses_aggregated",
    summary: `${user.displayName} aggregated individual participant responses for ${updated.title}`,
    metadata: {
      submittedParticipants: submittedParticipants.length,
      requiredSubmittedParticipants,
      questionCount: completeAggregatedResponses.length,
      overallScore
    }
  });

  if (updated.ownerUserId && updated.ownerUserId !== user.id) {
    await createRunNotification({
      runId,
      userId: updated.ownerUserId,
      type: "RUN_SUBMITTED",
      title: "Assessment submitted",
      message: `${updated.title} has been aggregated and submitted.`
    });
  }

  response.json({
    ...updated,
    aggregatedQuestions: completeAggregatedResponses.length,
    submittedParticipants: submittedParticipants.length,
    requiredSubmittedParticipants
  });
});

router.post("/assessment-runs/:id/participant-aggregation-insight", async (request, response) => {
  const runId = String(request.params.id);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to review participant aggregation insight for this run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      participants: {
        include: {
          responses: true
        }
      },
      templateVersion: {
        include: {
          domains: {
            include: {
              questions: true
            }
          }
        }
      },
      team: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.responseMode !== AssessmentResponseMode.INDIVIDUAL_AGGREGATED) {
    return response.status(400).json({ message: "Aggregation insight is only available for individual response runs." });
  }

  const submittedParticipants = run.participants.filter((participant) => participant.status === AssessmentParticipantStatus.SUBMITTED);
  if (!submittedParticipants.length) {
    return response.status(400).json({ message: "At least one submitted participant response is required for aggregation insight." });
  }

  const questions = run.templateVersion.domains.flatMap((domain) =>
    domain.questions.map((question) => ({
      domainTitle: domain.title,
      prompt: question.prompt,
      responses: submittedParticipants.flatMap((participant) =>
        participant.responses
          .filter((participantResponse) => participantResponse.questionId === question.id)
          .map((participantResponse) => ({
            participantName: participant.displayName,
            selectedValue: participantResponse.selectedValue,
            selectedLabel: participantResponse.selectedLabel,
            comment: participantResponse.comment
          }))
      )
    }))
  );

  const requiredSubmissions = run.minimumParticipantResponses
    ? Math.min(run.minimumParticipantResponses, run.participants.length)
    : run.participants.length;

  const insight = await generateAggregationInsight({
    title: run.title,
    teamName: run.team.name,
    periodLabel: run.periodLabel,
    requiredSubmissions,
    participants: run.participants.map((participant) => ({
      displayName: participant.displayName,
      status: participant.status,
      responseCount: participant.responses.length
    })),
    questions
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: runId,
    entityType: "ai_summary",
    entityId: runId,
    action: "assessment_run.ai_aggregation_insight_generated",
    summary: `${user.displayName} generated AI aggregation insight for ${run.title}`,
    metadata: {
      submittedParticipants: submittedParticipants.length,
      requiredSubmissions,
      disagreementLevel: insight.disagreementLevel
    }
  });

  response.json(insight);
});

router.post("/assessment-runs/:id/submit", async (request, response) => {
  const input = submitAssessmentSchema.parse(request.body ?? {});
  const runId = String(request.params.id);

  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to submit this run" });
  }
  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      responses: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  const overallScore = run.responses.length
    ? Number(
        (run.responses.reduce((sum, item) => sum + item.selectedValue, 0) / run.responses.length).toFixed(2)
      )
    : null;

  const updated = await prisma.assessmentRun.update({
    where: { id: runId },
    data: {
      status: AssessmentRunStatus.SUBMITTED,
      submittedAt: new Date(),
      overallScore,
      submissionSummary: input.submissionSummary?.trim() || null
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.submitted",
    summary: `${request.adminUser!.displayName} submitted assessment run ${updated.title}`
  });

  if (updated.ownerUserId && updated.ownerUserId !== request.adminUser!.id) {
    await createRunNotification({
      runId,
      userId: updated.ownerUserId,
      type: "RUN_SUBMITTED",
      title: "Assessment submitted",
      message: `${updated.title} has been submitted.`
    });
  }

  response.json(updated);
});

router.post("/assessment-runs/:id/copy", async (request, response) => {
  const sourceRunId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, sourceRunId))) {
    return response.status(403).json({ message: "You do not have permission to copy this run" });
  }

  const sourceRun = await prisma.assessmentRun.findUnique({
    where: { id: sourceRunId },
    include: {
      participants: true
    }
  });

  if (!sourceRun) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  const copiedRun = await prisma.$transaction(async (transaction) => {
    const created = await transaction.assessmentRun.create({
      data: {
        templateId: sourceRun.templateId,
        templateVersionId: sourceRun.templateVersionId,
        teamId: sourceRun.teamId,
        targetId: sourceRun.targetId,
        responseMode: sourceRun.responseMode,
        participantVisibility: sourceRun.participantVisibility,
        minimumParticipantResponses: sourceRun.minimumParticipantResponses,
        ownerUserId: sourceRun.ownerUserId,
        ownerName: sourceRun.ownerName,
        title: `Copy of ${sourceRun.title}`,
        dueDate: sourceRun.dueDate,
        periodType: sourceRun.periodType,
        periodLabel: sourceRun.periodLabel,
        periodBucket: sourceRun.periodBucket,
        periodSortDate: sourceRun.periodSortDate,
        year: sourceRun.year,
        quarter: sourceRun.quarter,
        startDate: sourceRun.startDate,
        endDate: sourceRun.endDate,
        referenceDate: sourceRun.referenceDate,
        status: AssessmentRunStatus.DRAFT,
        guestParticipationEnabled: sourceRun.guestParticipationEnabled,
        guestResultsVisible: sourceRun.guestResultsVisible
      }
    });

    for (const participant of sourceRun.participants) {
      await transaction.assessmentRunParticipant.create({
        data: {
          assessmentRunId: created.id,
          userId: participant.userId,
          externalContactId: participant.externalContactId,
          externalAccessToken: participant.externalContactId ? createShareToken() : null,
          externalAccessExpiresAt: participant.externalAccessExpiresAt,
          externalAccessRevoked: false,
          displayName: participant.displayName,
          email: participant.email,
          status: AssessmentParticipantStatus.INVITED
        }
      });
    }

    return created;
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: copiedRun.id,
    entityType: "assessment_run",
    entityId: copiedRun.id,
    action: "assessment_run.copied",
    summary: `${request.adminUser!.displayName} copied assessment run ${sourceRun.title}`,
    metadata: {
      sourceRunId
    }
  });

  response.status(201).json(copiedRun);
});

router.post("/assessment-runs/:id/archive", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to archive this run" });
  }
  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED && request.adminUser!.role !== UserRole.ADMIN) {
    return response.status(400).json({ message: "Submitted runs cannot be archived from this action." });
  }

  const updated = await prisma.assessmentRun.update({
    where: { id: runId },
    data: { status: AssessmentRunStatus.ARCHIVED }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.archived",
    summary: `${request.adminUser!.displayName} archived assessment run ${updated.title}`
  });

  response.json(updated);
});

router.post("/assessment-runs/:id/unarchive", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to restore this run" });
  }
  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      responses: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status !== AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "Only archived runs can be restored." });
  }

  const updated = await prisma.assessmentRun.update({
    where: { id: runId },
    data: {
      status: run.submittedAt
        ? AssessmentRunStatus.SUBMITTED
        : run.responses.length > 0
          ? AssessmentRunStatus.IN_PROGRESS
          : AssessmentRunStatus.DRAFT
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.restored",
    summary: `${request.adminUser!.displayName} restored assessment run ${updated.title}`
  });

  response.json(updated);
});

router.delete("/assessment-runs/:id", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to delete this run" });
  }
  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Submitted runs cannot be deleted." });
  }

  await prisma.assessmentRun.delete({
    where: { id: runId }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.deleted",
    summary: `${request.adminUser!.displayName} deleted assessment run ${run.title}`
  });

  response.status(204).send();
});

router.get("/assessment-runs/:id/results", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to these assessment results" });
  }
  const compareToRunId = typeof request.query.compareToRunId === "string" ? request.query.compareToRunId : undefined;
  const payload = await buildAssessmentResultsPayload(runId, compareToRunId);
  if (!payload) {
    return response.status(404).json({ message: "Assessment results not found" });
  }

  response.json(payload);
});

router.post("/assessment-runs/:id/ai-executive-summary", async (request, response) => {
  const runId = String(request.params.id);
  const forceRefresh = request.query.refresh === "1";
  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to these assessment results" });
  }

  const payload = await buildAssessmentResultsPayload(runId);
  if (!payload) {
    return response.status(404).json({ message: "Assessment results not found" });
  }

  if (payload.status !== AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "AI executive summary is only available for submitted runs" });
  }

  const summary = await getCachedOrGenerateResultsExecutiveSummary({
    results: payload,
    actorUserId: request.adminUser!.id,
    forceRefresh
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "ai_summary",
    entityId: runId,
    action: "assessment_results.ai_executive_summary_generated",
    summary: `${request.adminUser!.displayName} ${summary.cached ? "opened cached" : "generated"} an AI executive summary for ${payload.title}`,
    metadata: {
      cached: summary.cached,
      compareToRunId: payload.previousRun?.assessmentRunId ?? null
    }
  });

  response.json(summary);
});

router.post("/assessment-runs/:id/ai-ask", async (request, response) => {
  const runId = String(request.params.id);
  const input = resultsAiQuestionSchema.parse(request.body ?? {});
  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to these assessment results" });
  }

  const payload = await buildAssessmentResultsPayload(runId, input.compareToRunId);
  if (!payload) {
    return response.status(404).json({ message: "Assessment results not found" });
  }

  if (payload.status !== AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Ask this report is only available for submitted runs" });
  }

  const answer = await generateResultsQuestionAnswer({
    results: payload,
    question: input.question,
    history: input.history ?? []
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "ai_summary",
    entityId: runId,
    action: "assessment_results.ai_question_answered",
    summary: `${request.adminUser!.displayName} asked AI about assessment results for ${payload.title}`,
    metadata: {
      compareToRunId: payload.previousRun?.assessmentRunId ?? null,
      question: input.question
    }
  });

  response.json(answer);
});

router.get("/assessment-runs/:id/action-items", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const items = await prisma.assessmentActionItem.findMany({
    where: { assessmentRunId: runId },
    include: {
      createdByUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      }
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }]
  });

  response.json(items.map(serializeActionItem));
});

router.post("/assessment-runs/:id/action-items", async (request, response) => {
  const runId = String(request.params.id);
  const input = actionItemSchema.parse(request.body ?? {});

  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      title: true,
      status: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status !== AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Action items can only be created for submitted assessment results." });
  }

  const created = await prisma.assessmentActionItem.create({
    data: {
      assessmentRunId: runId,
      title: input.title,
      description: input.description?.trim() || null,
      domainTitle: input.domainTitle?.trim() || null,
      ownerName: input.ownerName?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: input.status ?? "OPEN",
      createdByUserId: request.adminUser!.id
    },
    include: {
      createdByUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_action_item",
    entityId: created.id,
    action: "assessment_action_item.created",
    summary: `${request.adminUser!.displayName} created action item ${created.title} for ${run.title}`
  });

  response.status(201).json(serializeActionItem(created));
});

router.put("/assessment-runs/:id/action-items/:actionItemId", async (request, response) => {
  const runId = String(request.params.id);
  const input = actionItemSchema.parse(request.body ?? {});

  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const existing = await prisma.assessmentActionItem.findFirst({
    where: {
      id: String(request.params.actionItemId),
      assessmentRunId: runId
    }
  });

  if (!existing) {
    return response.status(404).json({ message: "Action item not found" });
  }

  const updated = await prisma.assessmentActionItem.update({
    where: { id: existing.id },
    data: {
      title: input.title,
      description: input.description?.trim() || null,
      domainTitle: input.domainTitle?.trim() || null,
      ownerName: input.ownerName?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: input.status ?? existing.status
    },
    include: {
      createdByUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_action_item",
    entityId: updated.id,
    action: "assessment_action_item.updated",
    summary: `${request.adminUser!.displayName} updated action item ${updated.title}`
  });

  response.json(serializeActionItem(updated));
});

router.delete("/assessment-runs/:id/action-items/:actionItemId", async (request, response) => {
  const runId = String(request.params.id);

  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const existing = await prisma.assessmentActionItem.findFirst({
    where: {
      id: String(request.params.actionItemId),
      assessmentRunId: runId
    }
  });

  if (!existing) {
    return response.status(404).json({ message: "Action item not found" });
  }

  await prisma.assessmentActionItem.delete({
    where: { id: existing.id }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_action_item",
    entityId: existing.id,
    action: "assessment_action_item.deleted",
    summary: `${request.adminUser!.displayName} deleted action item ${existing.title}`
  });

  response.status(204).send();
});

router.get("/assessment-runs/:id/share-links", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const links = await prisma.reportShareLink.findMany({
    where: {
      assessmentRunId: runId
    },
    include: {
      createdByUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      }
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  response.json(
    links.map((link) => ({
      id: link.id,
      token: link.token,
      shareUrl: `/shared-results/${link.token}`,
      isRevoked: link.isRevoked,
      expiresAt: link.expiresAt,
      createdAt: link.createdAt,
      createdByUser: link.createdByUser
    }))
  );
});

router.get("/assessment-runs/:id/guest-links", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canViewGuestParticipation(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to guest links for this assessment" });
  }

  const links = await prisma.guestAssessmentLink.findMany({
    where: {
      assessmentRunId: runId
    },
    orderBy: {
      createdAt: "desc"
    }
  });

  response.json(links.map(serializeGuestAssessmentLink));
});

router.get("/assessment-runs/:id/guest-participation-settings", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to guest participation settings for this assessment" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    select: {
      guestParticipationEnabled: true,
      guestResultsVisible: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  response.json({
    guestParticipationEnabled: run.guestParticipationEnabled,
    guestResultsVisible: run.guestResultsVisible
  });
});

router.put("/assessment-runs/:id/guest-participation-settings", async (request, response) => {
  const input = guestParticipationSettingsSchema.parse(request.body ?? {});
  const runId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to update guest participation settings for this assessment" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  const updated = await prisma.assessmentRun.update({
    where: { id: runId },
    data: {
      guestParticipationEnabled: input.guestParticipationEnabled,
      guestResultsVisible: input.guestResultsVisible
    },
    select: {
      guestParticipationEnabled: true,
      guestResultsVisible: true,
      title: true
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "assessment_run",
    entityId: runId,
    action: "assessment_run.guest_settings_updated",
    summary: `${request.adminUser!.displayName} updated guest participation settings for ${updated.title}`,
    metadata: {
      guestParticipationEnabled: updated.guestParticipationEnabled,
      guestResultsVisible: updated.guestResultsVisible
    }
  });

  response.json({
    guestParticipationEnabled: updated.guestParticipationEnabled,
    guestResultsVisible: updated.guestResultsVisible
  });
});

router.post("/assessment-runs/:id/guest-links", async (request, response) => {
  const input = guestAssessmentLinkSchema.parse(request.body ?? {});
  const runId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to create guest links for this assessment" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (!run.guestParticipationEnabled) {
    return response.status(400).json({ message: "Enable guest participation for this assessment before creating guest links" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED || run.status === AssessmentRunStatus.ARCHIVED) {
    return response.status(400).json({ message: "Guest links can only be created for active assessments" });
  }

  const externalContact = input.externalContactId
    ? await prisma.externalContact.findUnique({
        where: { id: input.externalContactId }
      })
    : null;

  if (input.externalContactId && !externalContact) {
    return response.status(404).json({ message: "External contact not found" });
  }

  const created = await prisma.guestAssessmentLink.create({
    data: {
      assessmentRunId: runId,
      createdByUserId: request.adminUser!.id,
      externalContactId: externalContact?.id ?? null,
      inviteLabel: input.inviteLabel?.trim() || externalContact?.organization || externalContact?.displayName || null,
      guestDisplayName: externalContact?.displayName ?? null,
      guestEmail: externalContact?.email ?? null,
      token: createShareToken(),
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "guest_assessment_link",
    entityId: created.id,
    action: "assessment_run.guest_link_created",
    summary: `${request.adminUser!.displayName} created a guest assessment link for ${run.title}`,
    metadata: {
      inviteLabel: created.inviteLabel,
      externalContactId: created.externalContactId,
      expiresAt: created.expiresAt
    }
  });

  response.status(201).json(serializeGuestAssessmentLink(created));
});

router.post("/assessment-runs/:id/guest-links/:guestLinkId/revoke", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canManageAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have permission to revoke guest links for this assessment" });
  }

  const link = await prisma.guestAssessmentLink.findFirst({
    where: {
      id: String(request.params.guestLinkId),
      assessmentRunId: runId
    }
  });

  if (!link) {
    return response.status(404).json({ message: "Guest link not found" });
  }

  const revoked = await prisma.guestAssessmentLink.update({
    where: { id: link.id },
    data: {
      isRevoked: true
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "guest_assessment_link",
    entityId: revoked.id,
    action: "assessment_run.guest_link_revoked",
    summary: `${request.adminUser!.displayName} revoked a guest assessment link`
  });

  response.json(serializeGuestAssessmentLink(revoked));
});

router.post("/assessment-runs/:id/guest-links/:guestLinkId/send-invite-email", async (request, response) => {
  const runId = String(request.params.id);
  const user = request.adminUser!;

  if (!(await canManageAssessmentRun(user, runId))) {
    return response.status(403).json({ message: "You do not have permission to email guest links for this assessment" });
  }

  const link = await prisma.guestAssessmentLink.findFirst({
    where: {
      id: String(request.params.guestLinkId),
      assessmentRunId: runId
    },
    include: {
      assessmentRun: {
        include: {
          team: true,
          templateVersion: true
        }
      },
      externalContact: true
    }
  });

  if (!link || link.isRevoked || link.submittedAt) {
    return response.status(404).json({ message: "Active guest link not found" });
  }

  const recipientEmail = link.guestEmail || link.externalContact?.email;
  if (!recipientEmail) {
    return response.status(400).json({ message: "This guest link does not have an email address." });
  }

  const guestUrl = buildApplicationUrl(`/guest-assessments/${link.token}`);
  await sendTrackedEmail({
    type: "guest_invite",
    to: recipientEmail,
    recipientName: link.guestDisplayName || link.externalContact?.displayName || null,
    subject: `Guest assessment invitation: ${link.assessmentRun.title}`,
    body: [
      `Hello ${link.guestDisplayName || link.externalContact?.displayName || "Guest"},`,
      "",
      `${user.displayName} invited you to participate in an assessment.`,
      "",
      `Assessment: ${link.assessmentRun.title}`,
      `Team: ${link.assessmentRun.team.name}`,
      `Template: ${link.assessmentRun.templateVersion.name} v${link.assessmentRun.templateVersion.versionNumber}`,
      link.expiresAt ? `Expires: ${link.expiresAt.toISOString()}` : "Expires: no expiry configured",
      "",
      `Open guest assessment: ${guestUrl}`
    ].join("\n"),
    actorUserId: user.id,
    assessmentRunId: runId,
    guestLinkId: link.id
  });

  await logAudit({
    actorUserId: user.id,
    assessmentRunId: runId,
    entityType: "guest_assessment_link",
    entityId: link.id,
    action: "assessment_run.guest_invite_email_sent",
    summary: `${user.displayName} sent a guest assessment invite email`
  });

  response.json({ ok: true });
});

router.post("/assessment-runs/:id/share-links", async (request, response) => {
  const runId = String(request.params.id);
  const input = reportShareSchema.parse(request.body ?? {});

  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      team: true,
      templateVersion: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status !== AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Only submitted assessment results can be shared" });
  }

  const created = await prisma.reportShareLink.create({
    data: {
      token: createShareToken(),
      assessmentRunId: runId,
      createdByUserId: request.adminUser!.id,
      expiresAt: input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "report_share",
    entityId: created.id,
    action: "report.share_created",
    summary: `${request.adminUser!.displayName} created a share link for ${run.title}`
  });

  response.status(201).json({
    id: created.id,
    token: created.token,
    shareUrl: `/shared-results/${created.token}`,
    isRevoked: created.isRevoked,
    expiresAt: created.expiresAt,
    createdAt: created.createdAt
  });
});

router.post("/assessment-runs/:id/send-report-email", async (request, response) => {
  const runId = String(request.params.id);
  const input = sendReportEmailSchema.parse(request.body ?? {});

  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const settings = await getReportEmailDeliverySettings();
  if (!settings.available) {
    return response.status(400).json({ message: "Submitted report email delivery is currently unavailable" });
  }

  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: {
      team: true,
      templateVersion: true
    }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status !== AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Only submitted assessment results can be emailed" });
  }

  const token = createShareToken();
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000) : null;
  const shareUrl = buildShareUrl(token);

  await sendTrackedEmail({
    type: "submitted_report",
    to: input.recipientEmail,
    recipientName: input.recipientName?.trim() || null,
    subject: `Submitted assessment report: ${run.title}`,
    body: buildReportEmailBody({
      runTitle: run.title,
      teamName: run.team.name,
      periodLabel: run.periodLabel,
      templateName: run.templateVersion.name,
      overallScore: run.overallScore,
      senderName: request.adminUser!.displayName,
      shareUrl,
      note: input.note?.trim() || "",
      expiresAt
    }),
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId
  });

  const created = await prisma.reportShareLink.create({
    data: {
      token,
      assessmentRunId: runId,
      createdByUserId: request.adminUser!.id,
      expiresAt
    },
    include: {
      createdByUser: {
        select: {
          id: true,
          displayName: true,
          username: true
        }
      }
    }
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "report_share",
    entityId: created.id,
    action: "report.share_email_sent",
    summary: `${request.adminUser!.displayName} sent a submitted report email for ${run.title}`,
    metadata: {
      recipientEmail: input.recipientEmail,
      recipientName: input.recipientName?.trim() || null,
      expiresAt,
      noteIncluded: Boolean(input.note?.trim())
    }
  });

  response.status(201).json({
    ok: true,
    shareLink: {
      id: created.id,
      token: created.token,
      shareUrl: `/shared-results/${created.token}`,
      isRevoked: created.isRevoked,
      expiresAt: created.expiresAt,
      createdAt: created.createdAt,
      createdByUser: created.createdByUser
    }
  });
});

router.post("/assessment-runs/:id/share-links/:shareId/revoke", async (request, response) => {
  const runId = String(request.params.id);
  if (!(await canAccessAssessmentRun(request.adminUser!, runId))) {
    return response.status(403).json({ message: "You do not have access to this assessment run" });
  }

  const updated = await prisma.reportShareLink.updateMany({
    where: {
      id: String(request.params.shareId),
      assessmentRunId: runId
    },
    data: {
      isRevoked: true
    }
  });

  if (!updated.count) {
    return response.status(404).json({ message: "Share link not found" });
  }

  await logAudit({
    actorUserId: request.adminUser!.id,
    assessmentRunId: runId,
    entityType: "report_share",
    entityId: String(request.params.shareId),
    action: "report.share_revoked",
    summary: `${request.adminUser!.displayName} revoked a report share link`
  });

  response.json({ ok: true });
});

router.get("/reports/latest-by-team", async (request, response) => {
  const user = request.adminUser!;
  const teamIds =
    user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER ? [] : await getUserTeamIds(user.id);
  const latestRuns = (await getLatestSubmittedRunsByTeam()).filter(
    (run) =>
      user.role === UserRole.ADMIN
      || user.role === UserRole.TEMPLATE_MANAGER
      || run.ownerUserId === user.id
      || teamIds.includes(run.teamId)
  );
  const latestRunsByTeamTemplate = (await getLatestSubmittedRunsByTeamTemplate()).filter(
    (run) =>
      user.role === UserRole.ADMIN
      || user.role === UserRole.TEMPLATE_MANAGER
      || run.ownerUserId === user.id
      || teamIds.includes(run.teamId)
  );

  const serializeReportRun = (run: (typeof latestRuns)[number]) => {
    const serialized = serializeAssessmentRun(run);
    const sortedDomains = [...serialized.domains]
      .filter((domain) => typeof domain.averageScore === "number")
      .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));

    return {
      assessmentRunId: serialized.id,
      title: serialized.title,
      teamId: serialized.team.id,
      teamName: serialized.team.name,
      teamGroupId: serialized.team.group?.id ?? null,
      teamGroupName: serialized.team.group?.name ?? null,
      templateId: run.templateId,
      templateName: serialized.templateVersion.name,
      templateCategory: serialized.templateVersion.category ?? null,
      periodLabel: serialized.periodLabel,
      submittedAt: serialized.submittedAt,
      overallScore: serialized.overallScore,
      strongestDomain: sortedDomains[0]
        ? {
            title: sortedDomains[0].title,
            score: sortedDomains[0].averageScore
          }
        : null,
      weakestDomain: sortedDomains.at(-1)
        ? {
            title: sortedDomains.at(-1)?.title ?? "",
            score: sortedDomains.at(-1)?.averageScore ?? null
          }
        : null,
      domains: serialized.domains.map((domain) => ({
        title: domain.title,
        averageScore: domain.averageScore,
        questions: domain.questions.map((question) => ({
          prompt: question.prompt,
          selectedValue: question.response?.selectedValue ?? null,
          selectedLabel: question.response?.selectedLabel ?? null
        }))
      }))
    };
  };

  const serializedRuns = latestRuns.map(serializeReportRun);
  const serializedRunsByTeamTemplate = latestRunsByTeamTemplate.map(serializeReportRun);

  const scoredRuns = serializedRuns.filter((item) => typeof item.overallScore === "number");
  const domainCounts = new Map<string, { title: string; count: number; totalScore: number; scoredCount: number }>();
  const weakestDomainCounts = new Map<string, number>();

  for (const run of serializedRuns) {
    if (run.weakestDomain?.title) {
      weakestDomainCounts.set(run.weakestDomain.title, (weakestDomainCounts.get(run.weakestDomain.title) ?? 0) + 1);
    }

    for (const domain of run.domains) {
      const current = domainCounts.get(domain.title) ?? {
        title: domain.title,
        count: 0,
        totalScore: 0,
        scoredCount: 0
      };
      current.count += 1;
      if (typeof domain.averageScore === "number") {
        current.totalScore += domain.averageScore;
        current.scoredCount += 1;
      }
      domainCounts.set(domain.title, current);
    }
  }

  const averageLatestScore = scoredRuns.length
    ? Number((scoredRuns.reduce((sum, run) => sum + (run.overallScore ?? 0), 0) / scoredRuns.length).toFixed(2))
    : null;

  const highestTeam = [...scoredRuns].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))[0] ?? null;
  const lowestTeam = [...scoredRuns].sort((a, b) => (a.overallScore ?? 0) - (b.overallScore ?? 0))[0] ?? null;
  const mostCommonWeakestDomain = [...weakestDomainCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

  response.json({
    selectionRule: {
      latestByTeam: "For each team, choose the most recent SUBMITTED run ordered by periodSortDate desc, then createdAt desc.",
      latestByTeamTemplate:
        "For each team + template, choose the most recent SUBMITTED run ordered by periodSortDate desc, then createdAt desc."
    },
    summary: {
      teamsWithSubmittedRuns: serializedRuns.length,
      averageLatestScore,
      highestTeam: highestTeam
        ? {
            teamName: highestTeam.teamName,
            overallScore: highestTeam.overallScore
          }
        : null,
      lowestTeam: lowestTeam
        ? {
            teamName: lowestTeam.teamName,
            overallScore: lowestTeam.overallScore
          }
        : null,
      mostCommonWeakestDomain: mostCommonWeakestDomain
        ? {
            title: mostCommonWeakestDomain[0],
            teamCount: mostCommonWeakestDomain[1]
          }
        : null
    },
    latestByTeam: serializedRuns,
    latestByTeamTemplate: serializedRunsByTeamTemplate,
    domainSnapshot: [...domainCounts.values()]
      .map((domain) => ({
        title: domain.title,
        averageScore: domain.scoredCount ? Number((domain.totalScore / domain.scoredCount).toFixed(2)) : null,
        teamCount: domain.count
      }))
      .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0))
  });
});

router.post("/reports/ai-brief", async (request, response) => {
  const input = reportsAiBriefSchema.parse(request.body ?? {});
  const forceRefresh = request.query.refresh === "1";
  const brief = await getCachedOrGenerateReportsAiBrief({
    input,
    actorUserId: request.adminUser!.id,
    forceRefresh
  });

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "reports",
    action: "reports.ai_brief_generated",
    summary: `${request.adminUser!.displayName} ${brief.cached ? "opened cached" : "generated"} an AI brief for the reports workspace`,
    metadata: {
      cached: brief.cached,
      viewMode: input.viewMode,
      rowsCount: input.summary.rowsCount,
      selectedDomainLabel: input.selectedDomainLabel,
      selectedQuestionLabel: input.selectedQuestionLabel
    }
  });

  response.json(brief);
});

router.post("/templates/ai/question-assist", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiQuestionAssistSchema.parse(request.body ?? {});
  const suggestion = await generateQuestionAssist(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-question",
    action: "templates.ai_question_assist_generated",
    summary: `${request.adminUser!.displayName} generated AI question assistance in template authoring`,
    metadata: {
      templateName: input.templateName,
      domainTitle: input.domainTitle
    }
  });

  response.json(suggestion);
});

router.post("/templates/ai/scaffold", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiScaffoldSchema.parse(request.body ?? {});
  const scaffold = await generateTemplateScaffold(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-scaffold",
    action: "templates.ai_scaffold_generated",
    summary: `${request.adminUser!.displayName} generated an AI template scaffold`,
    metadata: {
      category: input.category
    }
  });

  response.json(scaffold);
});

router.post("/templates/ai/domain-suggestions", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiDomainSuggestionsSchema.parse(request.body ?? {});
  const result = await generateTemplateDomains(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-domains",
    action: "templates.ai_domain_suggestions_generated",
    summary: `${request.adminUser!.displayName} generated AI domain suggestions for template authoring`,
    metadata: {
      templateName: input.templateName
    }
  });

  response.json(result);
});

router.post("/templates/ai/single-domain", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiSingleDomainSchema.parse(request.body ?? {});
  const result = await generateSingleTemplateDomain(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-single-domain",
    action: "templates.ai_single_domain_generated",
    summary: `${request.adminUser!.displayName} generated a replacement AI domain for template authoring`,
    metadata: {
      templateName: input.templateName
    }
  });

  response.json(result);
});

router.post("/templates/ai/single-question", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiSingleQuestionSchema.parse(request.body ?? {});
  const result = await generateSingleDomainQuestion(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-single-question",
    action: "templates.ai_single_question_generated",
    summary: `${request.adminUser!.displayName} generated a replacement AI question for template authoring`,
    metadata: {
      templateName: input.templateName,
      domainTitle: input.domainTitle
    }
  });

  response.json(result);
});

router.post("/templates/ai/domain-questions", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiDomainQuestionsSchema.parse(request.body ?? {});
  const result = await generateDomainQuestions(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-domain-questions",
    action: "templates.ai_domain_questions_generated",
    summary: `${request.adminUser!.displayName} generated AI questions for a template domain`,
    metadata: {
      templateName: input.templateName,
      domainTitle: input.domainTitle
    }
  });

  response.json(result);
});

router.post("/templates/ai/full-draft", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiFullDraftSchema.parse(request.body ?? {});
  const result = await generateFullTemplateDraft(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-full-draft",
    action: "templates.ai_full_draft_generated",
    summary: `${request.adminUser!.displayName} generated a one-shot AI template draft`,
    metadata: {
      category: input.category,
      domainCount: result.domains.length
    }
  });

  response.json(result);
});

router.post("/templates/ai/chat-draft", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiChatDraftSchema.parse(request.body ?? {});
  const result = await generateChatTemplateDraft(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-chat-draft",
    action: "templates.ai_chat_draft_generated",
    summary: `${request.adminUser!.displayName} used AI chat-based template creation`,
    metadata: {
      category: input.category,
      status: result.status,
      domainCount: result.draft?.domains.length ?? 0
    }
  });

  response.json(result);
});

router.post("/templates/ai/domain-assist", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiDomainAssistSchema.parse(request.body ?? {});
  const suggestion = await generateDomainAssist(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-domain",
    action: "templates.ai_domain_assist_generated",
    summary: `${request.adminUser!.displayName} generated AI domain assistance in template authoring`,
    metadata: {
      templateName: input.templateName,
      domainTitle: input.domainTitle
    }
  });

  response.json(suggestion);
});

router.post("/templates/ai/consistency-review", requireRole(UserRole.ADMIN, UserRole.TEMPLATE_MANAGER), async (request, response) => {
  const input = templateAiConsistencyReviewSchema.parse(request.body ?? {});
  const review = await generateTemplateConsistencyReview(input);

  await logAudit({
    actorUserId: request.adminUser!.id,
    entityType: "ai_summary",
    entityId: "template-review",
    action: "templates.ai_consistency_review_generated",
    summary: `${request.adminUser!.displayName} generated an AI consistency review for template authoring`,
    metadata: {
      templateName: input.templateName,
      domainCount: input.domains.length
    }
  });

  response.json(review);
});

router.get("/dashboard/summary", async (request, response) => {
  const user = request.adminUser!;
  const teamIds =
    user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER ? [] : await getUserTeamIds(user.id);
  const assessmentWhere =
    user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
      ? undefined
      : user.role === UserRole.VIEWER
        ? {
            status: AssessmentRunStatus.SUBMITTED,
            OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
          }
        : {
            OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
          };
  const [templates, runs, submittedRuns, teams] = await Promise.all([
    prisma.assessmentTemplate.count(),
    prisma.assessmentRun.count({ where: assessmentWhere }),
    prisma.assessmentRun.count({
      where: {
        ...(assessmentWhere ?? {}),
        status: AssessmentRunStatus.SUBMITTED
      }
    }),
    prisma.team.count({
      where:
        user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
          ? undefined
          : {
              memberships: {
                some: {
                  userId: user.id
                }
              }
            }
    })
  ]);

  const latestRuns = await prisma.assessmentRun.findMany({
    where: assessmentWhere,
    include: {
      team: true,
      templateVersion: true
    },
    take: 5,
    orderBy: {
      updatedAt: "desc"
    }
  });
  const activeWorkRuns = await prisma.assessmentRun.findMany({
    where: {
      ...(assessmentWhere ?? {}),
      status: {
        in: [AssessmentRunStatus.DRAFT, AssessmentRunStatus.IN_PROGRESS]
      }
    },
    include: {
      team: true,
      templateVersion: true
    },
    orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }]
  });

  const latestSubmittedPerTeamSource = await prisma.assessmentRun.findMany({
    where: {
      ...(assessmentWhere ?? {}),
      status: AssessmentRunStatus.SUBMITTED
    },
    include: {
      team: true,
      templateVersion: true
    },
    orderBy: [{ periodSortDate: "desc" }, { createdAt: "desc" }]
  });

  const latestSubmittedPerTeam = new Map<
    string,
    {
      id: string;
      title: string;
      teamName: string;
      templateName: string;
      periodLabel: string;
      submittedAt: Date | null;
      overallScore: number | null;
      guestParticipationEnabled: boolean;
    }
  >();

  for (const run of latestSubmittedPerTeamSource) {
    if (latestSubmittedPerTeam.has(run.teamId)) {
      continue;
    }

    latestSubmittedPerTeam.set(run.teamId, {
      id: run.id,
      title: run.title,
      teamName: run.team.name,
      templateName: run.templateVersion.name,
      periodLabel: run.periodLabel,
      submittedAt: run.submittedAt,
      overallScore: run.overallScore,
      guestParticipationEnabled: run.guestParticipationEnabled
    });
  }

  const prioritizedActiveWork = [...activeWorkRuns].sort((a, b) => {
    const dueA = getDuePriority(a.dueDate);
    const dueB = getDuePriority(b.dueDate);
    if (dueA.rank !== dueB.rank) {
      return dueA.rank - dueB.rank;
    }

    const dueDateA = a.dueDate ? a.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    const dueDateB = b.dueDate ? b.dueDate.getTime() : Number.MAX_SAFE_INTEGER;
    if (dueDateA !== dueDateB) {
      return dueDateA - dueDateB;
    }

    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
  const assignedWorkRuns = prioritizedActiveWork.filter((item) => item.ownerUserId === user.id);
  const teamQueueRuns = prioritizedActiveWork.filter((item) => item.ownerUserId !== user.id);
  const overdueCount = prioritizedActiveWork.filter((item) => getDuePriority(item.dueDate).label === "overdue").length;
  const dueSoonCount = prioritizedActiveWork.filter((item) => getDuePriority(item.dueDate).label === "due_soon").length;
  const guestEnabledCount = prioritizedActiveWork.filter((item) => item.guestParticipationEnabled).length;

  response.json({
    currentUser: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    },
    templates,
    runs,
    submittedRuns,
    draftRuns: runs - submittedRuns,
    teams,
    latestRuns: latestRuns.map((item) => ({
      id: item.id,
      title: item.title,
      periodLabel: item.periodLabel,
      status: item.status,
      teamName: item.team.name,
      templateName: item.templateVersion.name,
      updatedAt: item.updatedAt,
      guestParticipationEnabled: item.guestParticipationEnabled
    })),
    latestSubmittedByTeam: Array.from(latestSubmittedPerTeam.values()),
    myWork: {
      assignedCount: assignedWorkRuns.length,
      teamCount: teamQueueRuns.length,
      overdueCount,
      dueSoonCount,
      guestEnabledCount,
      focusRuns: prioritizedActiveWork
        .slice(0, 5)
        .map((item) => ({
          id: item.id,
          title: item.title,
          teamName: item.team.name,
          dueDate: item.dueDate,
          status: item.status,
          guestParticipationEnabled: item.guestParticipationEnabled,
          ownership: item.ownerUserId === user.id ? "assigned" : "team"
        })),
      assignedRuns: assignedWorkRuns
        .slice(0, 3)
        .map((item) => ({
          id: item.id,
          title: item.title,
          teamName: item.team.name,
          dueDate: item.dueDate,
          status: item.status,
          guestParticipationEnabled: item.guestParticipationEnabled
        })),
      teamRuns: teamQueueRuns
        .slice(0, 3)
        .map((item) => ({
          id: item.id,
          title: item.title,
          teamName: item.team.name,
          dueDate: item.dueDate,
          status: item.status,
          guestParticipationEnabled: item.guestParticipationEnabled
        }))
    }
  });
});

router.get("/dashboard/trends", async (request, response) => {
  const user = request.adminUser!;
  const teamIds =
    user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER ? [] : await getUserTeamIds(user.id);
  const submittedRuns = await prisma.assessmentRun.findMany({
    where:
      user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
        ? { status: AssessmentRunStatus.SUBMITTED }
        : {
            status: AssessmentRunStatus.SUBMITTED,
            OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
          },
    orderBy: [{ periodSortDate: "asc" }, { createdAt: "asc" }]
  });

  const buckets = new Map<string, { periodLabel: string; scores: number[] }>();

  for (const run of submittedRuns) {
    if (typeof run.overallScore !== "number") {
      continue;
    }

    if (!buckets.has(run.periodLabel)) {
      buckets.set(run.periodLabel, { periodLabel: run.periodLabel, scores: [] });
    }

    buckets.get(run.periodLabel)?.scores.push(run.overallScore);
  }

  response.json(
    Array.from(buckets.values()).map((item) => ({
      periodLabel: item.periodLabel,
      averageScore: Number((item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length).toFixed(2))
    }))
  );
});

router.get("/dashboard/comparison", async (request, response) => {
  const user = request.adminUser!;
  const teamIds =
    user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER ? [] : await getUserTeamIds(user.id);
  const latestSubmitted = await prisma.assessmentRun.findMany({
    where:
      user.role === UserRole.ADMIN || user.role === UserRole.TEMPLATE_MANAGER
        ? { status: AssessmentRunStatus.SUBMITTED }
        : {
            status: AssessmentRunStatus.SUBMITTED,
            OR: [{ ownerUserId: user.id }, { teamId: { in: teamIds } }]
          },
    include: {
      team: true
    },
    orderBy: [{ periodSortDate: "desc" }, { createdAt: "desc" }]
  });

  const perTeam = new Map<string, { teamName: string; overallScore: number; periodLabel: string }>();

  for (const run of latestSubmitted) {
    if (typeof run.overallScore !== "number" || perTeam.has(run.teamId)) {
      continue;
    }

    perTeam.set(run.teamId, {
      teamName: run.team.name,
      overallScore: run.overallScore,
      periodLabel: run.periodLabel
    });
  }

  response.json(Array.from(perTeam.values()));
});

export default router;

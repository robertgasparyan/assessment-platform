import { AssessmentPeriodType, AssessmentRunStatus, Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "./db.js";
import { createSessionToken, hashPassword, verifyPassword } from "./lib/auth.js";
import { requireAdminAuth, buildSessionExpiry } from "./lib/request-auth.js";
import { serializeAssessmentRun, serializeTemplateVersion } from "./lib/serializers.js";
import { createTemplate, deleteTemplate, updateTemplate } from "./lib/template-service.js";

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
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().datetime().optional(),
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
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().datetime().optional(),
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
  ownerName: z.string().trim().min(1).optional(),
  dueDate: z.string().datetime().optional(),
  allowDuplicate: z.boolean().optional(),
  periodType: z.literal("POINT_IN_TIME"),
  periodLabel: z.string().optional(),
  referenceDate: z.string().datetime()
});

const assessmentRunSchema = z
  .union([quarterAssessmentRunSchema, customRangeAssessmentRunSchema, pointInTimeAssessmentRunSchema])
  .superRefine((input, context) => {
    if (input.periodType === "CUSTOM_RANGE" && new Date(input.endDate) < new Date(input.startDate)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End date must be on or after start date",
        path: ["endDate"]
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

const updateAssessmentRunSchema = z.object({
  title: z.string().min(2),
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
  description: z.string().optional()
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
      team: true,
      templateVersion: true
    },
    orderBy: [{ updatedAt: "desc" }]
  });
}

function roundDelta(value: number | null) {
  return typeof value === "number" ? Number(value.toFixed(2)) : null;
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
      team: true,
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
      team: true,
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

router.post("/auth/login", async (request, response) => {
  const input = loginSchema.parse(request.body);
  const user = await prisma.adminUser.findUnique({
    where: { username: input.username }
  });

  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    return response.status(401).json({ message: "Invalid username or password" });
  }

  const sessionToken = createSessionToken();
  const sessionExpiresAt = buildSessionExpiry();

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      sessionToken,
      sessionExpiresAt
    }
  });

  response.json({
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username
    },
    sessionExpiresAt
  });
});

router.use(requireAdminAuth);

router.get("/auth/me", async (request, response) => {
  response.json({
    user: request.adminUser
  });
});

router.post("/auth/logout", async (request, response) => {
  if (!request.adminUser) {
    return response.status(401).json({ message: "Authentication required" });
  }

  await prisma.adminUser.update({
    where: { id: request.adminUser.id },
    data: {
      sessionToken: null,
      sessionExpiresAt: null
    }
  });

  response.json({ ok: true });
});

router.post("/auth/change-password", async (request, response) => {
  const input = changePasswordSchema.parse(request.body);

  if (!request.adminUser) {
    return response.status(401).json({ message: "Authentication required" });
  }

  const user = await prisma.adminUser.findUnique({
    where: { id: request.adminUser.id }
  });

  if (!user || !verifyPassword(input.currentPassword, user.passwordHash)) {
    return response.status(400).json({ message: "Current password is incorrect" });
  }

  const updatedPasswordHash = hashPassword(input.newPassword);
  const sessionToken = createSessionToken();
  const sessionExpiresAt = buildSessionExpiry();

  await prisma.adminUser.update({
    where: { id: user.id },
    data: {
      passwordHash: updatedPasswordHash,
      sessionToken,
      sessionExpiresAt
    }
  });

  response.json({
    token: sessionToken,
    user: {
      id: user.id,
      username: user.username
    },
    sessionExpiresAt
  });
});

router.get("/teams", async (_request, response) => {
  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" }
  });
  response.json(teams);
});

router.post("/teams", async (request, response) => {
  const input = teamSchema.parse(request.body);
  const created = await prisma.team.create({
    data: {
      name: input.name,
      description: input.description
    }
  });
  response.status(201).json(created);
});

router.put("/teams/:id", async (request, response) => {
  const input = teamSchema.parse(request.body);
  const updated = await prisma.team.update({
    where: { id: request.params.id },
    data: {
      name: input.name,
      description: input.description
    }
  });
  response.json(updated);
});

router.delete("/teams/:id", async (request, response) => {
  await prisma.team.delete({
    where: { id: request.params.id }
  });
  response.status(204).send();
});

router.get("/categories", async (_request, response) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" }
  });
  response.json(categories);
});

router.post("/categories", async (request, response) => {
  const input = categorySchema.parse(request.body);
  const created = await prisma.category.create({
    data: {
      name: input.name,
      description: input.description
    }
  });
  response.status(201).json(created);
});

router.put("/categories/:id", async (request, response) => {
  const input = categorySchema.parse(request.body);
  const updated = await prisma.category.update({
    where: { id: request.params.id },
    data: {
      name: input.name,
      description: input.description
    }
  });
  response.json(updated);
});

router.delete("/categories/:id", async (request, response) => {
  await prisma.category.delete({
    where: { id: request.params.id }
  });
  response.status(204).send();
});

router.get("/template-drafts", async (_request, response) => {
  const drafts = await prisma.templateDraft.findMany({
    orderBy: {
      updatedAt: "desc"
    }
  });

  response.json(drafts.map(serializeTemplateDraft));
});

router.get("/template-drafts/:id", async (request, response) => {
  const draft = await prisma.templateDraft.findUnique({
    where: { id: request.params.id }
  });

  if (!draft) {
    return response.status(404).json({ message: "Template draft not found" });
  }

  response.json(serializeTemplateDraft(draft));
});

router.post("/template-drafts", async (request, response) => {
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

router.put("/template-drafts/:id", async (request, response) => {
  const input = templateDraftSchema.parse(request.body);
  const updated = await prisma.templateDraft.update({
    where: { id: request.params.id },
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

router.delete("/template-drafts/:id", async (request, response) => {
  await prisma.templateDraft.delete({
    where: { id: request.params.id }
  });

  response.status(204).send();
});

router.get("/question-library", async (_request, response) => {
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

router.post("/question-library", async (request, response) => {
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

router.put("/question-library/:id", async (request, response) => {
  const input = questionLibrarySchema.parse(request.body);
  const updated = await prisma.questionLibraryItem.update({
    where: { id: request.params.id },
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

router.delete("/question-library/:id", async (request, response) => {
  await prisma.questionLibraryItem.delete({
    where: { id: request.params.id }
  });

  response.status(204).send();
});

router.get("/domain-library", async (_request, response) => {
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

router.post("/domain-library", async (request, response) => {
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

router.put("/domain-library/:id", async (request, response) => {
  const input = domainLibrarySchema.parse(request.body);
  const updated = await prisma.domainLibraryItem.update({
    where: { id: request.params.id },
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

router.delete("/domain-library/:id", async (request, response) => {
  await prisma.domainLibraryItem.delete({
    where: { id: request.params.id }
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

router.post("/templates", async (request, response) => {
  const input = templateSchema.parse(request.body);
  const result = await createTemplate(input);
  response.status(201).json({
    id: result.template.id,
    version: serializeTemplateVersion(result.version)
  });
});

router.put("/templates/:id", async (request, response) => {
  const input = templateSchema.parse(request.body);
  const result = await updateTemplate(request.params.id, input);
  response.json({
    id: result.template.id,
    version: serializeTemplateVersion(result.version)
  });
});

router.delete("/templates/:id", async (request, response) => {
  await deleteTemplate(request.params.id);
  response.status(204).send();
});

router.get("/assessment-runs", async (_request, response) => {
  const runs = await prisma.assessmentRun.findMany({
    include: {
      team: true,
      templateVersion: true
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  response.json(
    runs.map((run) => ({
      id: run.id,
      title: run.title,
      ownerName: run.ownerName,
      dueDate: run.dueDate,
      periodType: run.periodType,
      periodLabel: run.periodLabel,
      periodBucket: run.periodBucket,
      status: run.status,
      overallScore: run.overallScore,
      submittedAt: run.submittedAt,
      submissionSummary: run.submissionSummary,
      updatedAt: run.updatedAt,
      team: run.team,
      templateVersion: {
        id: run.templateVersionId,
        name: run.templateVersion.name,
        versionNumber: run.templateVersion.versionNumber
      }
    }))
  );
});

router.post("/assessment-runs/check-duplicate", async (request, response) => {
  const input = assessmentRunSchema.parse(request.body);
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

  const period = buildAssessmentPeriod(input) satisfies Pick<
    Prisma.AssessmentRunUncheckedCreateInput,
    "periodType" | "periodLabel" | "periodBucket" | "periodSortDate" | "year" | "quarter" | "startDate" | "endDate" | "referenceDate"
  >;
  const created = await prisma.assessmentRun.create({
    data: {
      title: input.title,
      teamId: input.teamId,
      templateId: input.templateId,
      templateVersionId: input.templateVersionId,
      ownerName: input.ownerName?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      ...period
    }
  });

  response.status(201).json(created);
});

router.get("/assessment-runs/:id", async (request, response) => {
  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id },
    include: {
      team: true,
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

router.put("/assessment-runs/:id", async (request, response) => {
  const input = updateAssessmentRunSchema.parse(request.body);

  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Submitted runs cannot be edited." });
  }

  const updated = await prisma.assessmentRun.update({
    where: { id: request.params.id },
    data: {
      title: input.title,
      ownerName: input.ownerName?.trim() || null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      periodLabel: input.periodLabel?.trim() || run.periodLabel
    }
  });

  response.json(updated);
});

router.put("/assessment-runs/:id/responses", async (request, response) => {
  const input = responseSchema.parse(request.body);

  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  await prisma.$transaction(
    input.responses.map((item) =>
      prisma.assessmentResponse.upsert({
        where: {
          assessmentRunId_questionId: {
            assessmentRunId: request.params.id,
            questionId: item.questionId
          }
        },
        update: {
          selectedValue: item.selectedValue,
          selectedLabel: item.selectedLabel,
          comment: item.comment ?? null
        },
        create: {
          assessmentRunId: request.params.id,
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

  response.json({ ok: true });
});

router.post("/assessment-runs/:id/submit", async (request, response) => {
  const input = submitAssessmentSchema.parse(request.body ?? {});
  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id },
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
    where: { id: request.params.id },
    data: {
      status: AssessmentRunStatus.SUBMITTED,
      submittedAt: new Date(),
      overallScore,
      submissionSummary: input.submissionSummary?.trim() || null
    }
  });

  response.json(updated);
});

router.post("/assessment-runs/:id/archive", async (request, response) => {
  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Submitted runs cannot be archived from this action." });
  }

  const updated = await prisma.assessmentRun.update({
    where: { id: request.params.id },
    data: { status: AssessmentRunStatus.ARCHIVED }
  });

  response.json(updated);
});

router.post("/assessment-runs/:id/unarchive", async (request, response) => {
  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id },
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
    where: { id: request.params.id },
    data: {
      status: run.responses.length > 0 ? AssessmentRunStatus.IN_PROGRESS : AssessmentRunStatus.DRAFT
    }
  });

  response.json(updated);
});

router.delete("/assessment-runs/:id", async (request, response) => {
  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id }
  });

  if (!run) {
    return response.status(404).json({ message: "Assessment run not found" });
  }

  if (run.status === AssessmentRunStatus.SUBMITTED) {
    return response.status(400).json({ message: "Submitted runs cannot be deleted." });
  }

  await prisma.assessmentRun.delete({
    where: { id: request.params.id }
  });

  response.status(204).send();
});

router.get("/assessment-runs/:id/results", async (request, response) => {
  const run = await prisma.assessmentRun.findUnique({
    where: { id: request.params.id },
    include: {
      team: true,
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
    return response.status(404).json({ message: "Assessment results not found" });
  }

  const serialized = serializeAssessmentRun(run);

  const comparisonCandidatesData = await prisma.assessmentRun.findMany({
    where: {
      id: { not: run.id },
      teamId: run.teamId,
      templateId: run.templateId,
      status: AssessmentRunStatus.SUBMITTED
    },
    orderBy: [{ periodSortDate: "desc" }, { createdAt: "desc" }]
  });

  const comparisonCandidates = comparisonCandidatesData.filter(
    (item) => item.periodSortDate < run.periodSortDate || (item.periodSortDate.getTime() === run.periodSortDate.getTime() && item.createdAt < run.createdAt)
  );

  const defaultPreviousRunMeta = comparisonCandidates[0] ?? null;
  const compareToRunId = typeof request.query.compareToRunId === "string" ? request.query.compareToRunId : undefined;
  const resolvedCompareToRunId =
    compareToRunId && comparisonCandidates.some((item) => item.id === compareToRunId) ? compareToRunId : defaultPreviousRunMeta?.id;

  const previousRun = resolvedCompareToRunId
    ? await prisma.assessmentRun.findUnique({
        where: { id: resolvedCompareToRunId },
        include: {
          team: true,
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
      })
    : null;

  const previousSerialized = previousRun ? serializeAssessmentRun(previousRun) : null;

  const trendData = await prisma.assessmentRun.findMany({
    where: {
      teamId: run.teamId,
      status: AssessmentRunStatus.SUBMITTED,
      templateId: run.templateId
    },
    include: {
      team: true,
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
    orderBy: [{ periodSortDate: "asc" }, { createdAt: "asc" }]
  });

  const comparisonRuns = await prisma.assessmentRun.findMany({
    where: {
      status: AssessmentRunStatus.SUBMITTED,
      templateId: run.templateId,
      periodBucket: run.periodBucket
    },
    include: {
      team: true
    }
  });

  const domainDelta = serialized.domains.map((domain) => {
    const previousDomain = previousSerialized?.domains.find((item) => item.title === domain.title) ?? null;
    return {
      domainId: domain.id,
      title: domain.title,
      currentScore: domain.averageScore,
      previousScore: previousDomain?.averageScore ?? null,
      scoreChange:
        typeof domain.averageScore === "number" && typeof previousDomain?.averageScore === "number"
          ? roundDelta(domain.averageScore - previousDomain.averageScore)
          : null
    };
  });

  const questionDelta = serialized.domains.flatMap((domain) =>
    domain.questions.map((question) => {
      const previousQuestion =
        previousSerialized?.domains
          .find((item) => item.title === domain.title)
          ?.questions.find((item) => item.prompt === question.prompt) ?? null;

      return {
        domainId: domain.id,
        domainTitle: domain.title,
        questionId: question.id,
        prompt: question.prompt,
        currentValue: question.response?.selectedValue ?? null,
        previousValue: previousQuestion?.response?.selectedValue ?? null,
        scoreChange:
          typeof question.response?.selectedValue === "number" && typeof previousQuestion?.response?.selectedValue === "number"
            ? roundDelta(question.response.selectedValue - previousQuestion.response.selectedValue)
            : null,
        currentLabel: question.response?.selectedLabel ?? null,
        previousLabel: previousQuestion?.response?.selectedLabel ?? null
      };
    })
  );

  const sortedQuestions = questionDelta
    .filter((question) => typeof question.currentValue === "number")
    .sort((a, b) => {
      if ((a.currentValue ?? 0) !== (b.currentValue ?? 0)) {
        return (a.currentValue ?? 0) - (b.currentValue ?? 0);
      }

      return a.prompt.localeCompare(b.prompt);
    });

  const strongestDomain = [...domainDelta]
    .filter((domain) => typeof domain.currentScore === "number")
    .sort((a, b) => (b.currentScore ?? 0) - (a.currentScore ?? 0))[0] ?? null;

  const weakestDomain = [...domainDelta]
    .filter((domain) => typeof domain.currentScore === "number")
    .sort((a, b) => (a.currentScore ?? 0) - (b.currentScore ?? 0))[0] ?? null;

  const scoringLabels = serialized.templateVersion.scoringLabels;
  const distribution = scoringLabels.map((label, index) => ({
    value: index + 1,
    label,
    count: serialized.domains.reduce(
      (sum, domain) =>
        sum + domain.questions.filter((question) => question.response?.selectedValue === index + 1).length,
      0
    )
  }));

  const domainTrend = trendData.map((item) => {
    const serializedTrendRun = serializeAssessmentRun(item);
    return {
      assessmentRunId: item.id,
      periodLabel: item.periodLabel,
      domains: serializedTrendRun.domains.map((domain) => ({
        domainId: domain.id,
        title: domain.title,
        score: domain.averageScore
      }))
    };
  });

  response.json({
    ...serialized,
    trend: trendData.map((item) => ({
      assessmentRunId: item.id,
      periodLabel: item.periodLabel,
      overallScore: item.overallScore ?? 0
    })),
    domainTrend,
    comparison: comparisonRuns.map((item) => ({
      teamName: item.team.name,
      overallScore: item.overallScore ?? 0,
      status: item.status
    })),
    comparisonCandidates: comparisonCandidates.map((item) => ({
      assessmentRunId: item.id,
      title: item.title,
      periodLabel: item.periodLabel,
      overallScore: item.overallScore ?? 0,
      submittedAt: item.submittedAt,
      isDefault: item.id === defaultPreviousRunMeta?.id
    })),
    previousRun: previousSerialized
      ? {
          assessmentRunId: previousSerialized.id,
          title: previousSerialized.title,
          periodLabel: previousSerialized.periodLabel,
          overallScore: previousSerialized.overallScore ?? 0,
          submittedAt: previousSerialized.submittedAt
        }
      : null,
    delta: {
      overallScoreChange:
        typeof serialized.overallScore === "number" && typeof previousSerialized?.overallScore === "number"
          ? roundDelta(serialized.overallScore - previousSerialized.overallScore)
          : null,
      domains: domainDelta,
      questions: questionDelta
    },
    highlights: {
      strongestDomain: strongestDomain
        ? {
            domainId: strongestDomain.domainId,
            title: strongestDomain.title,
            score: strongestDomain.currentScore
          }
        : null,
      weakestDomain: weakestDomain
        ? {
            domainId: weakestDomain.domainId,
            title: weakestDomain.title,
            score: weakestDomain.currentScore
          }
        : null,
      strengths: [...sortedQuestions]
        .sort((a, b) => (b.currentValue ?? 0) - (a.currentValue ?? 0))
        .slice(0, 3)
        .map((question) => ({
          domainTitle: question.domainTitle,
          prompt: question.prompt,
          selectedValue: question.currentValue,
          selectedLabel: question.currentLabel
        })),
      focusAreas: sortedQuestions.slice(0, 3).map((question) => ({
        domainTitle: question.domainTitle,
        prompt: question.prompt,
        selectedValue: question.currentValue,
        selectedLabel: question.currentLabel
      }))
    },
    distribution: {
      levels: distribution
    }
  });
});

router.get("/reports/latest-by-team", async (_request, response) => {
  const latestRuns = await getLatestSubmittedRunsByTeam();
  const latestRunsByTeamTemplate = await getLatestSubmittedRunsByTeamTemplate();

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

router.get("/dashboard/summary", async (_request, response) => {
  const [templates, runs, submittedRuns, teams] = await Promise.all([
    prisma.assessmentTemplate.count(),
    prisma.assessmentRun.count(),
    prisma.assessmentRun.count({ where: { status: AssessmentRunStatus.SUBMITTED } }),
    prisma.team.count()
  ]);

  const latestRuns = await prisma.assessmentRun.findMany({
    include: {
      team: true,
      templateVersion: true
    },
    take: 5,
    orderBy: {
      updatedAt: "desc"
    }
  });

  const latestSubmittedPerTeamSource = await prisma.assessmentRun.findMany({
    where: {
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
      overallScore: run.overallScore
    });
  }

  response.json({
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
      updatedAt: item.updatedAt
    })),
    latestSubmittedByTeam: Array.from(latestSubmittedPerTeam.values())
  });
});

router.get("/dashboard/trends", async (_request, response) => {
  const submittedRuns = await prisma.assessmentRun.findMany({
    where: { status: AssessmentRunStatus.SUBMITTED },
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

router.get("/dashboard/comparison", async (_request, response) => {
  const latestSubmitted = await prisma.assessmentRun.findMany({
    where: { status: AssessmentRunStatus.SUBMITTED },
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

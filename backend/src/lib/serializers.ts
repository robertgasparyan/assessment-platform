import { AssessmentPeriodType, AssessmentRunStatus, Prisma } from "@prisma/client";

type TemplateVersionGraph = Prisma.TemplateVersionGetPayload<{
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
}>;

type AssessmentRunBaseGraph = Prisma.AssessmentRunGetPayload<{
  include: {
    team: {
      include: {
        group: true;
      };
    };
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
    responses: true;
  };
}> & {
  periodType: AssessmentPeriodType;
  periodBucket: string;
  periodSortDate: Date;
  startDate: Date | null;
  endDate: Date | null;
  referenceDate: Date | null;
};

type AssessmentRunWithAssignmentHistory = AssessmentRunBaseGraph & {
  assignmentHistory?: Array<{
    id: string;
    createdAt: Date;
    fromOwnerName: string | null;
    toOwnerName: string | null;
    assignedByUser: {
      id: string;
      displayName: string;
      username: string;
    };
    fromUser: {
      id: string;
      displayName: string;
      username: string;
    } | null;
    toUser: {
      id: string;
      displayName: string;
      username: string;
    } | null;
  }>;
};

export function serializeTemplateVersion(version: TemplateVersionGraph) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    name: version.name,
    description: version.description,
    category: version.category,
    scoringLabels: version.scoringLabels as string[],
    domains: version.domains
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((domain) => ({
        id: domain.id,
        title: domain.title,
        description: domain.description,
        questions: domain.questions
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((question) => ({
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
              }))
          }))
      }))
  };
}

export function serializeAssessmentRun(run: AssessmentRunWithAssignmentHistory) {
  const domains = run.templateVersion.domains
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((domain) => {
      const questions = domain.questions
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((question) => {
          const response = run.responses.find((item) => item.questionId === question.id);
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
            response: response
              ? {
                  selectedValue: response.selectedValue,
                  selectedLabel: response.selectedLabel,
                  comment: response.comment
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

  const allScores = run.responses.map((response) => response.selectedValue);
  const overallScore = allScores.length
    ? Number((allScores.reduce((sum, value) => sum + value, 0) / allScores.length).toFixed(2))
    : null;

  return {
    id: run.id,
    title: run.title,
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
    assignmentHistory: (run.assignmentHistory ?? []).map((item) => ({
          id: item.id,
          createdAt: item.createdAt,
          assignedByUser: {
            id: item.assignedByUser.id,
            displayName: item.assignedByUser.displayName,
            username: item.assignedByUser.username
          },
          fromUser: item.fromUser
            ? {
                id: item.fromUser.id,
                displayName: item.fromUser.displayName,
                username: item.fromUser.username
              }
            : null,
          toUser: item.toUser
            ? {
                id: item.toUser.id,
                displayName: item.toUser.displayName,
                username: item.toUser.username
              }
            : null,
          fromOwnerName: item.fromOwnerName,
          toOwnerName: item.toOwnerName
        })),
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
    status: run.status as AssessmentRunStatus,
    submittedAt: run.submittedAt,
    submissionSummary: run.submissionSummary,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    overallScore,
    templateVersion: serializeTemplateVersion(run.templateVersion),
    domains
  };
}

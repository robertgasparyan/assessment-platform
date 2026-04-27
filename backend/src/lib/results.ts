import { AssessmentParticipantStatus, AssessmentResponseMode, AssessmentRunStatus, Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { serializeAssessmentRun } from "./serializers.js";

function roundDelta(value: number | null) {
  return typeof value === "number" ? Number(value.toFixed(2)) : null;
}

const assessmentRunResultsInclude = Prisma.validator<Prisma.AssessmentRunInclude>()({
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
});

export async function buildAssessmentResultsPayload(runId: string, compareToRunId?: string) {
  const run = await prisma.assessmentRun.findUnique({
    where: { id: runId },
    include: assessmentRunResultsInclude
  });

  if (!run) {
    return null;
  }

  const serialized = serializeAssessmentRun(run);
  const participantAggregation =
    run.responseMode === AssessmentResponseMode.INDIVIDUAL_AGGREGATED
      ? await prisma.assessmentRunParticipant.findMany({
          where: {
            assessmentRunId: run.id
          },
          select: {
            status: true,
            _count: {
              select: {
                responses: true
              }
            }
          }
        })
      : [];
  const submittedParticipantCount = participantAggregation.filter((participant) => participant.status === AssessmentParticipantStatus.SUBMITTED).length;

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
    (item) =>
      item.periodSortDate < run.periodSortDate
      || (item.periodSortDate.getTime() === run.periodSortDate.getTime() && item.createdAt < run.createdAt)
  );

  const defaultPreviousRunMeta = comparisonCandidates[0] ?? null;
  const resolvedCompareToRunId =
    compareToRunId && comparisonCandidates.some((item) => item.id === compareToRunId)
      ? compareToRunId
      : defaultPreviousRunMeta?.id;

  const previousRun = resolvedCompareToRunId
    ? await prisma.assessmentRun.findUnique({
        where: { id: resolvedCompareToRunId },
        include: assessmentRunResultsInclude
      })
    : null;

  const previousSerialized = previousRun ? serializeAssessmentRun(previousRun) : null;

  const trendData = await prisma.assessmentRun.findMany({
    where: {
      teamId: run.teamId,
      status: AssessmentRunStatus.SUBMITTED,
      templateId: run.templateId
    },
    include: assessmentRunResultsInclude,
    orderBy: [{ periodSortDate: "asc" }, { createdAt: "asc" }]
  });

  const comparisonRuns = await prisma.assessmentRun.findMany({
    where: {
      status: AssessmentRunStatus.SUBMITTED,
      templateId: run.templateId,
      periodBucket: run.periodBucket
    },
    include: {
      team: {
        include: {
          group: true
        }
      },
      target: true
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
      (sum, domain) => sum + domain.questions.filter((question) => question.response?.selectedValue === index + 1).length,
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

  return {
    ...serialized,
    aggregation: {
      isAggregated: run.responseMode === AssessmentResponseMode.INDIVIDUAL_AGGREGATED && run.status === AssessmentRunStatus.SUBMITTED,
      method: run.responseMode === AssessmentResponseMode.INDIVIDUAL_AGGREGATED ? "Average submitted participant answers, then round to nearest maturity level" : null,
      participantCount: participantAggregation.length,
      submittedParticipantCount,
      requiredParticipantCount: run.minimumParticipantResponses
        ? Math.min(run.minimumParticipantResponses, participantAggregation.length)
        : participantAggregation.length,
      totalParticipantResponses: participantAggregation.reduce((sum, participant) => sum + participant._count.responses, 0)
    },
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
  };
}

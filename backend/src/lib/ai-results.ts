import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import type { buildAssessmentResultsPayload } from "./results.js";
import { generateAssessmentAiJson } from "./ai-client.js";

type ResultsPayload = NonNullable<Awaited<ReturnType<typeof buildAssessmentResultsPayload>>>;

type AiExecutiveSummary = {
  headline: string;
  summary: string;
  strengths: string[];
  watchouts: string[];
  recommendations: string[];
  leadershipBrief: string;
};

type AiResultsQuestionAnswer = {
  answer: string;
  supportingPoints: string[];
  sources: string[];
};

function formatMaybeScore(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "n/a";
}

function buildPrompt(results: ResultsPayload) {
  const domainSummary = results.domains
    .map((domain) => `- ${domain.title}: score ${formatMaybeScore(domain.averageScore)}, answered ${domain.answeredQuestions}/${domain.totalQuestions}`)
    .join("\n");

  const strengthSignals = results.highlights.strengths
    .map((item) => `- ${item.domainTitle}: ${item.prompt} (${item.selectedLabel ?? "n/a"} / ${item.selectedValue ?? "n/a"})`)
    .join("\n");

  const focusSignals = results.highlights.focusAreas
    .map((item) => `- ${item.domainTitle}: ${item.prompt} (${item.selectedLabel ?? "n/a"} / ${item.selectedValue ?? "n/a"})`)
    .join("\n");

  const changedQuestions = results.delta.questions
    .filter((item) => typeof item.scoreChange === "number" && item.scoreChange !== 0)
    .slice(0, 8)
    .map(
      (item) =>
        `- ${item.domainTitle}: ${item.prompt} | current ${item.currentLabel ?? "n/a"} (${item.currentValue ?? "n/a"}) | baseline ${item.previousLabel ?? "n/a"} (${item.previousValue ?? "n/a"}) | delta ${item.scoreChange ?? "n/a"}`
    )
    .join("\n");

  const commentedQuestions = results.domains
    .flatMap((domain) =>
      domain.questions
        .filter((question) => question.response?.comment?.trim())
        .slice(0, 6)
        .map((question) => `- ${domain.title}: ${question.prompt} | comment: ${question.response?.comment?.trim() ?? ""}`)
    )
    .join("\n");

  const baselineContext = results.previousRun
    ? `Baseline available: yes. Compare against ${results.previousRun.title} from ${results.previousRun.periodLabel}. Overall delta vs baseline: ${formatMaybeScore(results.delta.overallScoreChange)}.`
    : "Baseline available: no. Write the brief using current-state interpretation only.";

  return `You are writing an executive AI brief for a submitted assessment run.

Return only valid JSON with this exact shape:
{
  "headline": "string",
  "summary": "string",
  "strengths": ["string", "string", "string"],
  "watchouts": ["string", "string", "string"],
  "recommendations": ["string", "string", "string"],
  "leadershipBrief": "string"
}

Rules:
- Be concrete and executive-friendly.
- Keep each bullet short and useful.
- Recommendations must be practical and general, not fabricated workflow records.
- Do not mention hidden implementation details or raw JSON.
- Do not invent data not supported by the assessment.
- Keep the tone analytical and concise.
- If a baseline is present, incorporate compare-aware interpretation in the summary and recommendations.

Assessment context:
- title: ${results.title}
- team: ${results.team.name}
- period: ${results.periodLabel}
- template: ${results.templateVersion.name}
- status: ${results.status}
- overall score: ${formatMaybeScore(results.overallScore)}
- answered questions: ${results.domains.reduce((sum, item) => sum + item.answeredQuestions, 0)}/${results.domains.reduce((sum, item) => sum + item.totalQuestions, 0)}
- strongest domain: ${results.highlights.strongestDomain ? `${results.highlights.strongestDomain.title} (${formatMaybeScore(results.highlights.strongestDomain.score)})` : "n/a"}
- weakest domain: ${results.highlights.weakestDomain ? `${results.highlights.weakestDomain.title} (${formatMaybeScore(results.highlights.weakestDomain.score)})` : "n/a"}
- user submission summary: ${results.submissionSummary?.trim() || "none"}
- ${baselineContext}

Domain scores:
${domainSummary || "- none"}

Top strengths:
${strengthSignals || "- none"}

Top focus areas:
${focusSignals || "- none"}

Meaningful changed questions:
${changedQuestions || "- none"}

Comment signals:
${commentedQuestions || "- none"}`;
}

async function generateFreshSummary(results: ResultsPayload) {
  const output = await generateAssessmentAiJson<AiExecutiveSummary>(buildPrompt(results));

  return {
    provider: output.provider,
    model: output.model,
    headline: output.headline,
    summary: output.summary,
    strengths: output.strengths ?? [],
    watchouts: output.watchouts ?? [],
    recommendations: output.recommendations ?? [],
    leadershipBrief: output.leadershipBrief,
    providerLabel: output.visibleProviderLabel
  };
}

function parseCachedPayload(payload: Prisma.JsonValue) {
  const objectValue = (payload ?? {}) as Prisma.JsonObject;
  return {
    headline: String(objectValue.headline ?? ""),
    summary: String(objectValue.summary ?? ""),
    strengths: Array.isArray(objectValue.strengths) ? objectValue.strengths.map((item) => String(item)) : [],
    watchouts: Array.isArray(objectValue.watchouts) ? objectValue.watchouts.map((item) => String(item)) : [],
    recommendations: Array.isArray(objectValue.recommendations) ? objectValue.recommendations.map((item) => String(item)) : [],
    leadershipBrief: String(objectValue.leadershipBrief ?? ""),
    providerLabel: objectValue.providerLabel ? String(objectValue.providerLabel) : null
  };
}

export async function getCachedOrGenerateResultsExecutiveSummary({
  results,
  actorUserId,
  forceRefresh = false
}: {
  results: ResultsPayload;
  actorUserId: string;
  forceRefresh?: boolean;
}) {
  const fresh = await generateFreshSummary(results);
  const cacheLookup = {
    assessmentRunId: results.id,
    provider: fresh.provider,
    model: fresh.model,
    compareToRunId: results.previousRun?.assessmentRunId ?? null
  };

  if (!forceRefresh) {
    const cached = await prisma.aiAssessmentSummary.findFirst({
      where: cacheLookup
    });

    if (cached) {
      const parsed = parseCachedPayload(cached.payload);
      return {
        ...parsed,
        cached: true,
        cachedAt: cached.updatedAt
      };
    }
  }

  const existing = await prisma.aiAssessmentSummary.findFirst({
    where: cacheLookup
  });

  if (existing) {
    await prisma.aiAssessmentSummary.update({
      where: { id: existing.id },
      data: {
        generatedByUserId: actorUserId,
        payload: {
          headline: fresh.headline,
          summary: fresh.summary,
          strengths: fresh.strengths,
          watchouts: fresh.watchouts,
          recommendations: fresh.recommendations,
          leadershipBrief: fresh.leadershipBrief,
          providerLabel: fresh.providerLabel
        } as Prisma.InputJsonValue
      }
    });
  } else {
    await prisma.aiAssessmentSummary.create({
      data: {
      assessmentRunId: results.id,
      provider: fresh.provider,
      model: fresh.model,
      compareToRunId: results.previousRun?.assessmentRunId ?? null,
      generatedByUserId: actorUserId,
      payload: {
        headline: fresh.headline,
        summary: fresh.summary,
        strengths: fresh.strengths,
        watchouts: fresh.watchouts,
        recommendations: fresh.recommendations,
        leadershipBrief: fresh.leadershipBrief,
        providerLabel: fresh.providerLabel
      } as Prisma.InputJsonValue
      }
    });
  }

  return {
    headline: fresh.headline,
    summary: fresh.summary,
    strengths: fresh.strengths,
    watchouts: fresh.watchouts,
    recommendations: fresh.recommendations,
    leadershipBrief: fresh.leadershipBrief,
    providerLabel: fresh.providerLabel,
    cached: false,
    cachedAt: null
  };
}

export async function generateResultsQuestionAnswer({
  results,
  question,
  history = []
}: {
  results: ResultsPayload;
  question: string;
  history?: Array<{
    question: string;
    answer: string;
  }>;
}) {
  const domainSummary = results.domains
    .map((domain) => `- ${domain.title}: score ${formatMaybeScore(domain.averageScore)}, answered ${domain.answeredQuestions}/${domain.totalQuestions}`)
    .join("\n");

  const focusSignals = results.highlights.focusAreas
    .map((item) => `- ${item.domainTitle}: ${item.prompt} (${item.selectedLabel ?? "n/a"} / ${item.selectedValue ?? "n/a"})`)
    .join("\n");

  const strengthSignals = results.highlights.strengths
    .map((item) => `- ${item.domainTitle}: ${item.prompt} (${item.selectedLabel ?? "n/a"} / ${item.selectedValue ?? "n/a"})`)
    .join("\n");

  const changedQuestions = results.delta.questions
    .filter((item) => typeof item.scoreChange === "number" && item.scoreChange !== 0)
    .slice(0, 10)
    .map(
      (item) =>
        `- ${item.domainTitle}: ${item.prompt} | current ${item.currentLabel ?? "n/a"} (${item.currentValue ?? "n/a"}) | baseline ${item.previousLabel ?? "n/a"} (${item.previousValue ?? "n/a"}) | delta ${item.scoreChange ?? "n/a"}`
    )
    .join("\n");

  const commentedQuestions = results.domains
    .flatMap((domain) =>
      domain.questions
        .filter((question) => question.response?.comment?.trim())
        .slice(0, 10)
        .map((question) => `- ${domain.title}: ${question.prompt} | answer ${question.response?.selectedLabel ?? "n/a"} (${question.response?.selectedValue ?? "n/a"}) | comment: ${question.response?.comment?.trim() ?? ""}`)
    )
    .join("\n");

  const conversationHistory = history
    .slice(-6)
    .map((item, index) => `${index + 1}. Q: ${item.question}\n   A: ${item.answer}`)
    .join("\n");

  const prompt = `You are answering a user's question about one submitted assessment report.

Return only valid JSON with this exact shape:
{
  "answer": "string",
  "supportingPoints": ["string", "string", "string"],
  "sources": ["string", "string", "string"]
}

Rules:
- Answer only from the provided submitted-report data.
- Be concise, direct, and analytical.
- If the user's question asks for a conclusion that the data does not support, say so plainly.
- Do not invent actions, owners, hidden causes, or workflow records.
- If a baseline is present, use it only when relevant to the user's question.
- Use prior conversation context only to resolve follow-up references such as "that", "this", or "why".
- Do not treat prior conversation as new evidence; the evidence still comes only from the provided report data.
- Supporting points should explain the reasoning.
- Sources should name the concrete report signals used, such as domain scores, focus-area questions, changed questions, comments, aggregation metadata, or baseline delta.

Report context:
- title: ${results.title}
- team: ${results.team.name}
- period: ${results.periodLabel}
- template: ${results.templateVersion.name}
- overall score: ${formatMaybeScore(results.overallScore)}
- strongest domain: ${results.highlights.strongestDomain ? `${results.highlights.strongestDomain.title} (${formatMaybeScore(results.highlights.strongestDomain.score)})` : "n/a"}
- weakest domain: ${results.highlights.weakestDomain ? `${results.highlights.weakestDomain.title} (${formatMaybeScore(results.highlights.weakestDomain.score)})` : "n/a"}
- baseline available: ${results.previousRun ? `yes, ${results.previousRun.title} (${results.previousRun.periodLabel}) with overall delta ${formatMaybeScore(results.delta.overallScoreChange)}` : "no"}
- aggregation: ${results.aggregation.isAggregated ? `aggregated from ${results.aggregation.submittedParticipantCount}/${results.aggregation.participantCount} submitted participant responses using ${results.aggregation.method ?? "aggregation"}` : "not aggregated"}

Domain scores:
${domainSummary || "- none"}

Top strengths:
${strengthSignals || "- none"}

Top focus areas:
${focusSignals || "- none"}

Meaningful changed questions:
${changedQuestions || "- none"}

Comment signals:
${commentedQuestions || "- none"}

Prior Q&A in this report session:
${conversationHistory || "- none"}

User question:
${question}`;

  const output = await generateAssessmentAiJson<AiResultsQuestionAnswer>(prompt);

  return {
    answer: output.answer,
    supportingPoints: output.supportingPoints ?? [],
    sources: output.sources ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

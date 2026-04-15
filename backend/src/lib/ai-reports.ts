import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { generateAssessmentAiJson } from "./ai-client.js";

type ReportsAiInput = {
  viewMode: "team" | "team-template";
  selectedQuestionLabel: string | null;
  selectedDomainLabel: string | null;
  summary: {
    rowsCount: number;
    averageLatestScore: number | null;
    highestRowLabel: string | null;
    mostCommonWeakestDomainTitle: string | null;
  };
  filters: {
    search: string;
    team: string;
    template: string;
    category: string;
    domain: string;
    question: string;
  };
  rows: Array<{
    teamName: string;
    templateName: string;
    periodLabel: string;
    overallScore: number | null;
    strongestDomainTitle: string | null;
    weakestDomainTitle: string | null;
  }>;
  domainSnapshot: Array<{
    title: string;
    averageScore: number | null;
    teamCount: number;
  }>;
  questionSnapshot: Array<{
    teamName: string;
    templateName: string;
    domainTitle: string;
    selectedLabel: string | null;
    selectedValue: number | null;
  }>;
};

type ReportsAiBrief = {
  headline: string;
  summary: string;
  patterns: string[];
  risks: string[];
  recommendations: string[];
  leadershipBrief: string;
};

function formatMaybeScore(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "n/a";
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(",")}}`;
  }

  return JSON.stringify(value);
}

function buildCacheFingerprint(input: ReportsAiInput) {
  return stableStringify({
    viewMode: input.viewMode,
    selectedQuestionLabel: input.selectedQuestionLabel,
    selectedDomainLabel: input.selectedDomainLabel,
    summary: input.summary,
    filters: input.filters,
    rows: input.rows,
    domainSnapshot: input.domainSnapshot,
    questionSnapshot: input.questionSnapshot
  });
}

function buildPrompt(input: ReportsAiInput) {
  const rows = input.rows
    .slice(0, 18)
    .map(
      (row) =>
        `- ${row.teamName} | ${row.templateName} | ${row.periodLabel} | score ${formatMaybeScore(row.overallScore)} | strongest ${row.strongestDomainTitle ?? "n/a"} | weakest ${row.weakestDomainTitle ?? "n/a"}`
    )
    .join("\n");

  const domains = input.domainSnapshot
    .slice(0, 10)
    .map((domain) => `- ${domain.title}: score ${formatMaybeScore(domain.averageScore)} across ${domain.teamCount} row(s)`)
    .join("\n");

  const questions = input.questionSnapshot
    .slice(0, 10)
    .map(
      (item) =>
        `- ${item.teamName} | ${item.templateName} | ${item.domainTitle} | ${item.selectedLabel ?? "n/a"} (${item.selectedValue ?? "n/a"})`
    )
    .join("\n");

  return `You are writing an executive AI brief for a filtered cross-team assessment reporting view.

Return only valid JSON with this exact shape:
{
  "headline": "string",
  "summary": "string",
  "patterns": ["string", "string", "string"],
  "risks": ["string", "string", "string"],
  "recommendations": ["string", "string", "string"],
  "leadershipBrief": "string"
}

Rules:
- Be concise, concrete, and analytical.
- Base the narrative only on the provided filtered reporting data.
- Focus on cross-team signal, not single-run storytelling.
- Recommendations must remain general and non-fabricated.
- Do not invent action plans, owners, or workflow records.
- If the report is domain-focused or question-focused, make that explicit.
- Call out concentration of weakness where the data supports it.
- Use an executive tone suitable for a reporting workspace.

Reporting lens:
- view mode: ${input.viewMode === "team-template" ? "latest per team + assessment" : "latest per team"}
- selected domain: ${input.selectedDomainLabel ?? "none"}
- selected question: ${input.selectedQuestionLabel ?? "none"}
- rows in view: ${input.summary.rowsCount}
- average latest score: ${formatMaybeScore(input.summary.averageLatestScore)}
- highest row: ${input.summary.highestRowLabel ?? "n/a"}
- most common weakest domain: ${input.summary.mostCommonWeakestDomainTitle ?? "n/a"}

Filters:
- search: ${input.filters.search || "none"}
- team: ${input.filters.team}
- template: ${input.filters.template}
- category: ${input.filters.category}
- domain: ${input.filters.domain}
- question: ${input.filters.question}

Current rows:
${rows || "- none"}

Domain snapshot:
${domains || "- none"}

Question snapshot:
${questions || "- none"}`;
}

async function generateFreshBrief(input: ReportsAiInput) {
  const output = await generateAssessmentAiJson<ReportsAiBrief>(buildPrompt(input));

  return {
    provider: output.provider,
    model: output.model,
    headline: output.headline,
    summary: output.summary,
    patterns: output.patterns ?? [],
    risks: output.risks ?? [],
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
    patterns: Array.isArray(objectValue.patterns) ? objectValue.patterns.map((item) => String(item)) : [],
    risks: Array.isArray(objectValue.risks) ? objectValue.risks.map((item) => String(item)) : [],
    recommendations: Array.isArray(objectValue.recommendations) ? objectValue.recommendations.map((item) => String(item)) : [],
    leadershipBrief: String(objectValue.leadershipBrief ?? ""),
    providerLabel: objectValue.providerLabel ? String(objectValue.providerLabel) : null
  };
}

export async function getCachedOrGenerateReportsAiBrief({
  input,
  actorUserId,
  forceRefresh = false
}: {
  input: ReportsAiInput;
  actorUserId: string;
  forceRefresh?: boolean;
}) {
  const fresh = await generateFreshBrief(input);
  const fingerprint = buildCacheFingerprint(input);
  const cacheKey = createHash("sha256").update(`${fresh.provider}|${fresh.model}|${fingerprint}`).digest("hex");

  if (!forceRefresh) {
    const cached = await prisma.aiReportsBrief.findUnique({
      where: { cacheKey }
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

  await prisma.aiReportsBrief.upsert({
    where: { cacheKey },
    update: {
      generatedByUserId: actorUserId,
      payload: {
        headline: fresh.headline,
        summary: fresh.summary,
        patterns: fresh.patterns,
        risks: fresh.risks,
        recommendations: fresh.recommendations,
        leadershipBrief: fresh.leadershipBrief,
        providerLabel: fresh.providerLabel
      } as Prisma.InputJsonValue
    },
    create: {
      cacheKey,
      provider: fresh.provider,
      model: fresh.model,
      generatedByUserId: actorUserId,
      payload: {
        headline: fresh.headline,
        summary: fresh.summary,
        patterns: fresh.patterns,
        risks: fresh.risks,
        recommendations: fresh.recommendations,
        leadershipBrief: fresh.leadershipBrief,
        providerLabel: fresh.providerLabel
      } as Prisma.InputJsonValue
    }
  });

  return {
    headline: fresh.headline,
    summary: fresh.summary,
    patterns: fresh.patterns,
    risks: fresh.risks,
    recommendations: fresh.recommendations,
    leadershipBrief: fresh.leadershipBrief,
    providerLabel: fresh.providerLabel,
    cached: false,
    cachedAt: null
  };
}

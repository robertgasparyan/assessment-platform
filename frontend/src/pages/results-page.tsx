import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "react-router-dom";
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  BarChart,
  Bar
} from "recharts";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { AssessmentResults } from "@/types";

type QuestionDelta = AssessmentResults["delta"]["questions"][number];
type AnswerFilter = "all" | "low" | "commented" | "changed";

function formatScore(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "-";
}

function formatDelta(value: number | null | undefined) {
  if (typeof value !== "number") {
    return "No baseline";
  }

  if (value === 0) {
    return "No change";
  }

  return `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function deltaTone(value: number | null | undefined) {
  if (typeof value !== "number" || value === 0) {
    return "outline" as const;
  }

  return value > 0 ? ("success" as const) : ("secondary" as const);
}

function trendBarWidth(score: number) {
  return `${Math.max(8, (score / 5) * 100)}%`;
}

function matchesFilterLabel(filter: AnswerFilter) {
  if (filter === "low") {
    return "Low score";
  }

  if (filter === "commented") {
    return "Commented";
  }

  if (filter === "changed") {
    return "Changed";
  }

  return "All";
}

function wrapRadarLabel(value: string, maxLineLength = 16) {
  const words = value.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= maxLineLength) {
      currentLine = nextLine;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
    }
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.slice(0, 3);
}

function RadarAxisTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string };
  textAnchor?: "start" | "middle" | "end" | "inherit";
  stroke?: string;
  active?: boolean;
  onSelect?: (value: string) => void;
}) {
  const { x = 0, y = 0, payload, textAnchor = "middle", active = false, onSelect } = props;
  const lines = wrapRadarLabel(payload?.value ?? "");

  return (
    <text
      className={onSelect ? "cursor-pointer" : undefined}
      fill={active ? "hsl(var(--primary))" : "currentColor"}
      fontSize={12}
      fontWeight={active ? 700 : 500}
      onClick={() => payload?.value && onSelect?.(payload.value)}
      textAnchor={textAnchor}
      x={x}
      y={y}
    >
      {lines.map((line, index) => (
        <tspan dy={index === 0 ? 0 : 14} key={`${payload?.value ?? "tick"}-${index}`} x={x}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

function ResultsPageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-96 animate-pulse rounded-2xl bg-muted" />
        <div className="h-5 w-72 animate-pulse rounded-full bg-muted" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="rounded-[1.5rem] border bg-white p-5" key={`results-skeleton-stat-${index}`}>
            <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
            <div className="mt-4 h-9 w-20 animate-pulse rounded-2xl bg-muted" />
            <div className="mt-3 h-4 w-32 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-6 w-28 animate-pulse rounded-full bg-muted" />
          <div className="h-4 w-72 animate-pulse rounded-full bg-muted" />
        </div>
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="h-10 w-24 animate-pulse rounded-xl bg-muted" key={`results-skeleton-tab-${index}`} />
          ))}
        </div>
      </div>

      <div className="rounded-[1.5rem] border bg-white p-6">
        <div className="grid gap-4 xl:grid-cols-[1.3fr,1fr]">
          <div className="space-y-3">
            <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-11/12 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-10/12 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {Array.from({ length: 2 }).map((_, index) => (
              <div className="rounded-[1.25rem] border bg-muted/20 p-4" key={`results-skeleton-callout-${index}`}>
                <div className="h-4 w-28 animate-pulse rounded-full bg-muted" />
                <div className="mt-3 h-5 w-full animate-pulse rounded-full bg-muted" />
                <div className="mt-2 h-4 w-24 animate-pulse rounded-full bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        {Array.from({ length: 2 }).map((_, index) => (
          <div className="rounded-[1.5rem] border bg-white p-6" key={`results-skeleton-chart-${index}`}>
            <div className="h-6 w-32 animate-pulse rounded-full bg-muted" />
            <div className="mt-2 h-4 w-48 animate-pulse rounded-full bg-muted" />
            <div className="mt-6 h-[280px] animate-pulse rounded-[1.25rem] bg-muted/70" />
          </div>
        ))}
      </div>

      <div className="rounded-[1.5rem] border bg-white p-6">
        <div className="h-6 w-36 animate-pulse rounded-full bg-muted" />
        <div className="mt-2 h-4 w-56 animate-pulse rounded-full bg-muted" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="h-14 animate-pulse rounded-[1.25rem] bg-muted/70" key={`results-skeleton-row-${index}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultsPage() {
  const location = useLocation();
  const { runId = "" } = useParams();
  const [pageMode, setPageMode] = useState("overview");
  const [selectedComparisonRunId, setSelectedComparisonRunId] = useState("auto");
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [hoveredDomainId, setHoveredDomainId] = useState<string | null>(null);
  const [overviewFilter, setOverviewFilter] = useState<AnswerFilter>("all");
  const [compareFilter, setCompareFilter] = useState<AnswerFilter>("all");

  const resultsQuery = useQuery({
    queryKey: ["assessment-results", runId, selectedComparisonRunId],
    queryFn: () =>
      api.get<AssessmentResults>(
        `/assessment-runs/${runId}/results${selectedComparisonRunId !== "auto" ? `?compareToRunId=${selectedComparisonRunId}` : ""}`
      )
  });

  const results = resultsQuery.data;
  const radarData = results?.domains.map((domain) => ({ domain: domain.title, score: domain.averageScore ?? 0 })) ?? [];
  const distributionData = results?.distribution.levels ?? [];
  const domainBarData = results?.domains.map((domain) => ({
    domain: domain.title,
    score: domain.averageScore ?? 0
  })) ?? [];
  const domainDeltaData = results?.delta.domains.map((domain) => ({ domain: domain.title, scoreChange: domain.scoreChange ?? 0 })) ?? [];
  const domainTrendData = useMemo(
    () =>
      (results?.domainTrend ?? []).map((item) => ({
        periodLabel: item.periodLabel,
        ...(Object.fromEntries(item.domains.map((domain) => [domain.title, domain.score ?? 0])))
      })),
    [results?.domainTrend]
  );
  const domainTrendKeys = useMemo(
    () => (results?.domains ?? []).slice(0, 4).map((domain) => domain.title),
    [results?.domains]
  );
  const domainNameToId = useMemo(
    () => new Map((results?.domains ?? []).map((domain) => [domain.title, domain.id])),
    [results?.domains]
  );

  const activeDomain =
    results?.domains.find((domain) => domain.id === activeDomainId)
    ?? results?.domains[0]
    ?? null;

  const previousQuestionLookup = useMemo(() => {
    const entries: Array<[string, QuestionDelta]> =
      results?.delta.questions.map((question) => [
        `${question.domainId}:${question.questionId}`,
        question
      ]) ?? [];

    return new Map<string, QuestionDelta>(entries);
  }, [results?.delta.questions]);

  const activeDomainDelta = results?.delta.domains.find((domain) => domain.domainId === activeDomain?.id) ?? null;

  const sortedActiveQuestions = useMemo(() => {
    if (!activeDomain) {
      return [];
    }

    return [...activeDomain.questions].sort((a, b) => {
      const aScore = a.response?.selectedValue ?? 0;
      const bScore = b.response?.selectedValue ?? 0;
      if (aScore !== bScore) {
        return aScore - bScore;
      }

      return a.prompt.localeCompare(b.prompt);
    });
  }, [activeDomain]);

  const activeDomainQuestionBarData = useMemo(
    () =>
      sortedActiveQuestions.map((question) => ({
        question: question.prompt.length > 52 ? `${question.prompt.slice(0, 49)}...` : question.prompt,
        score: question.response?.selectedValue ?? 0
      })),
    [sortedActiveQuestions]
  );

  const answeredQuestions = results?.domains.reduce((sum, domain) => sum + domain.answeredQuestions, 0) ?? 0;
  const totalQuestions = results?.domains.reduce((sum, domain) => sum + domain.totalQuestions, 0) ?? 0;

  const topImprovements = useMemo(
    () =>
      [...(results?.delta.questions ?? [])]
        .filter((question) => typeof question.scoreChange === "number" && question.scoreChange > 0)
        .sort((a, b) => (b.scoreChange ?? 0) - (a.scoreChange ?? 0))
        .slice(0, 3),
    [results?.delta.questions]
  );

  const topRegressions = useMemo(
    () =>
      [...(results?.delta.questions ?? [])]
        .filter((question) => typeof question.scoreChange === "number" && question.scoreChange < 0)
        .sort((a, b) => (a.scoreChange ?? 0) - (b.scoreChange ?? 0))
        .slice(0, 3),
    [results?.delta.questions]
  );
  const printBaselineLabel =
    pageMode === "compare" && results?.previousRun ? `${results.previousRun.title} · ${results.previousRun.periodLabel}` : null;
  const backToRunState = location.state && typeof location.state === "object" ? location.state : undefined;

  const filteredOverviewRows = useMemo(
    () =>
      (results?.domains ?? []).flatMap((domain) =>
        domain.questions.filter((question) => {
          if (overviewFilter === "all") {
            return true;
          }

          if (overviewFilter === "low") {
            return (question.response?.selectedValue ?? 0) <= 2;
          }

          if (overviewFilter === "commented") {
            return Boolean(question.response?.comment?.trim());
          }

          const delta = previousQuestionLookup.get(`${domain.id}:${question.id}`);
          return typeof delta?.scoreChange === "number" && delta.scoreChange !== 0;
        }).map((question) => ({ domain, question }))
      ),
    [overviewFilter, previousQuestionLookup, results?.domains]
  );

  const filteredCompareRows = useMemo(
    () =>
      (results?.domains ?? []).flatMap((domain) =>
        domain.questions.filter((question) => {
          if (compareFilter === "all") {
            return true;
          }

          if (compareFilter === "low") {
            return (question.response?.selectedValue ?? 0) <= 2;
          }

          if (compareFilter === "commented") {
            return Boolean(question.response?.comment?.trim());
          }

          const delta = previousQuestionLookup.get(`${domain.id}:${question.id}`);
          return typeof delta?.scoreChange === "number" && delta.scoreChange !== 0;
        }).map((question) => ({ domain, question }))
      ),
    [compareFilter, previousQuestionLookup, results?.domains]
  );

  if (resultsQuery.isLoading) {
    return <ResultsPageSkeleton />;
  }

  return (
    <div className="space-y-6">
      <div className="print-report-only hidden space-y-4">
        <div className="border-b pb-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Assessment report</div>
          <h1 className="mt-2 text-3xl font-semibold text-slate-950">{results?.title ?? "Assessment results"}</h1>
          <p className="mt-2 text-sm text-slate-600">
            {results?.team.name} · {results?.periodLabel} · Template v{results?.templateVersion.versionNumber}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-xl border p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Overall</div>
            <div className="mt-2 text-2xl font-semibold">{formatScore(results?.overallScore)}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Coverage</div>
            <div className="mt-2 text-2xl font-semibold">{answeredQuestions}/{totalQuestions}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Strongest</div>
            <div className="mt-2 text-base font-semibold">{results?.highlights.strongestDomain?.title ?? "-"}</div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="text-xs uppercase tracking-wide text-slate-500">Weakest</div>
            <div className="mt-2 text-base font-semibold">{results?.highlights.weakestDomain?.title ?? "-"}</div>
          </div>
        </div>

        <div className="grid grid-cols-[1.1fr,0.9fr] gap-4">
          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Executive summary</div>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {`${results?.team.name ?? "This team"} scored ${formatScore(results?.overallScore)} in the current submitted assessment.`}
              {" "}
              {results?.highlights.strongestDomain
                ? `Strongest domain: ${results.highlights.strongestDomain.title} (${formatScore(results.highlights.strongestDomain.score)}).`
                : ""}
              {" "}
              {results?.highlights.weakestDomain
                ? `Focus domain: ${results.highlights.weakestDomain.title} (${formatScore(results.highlights.weakestDomain.score)}).`
                : ""}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Top strength</div>
                <div className="mt-1 text-sm font-medium">{results?.highlights.strengths[0]?.prompt ?? "-"}</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs uppercase tracking-wide text-slate-500">Top focus area</div>
                <div className="mt-1 text-sm font-medium">{results?.highlights.focusAreas[0]?.prompt ?? "-"}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Domain scores</div>
            <div className="mt-3 space-y-3">
              {(results?.domains ?? []).slice(0, 6).map((domain) => (
                <div className="space-y-1" key={`print-domain-${domain.id}`}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{domain.title}</span>
                    <span>{formatScore(domain.averageScore)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-[hsl(var(--primary))]"
                      style={{ width: `${((domain.averageScore ?? 0) / 5) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Trend snapshot</div>
            <div className="text-xs text-slate-500">Most recent submitted periods</div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-3">
            {(results?.trend ?? []).slice(-4).map((item) => (
              <div className="space-y-2" key={`print-trend-${item.assessmentRunId}`}>
                <div className="truncate text-xs font-medium text-slate-600">{item.periodLabel}</div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-[hsl(var(--primary))]"
                    style={{ width: trendBarWidth(item.overallScore) }}
                  />
                </div>
                <div className="text-xs font-semibold text-slate-800">{item.overallScore.toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        {printBaselineLabel ? (
          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Comparison baseline</div>
            <div className="mt-2 text-sm text-slate-700">{printBaselineLabel}</div>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs uppercase tracking-wide text-slate-500">Delta</span>
              <span className="text-sm font-semibold">{formatDelta(results?.delta.overallScoreChange)}</span>
            </div>
          </div>
        ) : null}

        {results?.submissionSummary ? (
          <div className="rounded-xl border p-4">
            <div className="text-sm font-semibold">Submission summary</div>
            <div className="mt-2 text-sm leading-6 text-slate-700">{results.submissionSummary}</div>
          </div>
        ) : null}
      </div>

      <div className="print-hidden flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Results</div>
          <h1 className="mt-2 text-4xl font-semibold">{results?.title ?? "Assessment results"}</h1>
          <p className="mt-2 text-muted-foreground">
            {results?.team.name} · {results?.periodLabel} · Template v{results?.templateVersion.versionNumber}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge variant="outline">{results?.periodType ?? "Assessment"}</Badge>
          <Badge variant="secondary">{results?.templateVersion.category ?? "Uncategorized"}</Badge>
          <Button onClick={() => window.print()} type="button" variant="outline">
            Print report
          </Button>
        </div>
      </div>

      <div className="print-hidden grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-[1.25rem] border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Status</div>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={results?.status === "SUBMITTED" ? "success" : "secondary"}>{results?.status ?? "-"}</Badge>
          </div>
        </div>
        <div className="rounded-[1.25rem] border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Submitted</div>
          <div className="mt-2 text-sm font-medium">{formatDate(results?.submittedAt)}</div>
        </div>
        <div className="rounded-[1.25rem] border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Owner</div>
          <div className="mt-2 text-sm font-medium">{results?.ownerName || "-"}</div>
        </div>
        <div className="rounded-[1.25rem] border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Due date</div>
          <div className="mt-2 text-sm font-medium">{formatDate(results?.dueDate)}</div>
        </div>
        <div className="rounded-[1.25rem] border bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Answered</div>
          <div className="mt-2 text-sm font-medium">
            {answeredQuestions}/{totalQuestions}
          </div>
        </div>
      </div>

      <div className="print-hidden grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard hint="Average maturity across all answered questions" label="Overall score" value={formatScore(results?.overallScore)} />
        <StatCard
          hint="Highest-scoring domain in this assessment"
          label="Strongest domain"
          value={results?.highlights.strongestDomain ? `${results.highlights.strongestDomain.title} (${formatScore(results.highlights.strongestDomain.score)})` : "-"}
        />
        <StatCard
          hint="Lowest-scoring domain to prioritize next"
          label="Weakest domain"
          value={results?.highlights.weakestDomain ? `${results.highlights.weakestDomain.title} (${formatScore(results.highlights.weakestDomain.score)})` : "-"}
        />
        <StatCard hint="Answered questions captured in this report" label="Coverage" value={`${answeredQuestions}/${totalQuestions}`} />
        <StatCard
          hint={results?.previousRun ? `Selected baseline: ${results.previousRun.periodLabel}` : "No comparison baseline selected"}
          label="Compare delta"
          value={formatDelta(results?.delta.overallScoreChange)}
        />
      </div>

      <Tabs value={pageMode} onValueChange={setPageMode}>
        <div className="print-hidden flex items-center justify-between gap-4">
          <div>
            <div className="text-lg font-semibold">Result views</div>
            <div className="text-sm text-muted-foreground">Read the current report separately from comparison and peer context.</div>
          </div>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
            <TabsTrigger value="peers">Peers</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent className="space-y-6" value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Executive summary</CardTitle>
              <CardDescription>Quick readout of the current submitted report.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[1.3fr,1fr]">
              <div className="rounded-[1.5rem] border bg-accent/60 p-5">
                <div className="text-sm font-medium text-muted-foreground">Summary</div>
                <p className="mt-3 text-base leading-7">
                  {`${results?.team.name ?? "This team"} scored ${formatScore(results?.overallScore)} in the current submitted assessment.`}
                  {" "}
                  {results?.highlights.strongestDomain
                    ? `The strongest domain is ${results.highlights.strongestDomain.title} at ${formatScore(results.highlights.strongestDomain.score)}.`
                    : "No strongest domain is available yet."}
                  {" "}
                  {results?.highlights.weakestDomain
                    ? `The weakest domain is ${results.highlights.weakestDomain.title} at ${formatScore(results.highlights.weakestDomain.score)}.`
                    : ""}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div className="rounded-[1.5rem] border bg-white/95 p-5">
                  <div className="text-sm font-medium text-muted-foreground">Biggest opportunity</div>
                  <div className="mt-2 text-lg font-semibold">{results?.highlights.focusAreas[0]?.prompt ?? "No focus area yet"}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{results?.highlights.focusAreas[0]?.domainTitle ?? "No domain"}</div>
                </div>
                <div className="rounded-[1.5rem] border bg-white/95 p-5">
                  <div className="text-sm font-medium text-muted-foreground">Most mature signal</div>
                  <div className="mt-2 text-lg font-semibold">{results?.highlights.strengths[0]?.prompt ?? "No strength yet"}</div>
                  <div className="mt-2 text-sm text-muted-foreground">{results?.highlights.strengths[0]?.domainTitle ?? "No domain"}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Domain radar</CardTitle>
                <CardDescription>Average maturity per domain in the current report.</CardDescription>
              </CardHeader>
              <CardContent className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart
                    cx="50%"
                    cy="50%"
                    data={radarData}
                    onMouseLeave={() => setHoveredDomainId(null)}
                    onMouseMove={(state) => {
                      const domainName = (state as { activeLabel?: string })?.activeLabel;
                      const domainId = domainName ? domainNameToId.get(domainName) : undefined;
                      setHoveredDomainId(domainId ?? null);
                    }}
                    outerRadius="66%"
                  >
                    <PolarGrid />
                    <PolarAngleAxis
                      dataKey="domain"
                      tick={(props) => (
                        <RadarAxisTick
                          {...props}
                          active={
                            domainNameToId.get(props.payload?.value ?? "") === activeDomain?.id
                            || domainNameToId.get(props.payload?.value ?? "") === hoveredDomainId
                          }
                          onSelect={(value) => {
                            const domainId = domainNameToId.get(value);
                            if (domainId) {
                              setActiveDomainId(domainId);
                            }
                          }}
                        />
                      )}
                    />
                    <Radar
                      activeDot={{
                        cursor: "pointer",
                        onMouseEnter: (event) => {
                          const domainName = (event as { payload?: { domain?: string } })?.payload?.domain;
                          const domainId = domainName ? domainNameToId.get(domainName) : undefined;
                          setHoveredDomainId(domainId ?? null);
                        },
                        onClick: (event) => {
                          const domainName = (event as { payload?: { domain?: string } })?.payload?.domain;
                          if (!domainName) {
                            return;
                          }

                          const domainId = domainNameToId.get(domainName);
                          if (domainId) {
                            setActiveDomainId(domainId);
                          }
                        }
                      }}
                      dataKey="score"
                      fill="hsl(var(--primary))"
                      fillOpacity={hoveredDomainId ? 0.58 : 0.45}
                      onClick={(event) => {
                        const domainName = (event as { payload?: { domain?: string } })?.payload?.domain;
                        if (!domainName) {
                          return;
                        }

                        const domainId = domainNameToId.get(domainName);
                        if (domainId) {
                          setActiveDomainId(domainId);
                        }
                      }}
                      onMouseEnter={(event) => {
                        const domainName = (event as { payload?: { domain?: string } })?.payload?.domain;
                        const domainId = domainName ? domainNameToId.get(domainName) : undefined;
                        setHoveredDomainId(domainId ?? null);
                      }}
                      stroke="hsl(var(--primary))"
                      strokeWidth={hoveredDomainId ? 3 : 2}
                    />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Period trend</CardTitle>
                <CardDescription>Submitted trend for this team and template over time.</CardDescription>
              </CardHeader>
              <CardContent className="h-[360px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={results?.trend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="periodLabel" />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    <Line dataKey="overallScore" stroke="hsl(var(--primary))" strokeWidth={3} type="monotone" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Domain score bars</CardTitle>
                <CardDescription>Precise domain score comparison alongside the radar view.</CardDescription>
              </CardHeader>
              <CardContent className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={domainBarData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis domain={[0, 5]} type="number" />
                    <YAxis dataKey="domain" type="category" width={140} />
                    <Tooltip />
                    <Bar dataKey="score" fill="hsl(var(--primary))" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Score distribution</CardTitle>
                <CardDescription>How many questions landed at each maturity level.</CardDescription>
              </CardHeader>
              <CardContent className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={distributionData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="label" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Strengths</CardTitle>
                <CardDescription>The most mature signals captured in this submission.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(results?.highlights.strengths ?? []).map((item, index) => (
                  <div className="rounded-[1.25rem] border bg-white p-4" key={`${item.prompt}-${index}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{item.prompt}</div>
                      <Badge variant="default">
                        {item.selectedLabel} ({item.selectedValue})
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{item.domainTitle}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Focus areas</CardTitle>
                <CardDescription>The weakest signals that should shape the next improvement cycle.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(results?.highlights.focusAreas ?? []).map((item, index) => (
                  <div className="rounded-[1.25rem] border bg-white p-4" key={`${item.prompt}-${index}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-semibold">{item.prompt}</div>
                      <Badge variant="outline">
                        {item.selectedLabel} ({item.selectedValue})
                      </Badge>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{item.domainTitle}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {results?.submissionSummary ? (
            <Card>
              <CardHeader>
                <CardTitle>Submission summary</CardTitle>
                <CardDescription>Context captured when this run was submitted.</CardDescription>
              </CardHeader>
              <CardContent className="text-sm leading-7 text-muted-foreground">{results.submissionSummary}</CardContent>
            </Card>
          ) : null}

          <div className="grid gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Domain trend</CardTitle>
                <CardDescription>Track the strongest and weakest domains over time instead of only the overall score.</CardDescription>
              </CardHeader>
              <CardContent className="h-[340px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={domainTrendData}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis dataKey="periodLabel" />
                    <YAxis domain={[0, 5]} />
                    <Tooltip />
                    {domainTrendKeys.map((key, index) => (
                      <Line
                        dataKey={key}
                        dot={false}
                        key={key}
                        stroke={["hsl(var(--primary))", "#0f766e", "#ea580c", "#475569"][index % 4]}
                        strokeWidth={index === 0 ? 3 : 2}
                        type="monotone"
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Domain breakdown</CardTitle>
              <CardDescription>Select a domain to inspect question-level answers in the current report.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[280px,1fr]">
              <div className="space-y-3">
                {(results?.domains ?? []).map((domain) => {
                  const active = activeDomain?.id === domain.id;
                  const hovered = hoveredDomainId === domain.id;
                  return (
                    <button
                      className={`w-full rounded-[1.25rem] border p-4 text-left transition ${
                        active ? "border-primary bg-primary/5" : hovered ? "border-primary/50 bg-primary/5" : "bg-white"
                      }`}
                      key={domain.id}
                      onMouseEnter={() => setHoveredDomainId(domain.id)}
                      onMouseLeave={() => setHoveredDomainId(null)}
                      onClick={() => setActiveDomainId(domain.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{domain.title}</div>
                        <Badge variant="secondary">{formatScore(domain.averageScore)}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {domain.answeredQuestions}/{domain.totalQuestions} answered
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                {activeDomain ? (
                  <>
                    <div className="rounded-[1.5rem] border bg-accent/45 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{activeDomain.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{activeDomain.description || "No domain description provided."}</div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{formatScore(activeDomain.averageScore)}/5</Badge>
                        </div>
                      </div>
                    </div>

                    <Card className="border-border/80 bg-white/95">
                      <CardHeader>
                        <CardTitle>Question score bars</CardTitle>
                        <CardDescription>Current question scores within the selected domain, sorted from lowest to highest.</CardDescription>
                      </CardHeader>
                      <CardContent className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={activeDomainQuestionBarData} layout="vertical" margin={{ left: 24 }}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                            <XAxis domain={[0, 5]} type="number" />
                            <YAxis dataKey="question" type="category" width={180} />
                            <Tooltip />
                            <Bar dataKey="score" fill="hsl(var(--primary))" radius={[0, 10, 10, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <div className="space-y-3">
                      {sortedActiveQuestions.map((question) => (
                        <div className="rounded-[1.25rem] border bg-white/95 p-4" key={question.id}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="font-semibold">{question.prompt}</div>
                            <div className="flex gap-2">
                              <Badge variant="secondary">
                                {question.response?.selectedLabel ?? "No answer"} {question.response?.selectedValue ? `(${question.response.selectedValue})` : ""}
                              </Badge>
                            </div>
                          </div>
                          {question.guidance ? <div className="mt-2 text-sm text-muted-foreground">{question.guidance}</div> : null}
                          <div className="mt-3 text-sm text-muted-foreground">{question.response?.comment || "No comment provided."}</div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Detailed answers</CardTitle>
              <CardDescription>Selected maturity level per question in the current report.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  { value: "all", label: "All" },
                  { value: "low", label: "Low score" },
                  { value: "commented", label: "Commented" },
                  { value: "changed", label: "Changed" }
                ].map((filter) => (
                  <Button
                    key={`overview-filter-${filter.value}`}
                    onClick={() => setOverviewFilter(filter.value as AnswerFilter)}
                    size="sm"
                    type="button"
                    variant={overviewFilter === filter.value ? "default" : "outline"}
                  >
                    {filter.label}
                  </Button>
                ))}
                {overviewFilter !== "all" ? (
                  <Button onClick={() => setOverviewFilter("all")} size="sm" type="button" variant="outline">
                    Reset: {matchesFilterLabel(overviewFilter)}
                  </Button>
                ) : null}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredOverviewRows.map(({ domain, question }) => (
                      <TableRow key={question.id}>
                        <TableCell>{domain.title}</TableCell>
                        <TableCell>{question.prompt}</TableCell>
                        <TableCell>
                          {question.response?.selectedLabel} ({question.response?.selectedValue})
                        </TableCell>
                        <TableCell>{question.response?.comment || "-"}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-6" value="compare">
          <Card>
            <CardHeader>
              <CardTitle>Choose comparison baseline</CardTitle>
              <CardDescription>Keep the current report separate, then compare it to a previous submitted run when you need to analyze change.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-[320px,1fr]">
              <div className="space-y-2">
                <div className="text-sm font-medium">Compare against</div>
                <Select
                  options={[
                    { value: "auto", label: "Auto: latest previous submitted run" },
                    ...((results?.comparisonCandidates ?? []).map((candidate) => ({
                      value: candidate.assessmentRunId,
                      label: `${candidate.periodLabel} · ${candidate.title}`
                    })))
                  ]}
                  value={selectedComparisonRunId}
                  onChange={(event) => setSelectedComparisonRunId(event.target.value)}
                />
              </div>
              <div className="rounded-[1.25rem] border bg-muted/20 p-4">
                <div className="text-sm font-medium text-muted-foreground">Current baseline</div>
                <div className="mt-2 text-lg font-semibold">
                  {results?.previousRun ? `${results.previousRun.title} · ${results.previousRun.periodLabel}` : "No baseline selected"}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {results?.previousRun ? `Overall score: ${formatScore(results.previousRun.overallScore)}` : "Select a previous run or keep the automatic baseline."}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline">Comparing current report to</Badge>
            <Badge variant="secondary">
              {results?.previousRun ? `${results.previousRun.periodLabel} · ${results.previousRun.title}` : "No baseline selected"}
            </Badge>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr,1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Delta vs selected baseline</CardTitle>
                <CardDescription>
                  {results?.previousRun
                    ? `Compared with ${results.previousRun.title} from ${results.previousRun.periodLabel}.`
                    : "No previous submitted run is available yet for this team and template."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-[1.25rem] border bg-white p-4">
                  <div className="text-sm text-muted-foreground">Overall score change</div>
                  <div className="mt-2 text-3xl font-semibold">{formatDelta(results?.delta.overallScoreChange)}</div>
                </div>
                {results?.previousRun ? (
                  <div className="rounded-[1.25rem] border bg-white p-4">
                    <div className="text-sm text-muted-foreground">Baseline run</div>
                    <div className="mt-2 text-lg font-semibold">{results.previousRun.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {results.previousRun.periodLabel} · {formatScore(results.previousRun.overallScore)}
                    </div>
                  </div>
                ) : null}
                <div className="space-y-3">
                  {(results?.delta.domains ?? []).map((domain) => (
                    <div className="flex items-center justify-between gap-3 rounded-[1.25rem] border bg-white p-4" key={domain.domainId}>
                      <div>
                        <div className="font-semibold">{domain.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {formatScore(domain.previousScore)} → {formatScore(domain.currentScore)}
                        </div>
                      </div>
                      <Badge variant={deltaTone(domain.scoreChange)}>{formatDelta(domain.scoreChange)}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Domain change chart</CardTitle>
                <CardDescription>Positive bars show improvement; negative bars show regression.</CardDescription>
              </CardHeader>
              <CardContent className="h-[420px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={domainDeltaData} layout="vertical" margin={{ left: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                    <XAxis type="number" />
                    <YAxis dataKey="domain" type="category" width={120} />
                    <Tooltip />
                    <Bar dataKey="scoreChange" fill="hsl(var(--primary))" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Top improvements</CardTitle>
                <CardDescription>Questions with the biggest upward movement against the chosen baseline.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {topImprovements.length ? (
                  topImprovements.map((item) => (
                    <div className="rounded-[1.25rem] border bg-white p-4" key={`improvement-${item.questionId}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{item.prompt}</div>
                        <Badge variant={deltaTone(item.scoreChange)}>{formatDelta(item.scoreChange)}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {item.domainTitle} · {item.previousLabel ?? "-"} to {item.currentLabel ?? "-"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed bg-white p-4 text-sm text-muted-foreground">
                    No positive changes found for the selected comparison.
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Top regressions</CardTitle>
                <CardDescription>Questions with the biggest downward movement against the chosen baseline.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {topRegressions.length ? (
                  topRegressions.map((item) => (
                    <div className="rounded-[1.25rem] border bg-white p-4" key={`regression-${item.questionId}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{item.prompt}</div>
                        <Badge variant={deltaTone(item.scoreChange)}>{formatDelta(item.scoreChange)}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {item.domainTitle} · {item.previousLabel ?? "-"} to {item.currentLabel ?? "-"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-[1.25rem] border border-dashed bg-white p-4 text-sm text-muted-foreground">
                    No regressions found for the selected comparison.
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Question-by-question comparison</CardTitle>
              <CardDescription>Detailed current vs baseline view for the selected domain.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-[280px,1fr]">
              <div className="space-y-3">
                {(results?.domains ?? []).map((domain) => {
                  const delta = results?.delta.domains.find((item) => item.domainId === domain.id);
                  const active = activeDomain?.id === domain.id;
                  const hovered = hoveredDomainId === domain.id;
                  return (
                    <button
                      className={`w-full rounded-[1.25rem] border p-4 text-left transition ${
                        active ? "border-primary bg-primary/5" : hovered ? "border-primary/50 bg-primary/5" : "bg-white"
                      }`}
                      key={domain.id}
                      onMouseEnter={() => setHoveredDomainId(domain.id)}
                      onMouseLeave={() => setHoveredDomainId(null)}
                      onClick={() => setActiveDomainId(domain.id)}
                      type="button"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-semibold">{domain.title}</div>
                        <Badge variant="secondary">{formatScore(domain.averageScore)}</Badge>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {domain.answeredQuestions}/{domain.totalQuestions} answered
                      </div>
                      <div className="mt-3">
                        <Badge variant={deltaTone(delta?.scoreChange)}>{formatDelta(delta?.scoreChange)}</Badge>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-4">
                {activeDomain ? (
                  <>
                    <div className="rounded-[1.5rem] border bg-muted/20 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-lg font-semibold">{activeDomain.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{activeDomain.description || "No domain description provided."}</div>
                        </div>
                        <div className="flex gap-2">
                          <Badge variant="secondary">{formatScore(activeDomain.averageScore)}/5</Badge>
                          <Badge variant={deltaTone(activeDomainDelta?.scoreChange)}>{formatDelta(activeDomainDelta?.scoreChange)}</Badge>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {sortedActiveQuestions.map((question) => {
                        const previousQuestion = previousQuestionLookup.get(`${activeDomain.id}:${question.id}`);
                        return (
                          <div className="rounded-[1.25rem] border bg-white p-4" key={question.id}>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="font-semibold">{question.prompt}</div>
                              <div className="flex gap-2">
                                <Badge variant="secondary">
                                  {question.response?.selectedLabel ?? "No answer"} {question.response?.selectedValue ? `(${question.response.selectedValue})` : ""}
                                </Badge>
                                <Badge variant={deltaTone(previousQuestion?.scoreChange)}>{formatDelta(previousQuestion?.scoreChange)}</Badge>
                              </div>
                            </div>
                            {question.guidance ? <div className="mt-2 text-sm text-muted-foreground">{question.guidance}</div> : null}
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                              <div className="rounded-xl border bg-muted/20 p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current</div>
                                <div className="mt-1 text-sm">
                                  {question.response?.selectedLabel ?? "No answer"} {question.response?.selectedValue ? `(${question.response.selectedValue})` : ""}
                                </div>
                              </div>
                              <div className="rounded-xl border bg-muted/20 p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Baseline</div>
                                <div className="mt-1 text-sm">
                                  {previousQuestion?.previousLabel ?? "No baseline"} {previousQuestion?.previousValue ? `(${previousQuestion.previousValue})` : ""}
                                </div>
                              </div>
                            </div>
                            <div className="mt-3 text-sm text-muted-foreground">{question.response?.comment || "No comment provided."}</div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Comparison table</CardTitle>
              <CardDescription>Selected maturity level per question, alongside the chosen baseline.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  { value: "all", label: "All" },
                  { value: "changed", label: "Changed" },
                  { value: "low", label: "Low score" },
                  { value: "commented", label: "Commented" }
                ].map((filter) => (
                  <Button
                    key={`compare-filter-${filter.value}`}
                    onClick={() => setCompareFilter(filter.value as AnswerFilter)}
                    size="sm"
                    type="button"
                    variant={compareFilter === filter.value ? "default" : "outline"}
                  >
                    {filter.label}
                  </Button>
                ))}
                {compareFilter !== "all" ? (
                  <Button onClick={() => setCompareFilter("all")} size="sm" type="button" variant="outline">
                    Reset: {matchesFilterLabel(compareFilter)}
                  </Button>
                ) : null}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Question</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Baseline</TableHead>
                    <TableHead>Delta</TableHead>
                    <TableHead>Comment</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCompareRows.map(({ domain, question }) => {
                      const delta = previousQuestionLookup.get(`${domain.id}:${question.id}`);
                      return (
                        <TableRow key={question.id}>
                          <TableCell>{domain.title}</TableCell>
                          <TableCell>{question.prompt}</TableCell>
                          <TableCell>
                            {question.response?.selectedLabel} ({question.response?.selectedValue})
                          </TableCell>
                          <TableCell>
                            {delta?.previousLabel ? `${delta.previousLabel} (${delta.previousValue})` : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant={deltaTone(delta?.scoreChange)}>{formatDelta(delta?.scoreChange)}</Badge>
                          </TableCell>
                          <TableCell>{question.response?.comment || "-"}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-6" value="peers">
          <Card>
            <CardHeader>
              <CardTitle>Same-period team comparison</CardTitle>
              <CardDescription>Peer context is secondary, but useful when you want external calibration for the same template and period.</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={results?.comparison ?? []}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                  <XAxis dataKey="teamName" />
                  <YAxis domain={[0, 5]} />
                  <Tooltip />
                  <Bar dataKey="overallScore" fill="hsl(var(--primary))" radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Link className="print-hidden text-sm font-medium text-primary" state={backToRunState} to={`/assessments/${runId}`}>
        Back to assessment run
      </Link>
    </div>
  );
}

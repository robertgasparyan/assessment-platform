import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, Bot, Layers3, Search, Sparkles, Target } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/export";
import { Button } from "@/components/ui/button";
import type { AiStatus, LatestByTeamReport, LatestByTeamReportsResponse, ReportsAiBrief } from "@/types";
import { toast } from "sonner";

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

function scoreTone(score: number | null | undefined) {
  if (typeof score !== "number") {
    return "bg-secondary text-muted-foreground";
  }

  if (score >= 4) {
    return "bg-accent text-foreground";
  }

  if (score >= 2.5) {
    return "bg-secondary text-foreground";
  }

  return "bg-border text-foreground";
}

export function ReportsPage() {
  const [viewMode, setViewMode] = useState<"team" | "team-template">("team-template");
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [domainFilter, setDomainFilter] = useState("all");
  const [questionFilter, setQuestionFilter] = useState("all");
  const [isAiBriefOpen, setIsAiBriefOpen] = useState(false);

  const reportsQuery = useQuery({
    queryKey: ["reports-latest-by-team"],
    queryFn: () => api.get<LatestByTeamReportsResponse>("/reports/latest-by-team")
  });
  const aiStatusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AiStatus>("/settings/ai-status")
  });

  const data = reportsQuery.data;
  const activeRows = viewMode === "team-template" ? data?.latestByTeamTemplate ?? [] : data?.latestByTeam ?? [];

  const teamOptions = useMemo(
    () =>
      Array.from(new Set(activeRows.map((item) => item.teamName)))
        .sort((a, b) => a.localeCompare(b))
        .map((teamName) => ({ value: teamName, label: teamName })),
    [activeRows]
  );

  const templateOptions = useMemo(
    () =>
      Array.from(new Set(activeRows.map((item) => item.templateName)))
        .sort((a, b) => a.localeCompare(b))
        .map((templateName) => ({ value: templateName, label: templateName })),
    [activeRows]
  );

  const categoryOptions = useMemo(
    () =>
      Array.from(new Set(activeRows.map((item) => item.templateCategory).filter((value): value is string => Boolean(value))))
        .sort((a, b) => a.localeCompare(b))
        .map((category) => ({ value: category, label: category })),
    [activeRows]
  );

  const domainOptions = useMemo(
    () =>
      Array.from(new Set(activeRows.flatMap((item) => item.domains.map((domain) => domain.title))))
        .sort((a, b) => a.localeCompare(b))
        .map((domainTitle) => ({ value: domainTitle, label: domainTitle })),
    [activeRows]
  );

  const questionOptions = useMemo(() => {
    const prompts = new Set<string>();

    for (const item of activeRows) {
      for (const domain of item.domains) {
        if (domainFilter !== "all" && domain.title !== domainFilter) {
          continue;
        }
        for (const question of domain.questions) {
          prompts.add(question.prompt);
        }
      }
    }

    return Array.from(prompts)
      .sort((a, b) => a.localeCompare(b))
      .map((prompt) => ({ value: prompt, label: prompt }));
  }, [activeRows, domainFilter]);

  useEffect(() => {
    if (questionFilter !== "all" && !questionOptions.some((option) => option.value === questionFilter)) {
      setQuestionFilter("all");
    }
  }, [questionFilter, questionOptions]);

  const filteredLatestRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return activeRows.filter((item) => {
      const matchesSearch =
        !query
        || item.teamName.toLowerCase().includes(query)
        || item.title.toLowerCase().includes(query)
        || item.templateName.toLowerCase().includes(query)
        || item.periodLabel.toLowerCase().includes(query)
        || (item.strongestDomain?.title ?? "").toLowerCase().includes(query)
        || (item.weakestDomain?.title ?? "").toLowerCase().includes(query)
        || item.domains.some(
          (domain) =>
            domain.title.toLowerCase().includes(query)
            || domain.questions.some((question) => question.prompt.toLowerCase().includes(query))
        );
      const matchesTeam = teamFilter === "all" || item.teamName === teamFilter;
      const matchesTemplate = templateFilter === "all" || item.templateName === templateFilter;
      const matchesCategory = categoryFilter === "all" || item.templateCategory === categoryFilter;
      const matchesDomain = domainFilter === "all" || item.domains.some((domain) => domain.title === domainFilter);
      const matchesQuestion =
        questionFilter === "all"
        || item.domains.some((domain) => domain.questions.some((question) => question.prompt === questionFilter));

      return matchesSearch && matchesTeam && matchesTemplate && matchesCategory && matchesDomain && matchesQuestion;
    });
  }, [activeRows, categoryFilter, domainFilter, questionFilter, search, teamFilter, templateFilter]);

  const filteredSummary = useMemo(() => {
    const scoredRuns = filteredLatestRows.filter((item) => typeof item.overallScore === "number");
    const averageLatestScore = scoredRuns.length
      ? Number((scoredRuns.reduce((sum, item) => sum + (item.overallScore ?? 0), 0) / scoredRuns.length).toFixed(2))
      : null;
    const highestRow = [...scoredRuns].sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))[0] ?? null;
    const weakestCounts = new Map<string, number>();

    for (const item of filteredLatestRows) {
      if (item.weakestDomain?.title) {
        weakestCounts.set(item.weakestDomain.title, (weakestCounts.get(item.weakestDomain.title) ?? 0) + 1);
      }
    }

    const mostCommonWeakestDomain = [...weakestCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? null;

    return {
      rowsCount: filteredLatestRows.length,
      averageLatestScore,
      highestRow,
      mostCommonWeakestDomain: mostCommonWeakestDomain
        ? { title: mostCommonWeakestDomain[0], teamCount: mostCommonWeakestDomain[1] }
        : null
    };
  }, [filteredLatestRows]);

  const filteredDomainSnapshot = useMemo(() => {
    const buckets = new Map<string, { title: string; total: number; count: number; teamCount: number }>();

    for (const item of filteredLatestRows) {
      for (const domain of item.domains) {
        if (domainFilter !== "all" && domain.title !== domainFilter) {
          continue;
        }
        if (questionFilter !== "all" && !domain.questions.some((question) => question.prompt === questionFilter)) {
          continue;
        }

        const current = buckets.get(domain.title) ?? { title: domain.title, total: 0, count: 0, teamCount: 0 };
        current.teamCount += 1;
        if (typeof domain.averageScore === "number") {
          current.total += domain.averageScore;
          current.count += 1;
        }
        buckets.set(domain.title, current);
      }
    }

    return [...buckets.values()]
      .map((domain) => ({
        title: domain.title,
        averageScore: domain.count ? Number((domain.total / domain.count).toFixed(2)) : null,
        teamCount: domain.teamCount
      }))
      .sort((a, b) => (b.averageScore ?? 0) - (a.averageScore ?? 0));
  }, [domainFilter, filteredLatestRows, questionFilter]);

  const questionSnapshot = useMemo(() => {
    if (questionFilter === "all") {
      return [];
    }

    return filteredLatestRows
      .map((item) => {
        for (const domain of item.domains) {
          const question = domain.questions.find((entry) => entry.prompt === questionFilter);
          if (question) {
            return {
              rowKey: `${item.teamName}:${item.templateName}`,
              teamName: item.teamName,
              templateName: item.templateName,
              domainTitle: domain.title,
              selectedValue: question.selectedValue,
              selectedLabel: question.selectedLabel
            };
          }
        }

        return null;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => (b.selectedValue ?? 0) - (a.selectedValue ?? 0));
  }, [filteredLatestRows, questionFilter]);

  const chartData = useMemo(
    () =>
      [...filteredLatestRows]
        .sort((a, b) => (b.overallScore ?? 0) - (a.overallScore ?? 0))
        .map((item) => ({
          label: viewMode === "team-template" ? `${item.teamName} · ${item.templateName}` : item.teamName,
          overallScore: item.overallScore ?? 0
        })),
    [filteredLatestRows, viewMode]
  );

  const selectedQuestionLabel = questionFilter !== "all" ? questionFilter : null;
  const selectedDomainLabel = domainFilter !== "all" ? domainFilter : null;
  const selectionText = viewMode === "team-template" ? data?.selectionRule.latestByTeamTemplate : data?.selectionRule.latestByTeam;
  const aiEnabledForReports = Boolean(aiStatusQuery.data?.enabled);

  const aiBriefMutation = useMutation({
    mutationFn: (refresh?: boolean) =>
      api.post<ReportsAiBrief>(`/reports/ai-brief${refresh ? "?refresh=1" : ""}`, {
        viewMode,
        selectedQuestionLabel,
        selectedDomainLabel,
        summary: {
          rowsCount: filteredSummary.rowsCount,
          averageLatestScore: filteredSummary.averageLatestScore,
          highestRowLabel: filteredSummary.highestRow
            ? `${filteredSummary.highestRow.teamName}${viewMode === "team-template" ? ` · ${filteredSummary.highestRow.templateName}` : ""}`
            : null,
          mostCommonWeakestDomainTitle: filteredSummary.mostCommonWeakestDomain?.title ?? null
        },
        filters: {
          search,
          team: teamFilter,
          template: templateFilter,
          category: categoryFilter,
          domain: domainFilter,
          question: questionFilter
        },
        rows: filteredLatestRows.map((item) => ({
          teamName: item.teamName,
          templateName: item.templateName,
          periodLabel: item.periodLabel,
          overallScore: item.overallScore,
          strongestDomainTitle: item.strongestDomain?.title ?? null,
          weakestDomainTitle: item.weakestDomain?.title ?? null
        })),
        domainSnapshot: filteredDomainSnapshot,
        questionSnapshot
      }),
    onError: (error: Error) => toast.error(error.message)
  });

  function copyAiBrief() {
    if (!aiBriefMutation.data) {
      return;
    }

    const sections = [
      `Headline\n${aiBriefMutation.data.headline}`,
      `Summary\n${aiBriefMutation.data.summary}`,
      `Observed patterns\n${aiBriefMutation.data.patterns.map((item) => `- ${item}`).join("\n")}`,
      `Watchouts\n${aiBriefMutation.data.risks.map((item) => `- ${item}`).join("\n")}`,
      `General recommendations\n${aiBriefMutation.data.recommendations.map((item) => `- ${item}`).join("\n")}`,
      `Leadership brief\n${aiBriefMutation.data.leadershipBrief}`
    ];

    void navigator.clipboard.writeText(sections.join("\n\n"));
    toast.success("AI brief copied");
  }

  useEffect(() => {
    if (!isAiBriefOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAiBriefOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isAiBriefOpen]);

  function exportReportCsv() {
    downloadCsv(
      `reports-${viewMode === "team-template" ? "latest-by-team-assessment" : "latest-by-team"}.csv`,
      filteredLatestRows.map((item) => ({
        team: item.teamName,
        assessment: item.title,
        template: item.templateName,
        category: item.templateCategory ?? "",
        period: item.periodLabel,
        submittedAt: item.submittedAt ?? "",
        overallScore: item.overallScore ?? "",
        strongestDomain: item.strongestDomain?.title ?? "",
        weakestDomain: item.weakestDomain?.title ?? ""
      }))
    );
  }

  function exportDomainSnapshotCsv() {
    downloadCsv(
      `reports-domain-snapshot.csv`,
      filteredDomainSnapshot.map((domain) => ({
        domain: domain.title,
        averageScore: domain.averageScore ?? "",
        teamCount: domain.teamCount
      }))
    );
  }

  function exportQuestionSnapshotCsv() {
    if (!selectedQuestionLabel) {
      return;
    }

    downloadCsv(
      `reports-question-snapshot.csv`,
      questionSnapshot.map((item) => ({
        team: item.teamName,
        template: item.templateName,
        domain: item.domainTitle,
        question: selectedQuestionLabel,
        selectedLabel: item.selectedLabel ?? "",
        selectedValue: item.selectedValue ?? ""
      }))
    );
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,_rgba(114,191,68,0.24),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(238,248,232,0.96))] text-foreground shadow-sm">
        <div className="grid gap-8 px-6 py-8 lg:grid-cols-[1.2fr,0.9fr] lg:px-8">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Reports</div>
            <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight">Current submitted picture across teams</h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              See the latest submitted assessment state, either per team overall or per team and assessment, then narrow the view by template, category, domain, or question when you need a more specific reporting slice.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <div className="rounded-full border border-primary/20 bg-white px-4 py-2 text-foreground">
                {filteredSummary.rowsCount} {viewMode === "team-template" ? "team-assessment pairs" : "teams"} in view
              </div>
              <div className="rounded-full border border-primary/20 bg-white px-4 py-2 text-foreground">
                Avg latest score {filteredSummary.averageLatestScore != null ? filteredSummary.averageLatestScore.toFixed(2) : "-"}
              </div>
              <div className="rounded-full border border-primary/20 bg-white px-4 py-2 text-foreground">
                {viewMode === "team-template" ? "Latest per team + assessment" : "Latest overall per team"}
              </div>
              <button
                className="rounded-full border border-primary/20 bg-white px-4 py-2 font-medium text-foreground transition hover:bg-accent"
                onClick={exportReportCsv}
                type="button"
              >
                Export current rows (.csv)
              </button>
              <button
                className="rounded-full border border-primary/20 bg-white px-4 py-2 font-medium text-foreground transition hover:bg-accent"
                onClick={selectedQuestionLabel ? exportQuestionSnapshotCsv : exportDomainSnapshotCsv}
                type="button"
              >
                {selectedQuestionLabel ? "Export question snapshot (.csv)" : "Export domain snapshot (.csv)"}
              </button>
              <button
                className="rounded-full border border-primary/20 bg-white px-4 py-2 font-medium text-foreground transition hover:bg-accent"
                onClick={() => window.print()}
                type="button"
              >
                Export PDF
              </button>
              {aiEnabledForReports ? (
                <Button
                  className="rounded-full"
                  onClick={() => {
                    setIsAiBriefOpen(true);
                    if (!aiBriefMutation.data && !aiBriefMutation.isPending) {
                      aiBriefMutation.mutate(false);
                    }
                  }}
                  type="button"
                  variant="outline"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Brief
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.5rem] border border-primary/15 bg-white/92 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-sm text-primary">
                <BarChart3 className="h-4 w-4" />
                Highest row in view
              </div>
              <div className="mt-4 text-2xl font-semibold">
                {filteredSummary.highestRow
                  ? `${filteredSummary.highestRow.teamName}${viewMode === "team-template" ? ` · ${filteredSummary.highestRow.templateName}` : ""}`
                  : "-"}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {filteredSummary.highestRow?.overallScore != null ? filteredSummary.highestRow.overallScore.toFixed(2) : "No score"}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-primary/15 bg-white/92 p-4 backdrop-blur">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Layers3 className="h-4 w-4" />
                Most common weakest domain
              </div>
              <div className="mt-4 text-2xl font-semibold">{filteredSummary.mostCommonWeakestDomain?.title ?? "-"}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {filteredSummary.mostCommonWeakestDomain ? `${filteredSummary.mostCommonWeakestDomain.teamCount} rows` : "No recurring gap yet"}
              </div>
            </div>
            <div className="rounded-[1.5rem] border border-primary/15 bg-white/92 p-4 backdrop-blur sm:col-span-2">
              <div className="flex items-center gap-2 text-sm text-primary">
                <Target className="h-4 w-4" />
                Current report lens
              </div>
              <div className="mt-4 text-lg font-semibold">
                {selectedQuestionLabel
                  ?? (domainFilter !== "all"
                    ? domainFilter
                    : viewMode === "team-template"
                      ? "Latest submitted state per team and assessment"
                      : "Latest submitted state per team")}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">Use the filters below to move from the full current-state picture into one domain or one question across teams.</div>
            </div>
          </div>
        </div>
      </section>

      <Card className="border-border bg-white/90">
        <CardHeader className="pb-4">
          <CardTitle>Current state selection</CardTitle>
          <CardDescription>Pick whether the report should show one latest row per team, or one latest row per team and assessment template.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs onValueChange={(value) => setViewMode(value as "team" | "team-template")} value={viewMode}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="team">Latest per team</TabsTrigger>
              <TabsTrigger value="team-template">Latest per team + assessment</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="rounded-[1.1rem] border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{selectionText}</div>
        </CardContent>
      </Card>

      {aiEnabledForReports ? (
        <Card className="border-border bg-white/90">
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>AI Brief</CardTitle>
                <CardDescription>
                  Optional narrative layer for the current filtered reporting view. Keep the operational table and charts primary, and open AI only when you want synthesis.
                </CardDescription>
              </div>
              <Button
                onClick={() => {
                  setIsAiBriefOpen(true);
                  if (!aiBriefMutation.data && !aiBriefMutation.isPending) {
                    aiBriefMutation.mutate(false);
                  }
                }}
                type="button"
                variant="outline"
              >
                <Bot className="mr-2 h-4 w-4" />
                Open AI Brief
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-[1.1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
              AI summarization stays separate from the reporting workspace so users can opt into narrative guidance without losing access to the raw reporting surfaces.
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="border-primary/20 bg-accent">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">{viewMode === "team-template" ? "Current rows" : "Teams covered"}</div>
            <div className="mt-3 text-3xl font-semibold text-foreground">{filteredSummary.rowsCount}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {viewMode === "team-template" ? "Team and assessment pairs in the current view." : "Teams with at least one submitted run in the current view."}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-white">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Average latest score</div>
            <div className="mt-3 text-3xl font-semibold text-foreground">
              {filteredSummary.averageLatestScore != null ? filteredSummary.averageLatestScore.toFixed(2) : "-"}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {viewMode === "team-template" ? "Average of each current team + assessment latest score." : "Average of each team’s latest submitted overall score."}
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-accent/60">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Highest current row</div>
            <div className="mt-3 text-2xl font-semibold text-foreground">
              {filteredSummary.highestRow
                ? `${filteredSummary.highestRow.teamName}${viewMode === "team-template" ? ` · ${filteredSummary.highestRow.templateName}` : ""}`
                : "-"}
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {filteredSummary.highestRow?.overallScore != null ? filteredSummary.highestRow.overallScore.toFixed(2) : "No score"}
            </div>
          </CardContent>
        </Card>
        <Card className="border-border bg-secondary">
          <CardContent className="p-5">
            <div className="text-sm text-muted-foreground">Common gap</div>
            <div className="mt-3 text-2xl font-semibold text-foreground">{filteredSummary.mostCommonWeakestDomain?.title ?? "-"}</div>
            <div className="mt-2 text-sm text-muted-foreground">
              {filteredSummary.mostCommonWeakestDomain ? `${filteredSummary.mostCommonWeakestDomain.teamCount} rows` : "No recurring weakest domain"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border bg-white/90">
        <CardHeader className="pb-4">
          <CardTitle>Filter current picture</CardTitle>
          <CardDescription>Search across teams, templates, domains, and questions without turning the page into a heavy reporting console.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="space-y-2 xl:col-span-2">
              <Label>Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input className="pl-9" placeholder="Team, template, period, domain, or question" value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Team</Label>
              <Select options={[{ value: "all", label: "All teams" }, ...teamOptions]} value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Template</Label>
              <Select options={[{ value: "all", label: "All templates" }, ...templateOptions]} value={templateFilter} onChange={(event) => setTemplateFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select options={[{ value: "all", label: "All categories" }, ...categoryOptions]} value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Domain</Label>
              <Select options={[{ value: "all", label: "All domains" }, ...domainOptions]} value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1.2fr,auto]">
            <div className="space-y-2">
              <Label>Question</Label>
              <Select
                options={[{ value: "all", label: domainFilter === "all" ? "All questions" : `All questions in ${domainFilter}` }, ...questionOptions]}
                value={questionFilter}
                onChange={(event) => setQuestionFilter(event.target.value)}
              />
            </div>
            <div className="flex items-end">
              <button
                className="inline-flex h-10 items-center justify-center rounded-xl border px-4 text-sm font-medium transition hover:bg-muted"
                onClick={() => {
                  setSearch("");
                  setTeamFilter("all");
                  setTemplateFilter("all");
                  setCategoryFilter("all");
                  setDomainFilter("all");
                  setQuestionFilter("all");
                }}
                type="button"
              >
                Reset filters
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.95fr]">
        <Card className="overflow-hidden border-border">
          <CardHeader>
            <CardTitle>{viewMode === "team-template" ? "Latest score by team and assessment" : "Latest score by team"}</CardTitle>
            <CardDescription>
              {selectedQuestionLabel
                ? "Current-state context while a specific question filter is active."
                : viewMode === "team-template"
                  ? "Current score position based on each team and assessment template latest run."
                  : "Current score position based on each team’s latest submitted run."}
            </CardDescription>
          </CardHeader>
          <CardContent className="h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 12 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis domain={[0, 5]} type="number" />
                <YAxis dataKey="label" type="category" width={viewMode === "team-template" ? 180 : 140} />
                <Tooltip />
                <Bar dataKey="overallScore" fill="hsl(var(--primary))" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border bg-secondary/60">
          <CardHeader>
            <CardTitle>{selectedQuestionLabel ? "Question snapshot" : "Domain snapshot"}</CardTitle>
            <CardDescription>
              {selectedQuestionLabel
                ? "Latest answer distribution for the selected question across the filtered current rows."
                : "Average latest domain score across the filtered current rows."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedQuestionLabel
              ? questionSnapshot.slice(0, 8).map((item) => (
                  <div className="flex items-start justify-between gap-3 rounded-[1.1rem] border bg-white px-4 py-3" key={`question-snapshot-${item.rowKey}`}>
                    <div>
                      <div className="font-medium">
                        {item.teamName}
                        {viewMode === "team-template" ? <span className="text-muted-foreground"> · {item.templateName}</span> : null}
                      </div>
                      <div className="text-sm text-muted-foreground">{item.domainTitle}</div>
                    </div>
                    <div className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreTone(item.selectedValue)}`}>
                      {item.selectedLabel ? `${item.selectedLabel}${item.selectedValue ? ` (${item.selectedValue})` : ""}` : "No answer"}
                    </div>
                  </div>
                ))
              : filteredDomainSnapshot.slice(0, 8).map((domain) => (
                  <div className="space-y-2" key={`domain-snapshot-${domain.title}`}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium">{domain.title}</span>
                      <span className="text-muted-foreground">
                        {domain.averageScore != null ? domain.averageScore.toFixed(2) : "-"} · {domain.teamCount} rows
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-border">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${((domain.averageScore ?? 0) / 5) * 100}%` }} />
                    </div>
                  </div>
                ))}

            {(selectedQuestionLabel ? questionSnapshot.length === 0 : filteredDomainSnapshot.length === 0) ? (
              <div className="rounded-[1.1rem] border border-dashed bg-white px-4 py-8 text-sm text-muted-foreground">No snapshot data matches the current filters.</div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden border-border">
        <CardHeader className="border-b bg-secondary/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>{viewMode === "team-template" ? "Current state by team and assessment" : "Latest submitted by team"}</CardTitle>
              <CardDescription>
                {viewMode === "team-template"
                  ? "One row per team and assessment template, using only the newest submitted run as the current baseline."
                  : "One row per team, using only its latest submitted assessment as the current reporting baseline."}
              </CardDescription>
            </div>
            <div className="rounded-full bg-white px-4 py-2 text-sm text-muted-foreground">
              {filteredLatestRows.length} {viewMode === "team-template" ? "rows" : "teams"} in view
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Strongest domain</TableHead>
                <TableHead>Weakest domain</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLatestRows.map((item: LatestByTeamReport) => (
                <TableRow key={`report-latest-row-${item.assessmentRunId}`}>
                  <TableCell className="font-medium">{item.teamName}</TableCell>
                  <TableCell>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.templateCategory ?? "Uncategorized template"}</div>
                  </TableCell>
                  <TableCell>{item.templateName}</TableCell>
                  <TableCell>{item.periodLabel}</TableCell>
                  <TableCell>{formatDate(item.submittedAt)}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${scoreTone(item.overallScore)}`}>
                      {item.overallScore != null ? item.overallScore.toFixed(2) : "-"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {item.strongestDomain ? `${item.strongestDomain.title} (${(item.strongestDomain.score ?? 0).toFixed(2)})` : "-"}
                  </TableCell>
                  <TableCell>
                    {item.weakestDomain ? `${item.weakestDomain.title} (${(item.weakestDomain.score ?? 0).toFixed(2)})` : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link className="inline-flex items-center gap-2 text-sm font-medium text-primary" to={`/assessments/${item.assessmentRunId}/results`}>
                      View results
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredLatestRows.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={9}>
                    No current-state reports match the current filters.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {isAiBriefOpen ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-slate-950/35 backdrop-blur-sm"
          onClick={() => setIsAiBriefOpen(false)}
        >
          <div
            className="h-full w-full max-w-[560px] overflow-y-auto border-l border-border/80 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-border/80 bg-white/95 px-5 py-4 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">AI Brief</div>
                  <h2 className="mt-1 text-xl font-semibold text-foreground">Reports narrative</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Optional AI synthesis for the current filtered reporting view. Verify conclusions against the rows, charts, and snapshots.
                  </p>
                </div>
                <Button onClick={() => setIsAiBriefOpen(false)} type="button" variant="outline">
                  Close
                </Button>
              </div>
            </div>

            <div className="space-y-5 px-5 py-5">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{viewMode === "team-template" ? "Latest per team + assessment" : "Latest per team"}</Badge>
                {selectedDomainLabel ? <Badge variant="outline">{selectedDomainLabel}</Badge> : null}
                {selectedQuestionLabel ? <Badge variant="outline">{selectedQuestionLabel}</Badge> : null}
                {aiBriefMutation.data?.providerLabel ? <Badge variant="outline">{aiBriefMutation.data.providerLabel}</Badge> : null}
                <Badge variant="outline">Generated from current filtered submitted data only</Badge>
                {aiBriefMutation.data?.cached ? (
                  <Badge variant="outline">
                    {aiBriefMutation.data.cachedAt ? `Loaded from cached AI brief · ${formatDate(aiBriefMutation.data.cachedAt)}` : "Loaded from cached AI brief"}
                  </Badge>
                ) : null}
                {aiBriefMutation.data ? (
                  <Button onClick={copyAiBrief} type="button" variant="outline">
                    Copy brief
                  </Button>
                ) : null}
                <Button
                  disabled={aiBriefMutation.isPending}
                  onClick={() => aiBriefMutation.mutate(true)}
                  type="button"
                  variant="outline"
                >
                  {aiBriefMutation.isPending ? "Refreshing..." : "Regenerate"}
                </Button>
              </div>

              {aiBriefMutation.isPending && !aiBriefMutation.data ? (
                <div className="space-y-3 rounded-[1.25rem] border bg-muted/20 p-5">
                  <div className="h-5 w-48 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-11/12 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-10/12 animate-pulse rounded-full bg-muted" />
                </div>
              ) : null}

              {aiBriefMutation.data ? (
                <>
                  <div className="rounded-[1.35rem] border border-primary/20 bg-primary/5 p-5">
                    <div className="text-sm font-medium text-muted-foreground">Headline</div>
                    <div className="mt-2 text-xl font-semibold text-foreground">{aiBriefMutation.data.headline}</div>
                    <p className="mt-3 text-sm leading-7 text-foreground">{aiBriefMutation.data.summary}</p>
                    <div className="mt-4 rounded-xl border border-primary/15 bg-white/80 px-3 py-3 text-xs leading-6 text-muted-foreground">
                      AI-generated reporting narrative. Verify important conclusions against the current rows, charts, and snapshots before using it for decisions.
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-[1.25rem] border bg-white p-4">
                      <div className="text-sm font-semibold text-foreground">Observed patterns</div>
                      <div className="mt-3 space-y-2">
                        {aiBriefMutation.data.patterns.map((item, index) => (
                          <div className="rounded-xl bg-accent/60 px-3 py-2 text-sm text-foreground" key={`reports-pattern-${index}`}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[1.25rem] border bg-white p-4">
                      <div className="text-sm font-semibold text-foreground">Watchouts</div>
                      <div className="mt-3 space-y-2">
                        {aiBriefMutation.data.risks.map((item, index) => (
                          <div className="rounded-xl bg-secondary px-3 py-2 text-sm text-foreground" key={`reports-risk-${index}`}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border bg-white p-4">
                    <div className="text-sm font-semibold text-foreground">General recommendations</div>
                    <div className="mt-3 space-y-2">
                      {aiBriefMutation.data.recommendations.map((item, index) => (
                        <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-3 text-sm text-foreground" key={`reports-recommendation-${index}`}>
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[1.25rem] border bg-muted/20 p-4">
                    <div className="text-sm font-semibold text-foreground">Leadership brief</div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground">{aiBriefMutation.data.leadershipBrief}</p>
                  </div>

                  <div className="rounded-[1.1rem] border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
                    Last refreshed: {aiBriefMutation.data.cachedAt ? formatDate(aiBriefMutation.data.cachedAt) : "Just now"}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

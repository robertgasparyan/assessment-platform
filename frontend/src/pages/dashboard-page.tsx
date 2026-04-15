import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardCheck, ClipboardList, FilePlus2 } from "lucide-react";
import { BarChart, Bar, CartesianGrid, LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { DashboardSummary } from "@/types";

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

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getDueState(dueDate: string | null) {
  if (!dueDate) {
    return null;
  }

  const due = new Date(dueDate);
  const today = startOfToday();
  const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: "Overdue", variant: "secondary" as const };
  }

  if (diffDays <= 3) {
    return { label: "Due soon", variant: "default" as const };
  }

  return { label: "Scheduled", variant: "outline" as const };
}

export function DashboardPage() {
  const [teamSearch, setTeamSearch] = useState("");
  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: () => api.get<DashboardSummary>("/dashboard/summary")
  });
  const trendQuery = useQuery({
    queryKey: ["dashboard-trends"],
    queryFn: () => api.get<Array<{ periodLabel: string; averageScore: number }>>("/dashboard/trends")
  });
  const comparisonQuery = useQuery({
    queryKey: ["dashboard-comparison"],
    queryFn: () => api.get<Array<{ teamName: string; overallScore: number; periodLabel: string }>>("/dashboard/comparison")
  });

  const summary = summaryQuery.data;
  const quickLinks = [
    {
      to: "/assessments?tab=create",
      title: "Create assessment",
      description: "Start a new run from a published template.",
      icon: FilePlus2,
      tone: "default"
    },
    {
      to: "/assessments?tab=active",
      title: "Active assessments",
      description: "Continue drafts and in-progress team runs.",
      icon: ClipboardList,
      tone: "active"
    },
    {
      to: "/assessments?tab=submitted",
      title: "Submitted assessments",
      description: "Jump straight to completed runs and results.",
      icon: ClipboardCheck,
      tone: "submitted"
    }
  ];
  const filteredLatestSubmittedByTeam = useMemo(() => {
    const query = teamSearch.trim().toLowerCase();
    return (summary?.latestSubmittedByTeam ?? []).filter((run) => {
      if (!query) {
        return true;
      }

      return (
        run.teamName.toLowerCase().includes(query)
        || run.title.toLowerCase().includes(query)
        || run.templateName.toLowerCase().includes(query)
      );
    });
  }, [summary?.latestSubmittedByTeam, teamSearch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Overview</div>
          <h1 className="mt-2 text-4xl font-semibold">Assessment operations dashboard</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Monitor template coverage, team assessment progress, and trend lines across submitted assessment periods.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard hint="Template library" label="Templates" value={summary?.templates ?? "-"} />
        <StatCard hint="All assessment runs" label="Runs" value={summary?.runs ?? "-"} />
        <StatCard hint="Completed assessments" label="Submitted" value={summary?.submittedRuns ?? "-"} />
        <StatCard hint="Active collaborative drafts" label="Drafts" value={summary?.draftRuns ?? "-"} />
        <StatCard hint="Teams available for assignment" label="Teams" value={summary?.teams ?? "-"} />
      </div>

      {summary ? (
        <Card>
          <CardHeader>
            <CardTitle>My work</CardTitle>
            <CardDescription>
              {summary.currentUser.role === "ADMIN" || summary.currentUser.role === "TEMPLATE_MANAGER"
                ? "Your directly assigned active runs, plus team-owned work that still needs attention."
                : "Active assessments assigned to you or visible through your team memberships."}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">Assigned to me</div>
                  <div className="text-sm text-muted-foreground">Runs where you are the explicit owner.</div>
                </div>
                <Badge variant="outline">{summary.myWork.assignedRuns.length}</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {summary.myWork.assignedRuns.length ? (
                  summary.myWork.assignedRuns.map((run) => {
                    const dueState = getDueState(run.dueDate);
                    return (
                      <div className="rounded-[1rem] border border-border/80 p-3" key={`assigned-${run.id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link className="font-medium text-primary" to={`/assessments/${run.id}`} state={{ returnTo: "/assessments?tab=active" }}>
                              {run.title}
                            </Link>
                            <div className="mt-1 text-sm text-muted-foreground">{run.teamName}</div>
                          </div>
                          <Badge variant={run.status === "IN_PROGRESS" ? "default" : "secondary"}>{run.status}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>Due {formatDate(run.dueDate)}</span>
                          {dueState ? <Badge variant={dueState.variant}>{dueState.label}</Badge> : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No active runs are currently assigned to you.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">My team queue</div>
                  <div className="text-sm text-muted-foreground">Other active runs visible through your team memberships.</div>
                </div>
                <Badge variant="outline">{summary.myWork.teamRuns.length}</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {summary.myWork.teamRuns.length ? (
                  summary.myWork.teamRuns.map((run) => {
                    const dueState = getDueState(run.dueDate);
                    return (
                      <div className="rounded-[1rem] border border-border/80 p-3" key={`team-${run.id}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Link className="font-medium text-primary" to={`/assessments/${run.id}`} state={{ returnTo: "/assessments?tab=active" }}>
                              {run.title}
                            </Link>
                            <div className="mt-1 text-sm text-muted-foreground">{run.teamName}</div>
                          </div>
                          <Badge variant={run.status === "IN_PROGRESS" ? "default" : "secondary"}>{run.status}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span>Due {formatDate(run.dueDate)}</span>
                          {dueState ? <Badge variant={dueState.variant}>{dueState.label}</Badge> : null}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    No additional team runs currently need attention.
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Quick links</CardTitle>
          <CardDescription>Jump directly into the three assessment workflows used most often.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {quickLinks.map((item) => {
            const Icon = item.icon;
            const cardTone =
              item.tone === "active"
                ? "border-primary/25 bg-accent hover:border-primary/35 hover:bg-accent/80"
                : item.tone === "submitted"
                  ? "border-border bg-white hover:border-primary/30 hover:bg-muted/40"
                  : "border bg-white hover:border-primary/40 hover:bg-primary/5";
            const iconTone =
              item.tone === "active"
                ? "bg-primary/15 text-primary"
                : item.tone === "submitted"
                  ? "bg-secondary text-foreground"
                  : "bg-primary/10 text-primary";

            return (
              <Link
                className={`group rounded-[1.5rem] p-5 transition ${cardTone}`}
                key={item.to}
                to={item.to}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className={`rounded-2xl p-3 ${iconTone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <ArrowRight
                    className={`h-4 w-4 transition group-hover:translate-x-0.5 ${
                      item.tone === "active"
                        ? "text-primary"
                        : item.tone === "submitted"
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-primary"
                    }`}
                  />
                </div>
                <div className="mt-5 text-lg font-semibold">{item.title}</div>
                <div className="mt-2 text-sm text-muted-foreground">{item.description}</div>
              </Link>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Latest submitted by team</CardTitle>
              <CardDescription>The most recent completed assessment for each team, shown in a compact operational view.</CardDescription>
            </div>
            <Link className="text-sm font-medium text-primary" to="/assessments?tab=submitted">
              Open submitted assessments
            </Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-sm">
            <Input
              placeholder="Search team, assessment, or template"
              value={teamSearch}
              onChange={(event) => setTeamSearch(event.target.value)}
            />
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Team</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLatestSubmittedByTeam.map((run) => (
                <TableRow key={`latest-submitted-team-${run.id}`}>
                  <TableCell className="font-medium">{run.teamName}</TableCell>
                  <TableCell>
                    <Link className="font-medium text-primary" to={`/assessments/${run.id}/results`}>
                      {run.title}
                    </Link>
                  </TableCell>
                  <TableCell>{run.templateName}</TableCell>
                  <TableCell>{run.periodLabel}</TableCell>
                  <TableCell>{formatDate(run.submittedAt)}</TableCell>
                  <TableCell>{typeof run.overallScore === "number" ? run.overallScore.toFixed(2) : "-"}</TableCell>
                </TableRow>
              ))}
              {!filteredLatestSubmittedByTeam.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={6}>
                    No submitted team assessments match this search.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.3fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Period trend</CardTitle>
            <CardDescription>Average submitted score across the organization over time.</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendQuery.data ?? []}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis dataKey="periodLabel" />
                <YAxis domain={[0, 5]} />
                <Tooltip />
                <Line dataKey="averageScore" stroke="hsl(var(--primary))" strokeWidth={3} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Latest submitted team comparison</CardTitle>
            <CardDescription>Current maturity score by team from the most recent submitted run.</CardDescription>
          </CardHeader>
          <CardContent className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={comparisonQuery.data ?? []} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                <XAxis domain={[0, 5]} type="number" />
                <YAxis dataKey="teamName" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="overallScore" fill="hsl(var(--primary))" radius={[0, 10, 10, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest activity</CardTitle>
          <CardDescription>Recent assessments across teams.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(summary?.latestRuns ?? []).map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <Link className="font-medium text-primary" to={`/assessments/${run.id}`}>
                      {run.title}
                    </Link>
                  </TableCell>
                  <TableCell>{run.teamName}</TableCell>
                  <TableCell>{run.templateName}</TableCell>
                  <TableCell>{run.periodLabel}</TableCell>
                  <TableCell>
                    <Badge variant={run.status === "SUBMITTED" ? "success" : "secondary"}>{run.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

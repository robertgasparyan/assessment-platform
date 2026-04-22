import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ClipboardList, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { TeamGroupDetail } from "@/types";

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

export function TeamGroupDetailPage() {
  const { groupId } = useParams();

  const groupQuery = useQuery({
    queryKey: ["team-group-detail", groupId],
    queryFn: () => api.get<TeamGroupDetail>(`/team-groups/${groupId}`),
    enabled: Boolean(groupId)
  });

  const group = groupQuery.data;
  const activeRuns = group?.teams.flatMap((team) => team.activeRuns.map((run) => ({ ...run, team }))) ?? [];
  const submittedRuns = group?.teams.flatMap((team) => team.submittedRuns.map((run) => ({ ...run, team }))) ?? [];
  const latestSubmitted = [...submittedRuns].sort(
    (left, right) => (right.submittedAt ? new Date(right.submittedAt).getTime() : 0) - (left.submittedAt ? new Date(left.submittedAt).getTime() : 0)
  );

  if (groupQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-muted" />
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted/70" />
      </div>
    );
  }

  if (!group) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Group not found</CardTitle>
          <CardDescription>The group may not exist or may not be visible to your account.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary" to="/teams">
        <ArrowLeft className="h-4 w-4" />
        Back to teams
      </Link>

      <div className="rounded-[2rem] border bg-gradient-to-br from-primary/10 via-white to-accent/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Team group</div>
            <h1 className="mt-2 text-4xl font-semibold">{group.name}</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">{group.description || "No description has been added for this group yet."}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Teams</div>
              <div className="mt-1 text-2xl font-semibold">{group.teams.length}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active runs</div>
              <div className="mt-1 text-2xl font-semibold">{activeRuns.length}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Submitted</div>
              <div className="mt-1 text-2xl font-semibold">{submittedRuns.length}</div>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Teams in group
          </CardTitle>
          <CardDescription>Teams currently categorized under this group.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {group.teams.map((team) => (
            <div className="rounded-[1.1rem] border bg-white p-4" key={team.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link className="font-semibold transition hover:text-primary" to={`/teams/${team.id}`}>
                    {team.name}
                  </Link>
                  <div className="mt-1 text-sm text-muted-foreground">{team.description || "No description"}</div>
                </div>
                <Link className="text-primary" to={`/teams/${team.id}`}>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full border px-2.5 py-1">{team.counts.members} members</span>
                <span className="rounded-full border px-2.5 py-1">{team.counts.assessmentRuns} runs</span>
              </div>
            </div>
          ))}
          {group.teams.length === 0 ? (
            <div className="rounded-[1.1rem] border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              No teams are assigned to this group yet.
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              Active assessments
            </CardTitle>
            <CardDescription>Open work across all teams in this group.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {activeRuns.slice(0, 10).map((run) => (
              <div className="rounded-[1.1rem] border bg-white p-4" key={run.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link className="font-semibold transition hover:text-primary" to={`/assessments/${run.id}`}>
                      {run.title}
                    </Link>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {run.team.name} · {run.templateVersion.name} · {run.periodLabel}
                    </div>
                  </div>
                  <Badge variant="outline">{run.status.replace(/_/g, " ")}</Badge>
                </div>
              </div>
            ))}
            {activeRuns.length === 0 ? <div className="rounded-[1.1rem] border border-dashed p-6 text-sm text-muted-foreground">No active assessments in this group.</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest submitted</CardTitle>
            <CardDescription>Recent completed assessments across the group.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {latestSubmitted.slice(0, 10).map((run) => (
              <div className="rounded-[1.1rem] border bg-white p-4" key={run.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link className="font-semibold transition hover:text-primary" to={`/assessments/${run.id}/results`}>
                      {run.title}
                    </Link>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {run.team.name} · {run.templateVersion.name} · {run.periodLabel}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Submitted {formatDate(run.submittedAt)}</div>
                  </div>
                  <Badge>{typeof run.overallScore === "number" ? run.overallScore.toFixed(2) : "Submitted"}</Badge>
                </div>
              </div>
            ))}
            {latestSubmitted.length === 0 ? <div className="rounded-[1.1rem] border border-dashed p-6 text-sm text-muted-foreground">No submitted assessments in this group yet.</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

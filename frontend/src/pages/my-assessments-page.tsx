import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatCard } from "@/components/stat-card";
import { api } from "@/lib/api";
import type { AssessmentParticipantStatus, AssessmentRunSummary, MyAssessmentsSummary } from "@/types";

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function RunTable({
  description,
  emptyMessage,
  individual,
  runs,
  submitted
}: {
  description: string;
  emptyMessage: string;
  individual?: boolean;
  runs: Array<AssessmentRunSummary & { participantStatus?: AssessmentParticipantStatus }>;
  submitted: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {runs.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="font-medium">{run.title}</div>
                      {run.guestParticipationEnabled ? <Badge variant="outline">Guest-enabled</Badge> : null}
                      {run.responseMode === "INDIVIDUAL_AGGREGATED" ? <Badge variant="secondary">Individual responses</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell>{run.team.name}</TableCell>
                  <TableCell>{run.periodLabel}</TableCell>
                  <TableCell>{formatDate(run.dueDate)}</TableCell>
                  <TableCell>
                    <Badge variant={run.status === "SUBMITTED" ? "success" : run.status === "IN_PROGRESS" ? "default" : "secondary"}>
                      {individual && run.participantStatus ? run.participantStatus : run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      className="text-sm font-medium text-primary"
                      state={{ returnTo: submitted ? "/my-assessments" : "/my-assessments" }}
                      to={submitted ? `/assessments/${run.id}/results` : individual ? `/assessments/${run.id}/participant` : `/assessments/${run.id}`}
                    >
                      {submitted ? "View results" : individual ? "Answer" : "Open run"}
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="rounded-[1.25rem] border border-dashed px-4 py-8 text-sm text-muted-foreground">{emptyMessage}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function MyAssessmentsPage() {
  const myAssessmentsQuery = useQuery({
    queryKey: ["my-assessments"],
    queryFn: () => api.get<MyAssessmentsSummary>("/my-assessments")
  });

  const summary = myAssessmentsQuery.data;
  const allActive = useMemo(
    () => [...(summary?.assignedActive ?? []), ...(summary?.teamActive ?? [])],
    [summary?.assignedActive, summary?.teamActive]
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Personal workspace</div>
        <h1 className="mt-2 text-4xl font-semibold">My assessments</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Review the runs assigned to you, track active work visible through your team memberships, and jump back into submitted results.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard hint="Runs where you are the explicit owner" label="Assigned to me" value={summary?.assignedActive.length ?? "-"} />
        <StatCard hint="Individual team-member responses assigned to you" label="My responses" value={summary?.individualActive.length ?? "-"} />
        <StatCard hint="Other active team work you can contribute to" label="Team queue" value={summary?.teamActive.length ?? "-"} />
        <StatCard hint="Submitted runs you can review" label="Submitted access" value={summary?.submittedAccessible.length ?? "-"} />
      </div>

      <RunTable
        description="Individual team-member assessments where your response is collected separately."
        emptyMessage="No individual responses are currently assigned to you."
        individual
        runs={summary?.individualActive ?? []}
        submitted={false}
      />
      <RunTable
        description="Runs where you are the current assigned owner."
        emptyMessage="No active runs are currently assigned to you."
        runs={summary?.assignedActive ?? []}
        submitted={false}
      />
      <RunTable
        description="Other active runs that are visible through your team memberships."
        emptyMessage="No additional team runs are currently available."
        runs={summary?.teamActive ?? []}
        submitted={false}
      />
      <RunTable
        description="Submitted runs you can review or compare."
        emptyMessage="No submitted runs are currently visible to you."
        runs={summary?.submittedAccessible ?? []}
        submitted={true}
      />

      {allActive.length ? (
        <div className="text-sm text-muted-foreground">
          Tip: use <Link className="font-medium text-primary" to="/assessments?tab=active">Assessments</Link> when you need broader filters or operational actions.
        </div>
      ) : null}
    </div>
  );
}

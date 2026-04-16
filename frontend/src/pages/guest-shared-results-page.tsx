import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { GuestSharedAssessmentResults } from "@/types";

function formatScore(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "-";
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

export function GuestSharedResultsPage() {
  const { token = "" } = useParams();
  const resultsQuery = useQuery({
    queryKey: ["guest-shared-results", token],
    queryFn: () => api.get<GuestSharedAssessmentResults>(`/guest-assessments/${token}/results`)
  });

  const results = resultsQuery.data;
  const domainBars = useMemo(
    () =>
      (results?.domains ?? []).map((domain) => ({
        domain: domain.title,
        score: domain.averageScore ?? 0
      })),
    [results?.domains]
  );

  if (resultsQuery.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading guest results...</div>;
  }

  if (!results) {
    return <div className="p-8 text-sm text-muted-foreground">Guest results are unavailable.</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,_rgba(114,191,68,0.22),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(238,248,232,0.96))] px-6 py-8 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Guest results</div>
          <h1 className="mt-3 text-4xl font-semibold">{results.title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            {results.team.name} · {results.periodLabel} · Template v{results.templateVersion.versionNumber}
          </p>
          {results.guestAccess.inviteLabel ? (
            <div className="mt-3">
              <Badge variant="outline">Invite: {results.guestAccess.inviteLabel}</Badge>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="success">Submitted</Badge>
            <Badge variant="outline">
              Shared by {results.guestAccess.guestDisplayName || "Guest participant"}
            </Badge>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">Overall score</div>
              <div className="mt-3 text-3xl font-semibold">{formatScore(results.overallScore)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">Submitted</div>
              <div className="mt-3 text-xl font-semibold">{formatDate(results.submittedAt)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">Strongest domain</div>
              <div className="mt-3 text-xl font-semibold">{results.highlights.strongestDomain?.title ?? "-"}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <div className="text-sm text-muted-foreground">Weakest domain</div>
              <div className="mt-3 text-xl font-semibold">{results.highlights.weakestDomain?.title ?? "-"}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
          <Card>
            <CardHeader>
              <CardTitle>Domain score bars</CardTitle>
              <CardDescription>Current domain-level assessment picture.</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={domainBars} layout="vertical" margin={{ left: 20 }}>
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
              <CardTitle>Focus areas</CardTitle>
              <CardDescription>Lowest-scoring questions in the submitted assessment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {results.highlights.focusAreas.map((item) => (
                <div className="rounded-[1.1rem] border bg-white px-4 py-3" key={`${item.domainTitle}-${item.prompt}`}>
                  <div className="font-medium">{item.prompt}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {item.domainTitle} · {item.selectedLabel ?? "-"} {item.selectedValue ? `(${item.selectedValue})` : ""}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Detailed answers</CardTitle>
            <CardDescription>Question-by-question submitted selections for this shared assessment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {results.domains.map((domain) => (
              <div className="space-y-3" key={domain.id}>
                <div>
                  <div className="text-lg font-semibold">{domain.title}</div>
                  <div className="text-sm text-muted-foreground">{domain.description ?? "No domain description provided."}</div>
                </div>
                <div className="space-y-3">
                  {domain.questions.map((question) => (
                    <div className="rounded-[1.1rem] border bg-white px-4 py-3" key={question.id}>
                      <div className="font-medium">{question.prompt}</div>
                      <div className="mt-2 text-sm text-muted-foreground">
                        {question.response?.selectedLabel ?? "No answer"} {question.response?.selectedValue ? `(${question.response.selectedValue})` : ""}
                      </div>
                      {question.response?.comment ? <div className="mt-2 text-sm text-foreground">{question.response.comment}</div> : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

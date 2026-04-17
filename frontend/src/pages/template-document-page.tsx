import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { TemplateDetail } from "@/types";

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

export function TemplateDocumentPage() {
  const navigate = useNavigate();
  const { templateId = "" } = useParams();
  const templateDetailQuery = useQuery({
    queryKey: ["template-document", templateId],
    queryFn: () => api.get<TemplateDetail>(`/templates/${templateId}`),
    enabled: Boolean(templateId)
  });

  const detail = templateDetailQuery.data;
  const latestVersion = detail?.versions[0] ?? null;

  useEffect(() => {
    if (!detail || !latestVersion) {
      return;
    }

    document.title = `${detail.name} v${latestVersion.versionNumber} | Template document`;
  }, [detail, latestVersion]);

  if (templateDetailQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          <div className="h-4 w-32 animate-pulse rounded-full bg-muted" />
          <div className="h-10 w-80 animate-pulse rounded-2xl bg-muted" />
        </div>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="rounded-[1.5rem] border bg-white p-6" key={`template-document-loading-${index}`}>
              <div className="h-5 w-40 animate-pulse rounded-full bg-muted" />
              <div className="mt-4 h-28 animate-pulse rounded-[1.25rem] bg-muted/70" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!detail || !latestVersion) {
    return (
      <div className="space-y-6">
        <div className="print:hidden">
          <Button onClick={() => navigate("/templates")} type="button" variant="ghost">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to templates
          </Button>
        </div>
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Template document is not available for this selection.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Button onClick={() => navigate("/templates")} type="button" variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to templates
        </Button>
        <Button onClick={() => window.print()} type="button">
          <Printer className="mr-2 h-4 w-4" />
          Print / Export PDF
        </Button>
      </div>

      <section className="rounded-[2rem] border bg-white px-8 py-8 shadow-sm print:rounded-none print:border-0 print:px-0 print:py-0 print:shadow-none">
        <div className="border-b border-border/80 pb-6">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Template document</div>
          <h1 className="mt-3 text-4xl font-semibold text-foreground">{detail.name}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant="outline">Version {latestVersion.versionNumber}</Badge>
            <Badge variant="secondary">{detail.category || "Uncategorized"}</Badge>
            <Badge variant="outline">{latestVersion.domains.length} domains</Badge>
            <Badge variant="outline">{detail.usage.totalRuns} runs</Badge>
          </div>
          {detail.description ? (
            <p className="mt-5 max-w-4xl text-sm leading-7 text-muted-foreground">{detail.description}</p>
          ) : null}
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-[1rem] border bg-muted/20 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Slug</div>
              <div className="mt-1 text-sm font-medium text-foreground">{detail.slug}</div>
            </div>
            <div className="rounded-[1rem] border bg-muted/20 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recent usage</div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {detail.usage.recentRuns[0] ? formatDate(detail.usage.recentRuns[0].updatedAt) : "No recent runs"}
              </div>
            </div>
            <div className="rounded-[1rem] border bg-muted/20 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Scale</div>
              <div className="mt-1 text-sm font-medium text-foreground">
                {latestVersion.scoringLabels.length} maturity levels
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 space-y-8">
          {latestVersion.domains.map((domain, domainIndex) => (
            <section className="break-inside-avoid space-y-4" key={domain.id ?? `${detail.id}-domain-${domainIndex}`}>
              <div className="rounded-[1.5rem] border border-primary/15 bg-primary/5 px-5 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Domain {domainIndex + 1}</div>
                <h2 className="mt-2 text-2xl font-semibold text-foreground">{domain.title}</h2>
                {domain.description ? <p className="mt-2 text-sm leading-7 text-muted-foreground">{domain.description}</p> : null}
              </div>

              <div className="space-y-4">
                {domain.questions.map((question, questionIndex) => (
                  <article className="break-inside-avoid rounded-[1.35rem] border bg-white px-5 py-5" key={question.id ?? `${detail.id}-question-${domainIndex}-${questionIndex}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                          Question {questionIndex + 1}
                        </div>
                        <div className="mt-2 text-lg font-semibold text-foreground">{question.prompt}</div>
                      </div>
                      <Badge variant="outline">{question.levels.length} levels</Badge>
                    </div>
                    {question.guidance ? (
                      <div className="mt-4 rounded-[1rem] border bg-muted/20 px-4 py-3 text-sm leading-7 text-muted-foreground">
                        {question.guidance}
                      </div>
                    ) : null}

                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {question.levels.map((level) => (
                        <div className="rounded-[1rem] border bg-muted/15 px-4 py-4" key={`${question.id ?? question.prompt}-${level.value}`}>
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-semibold text-foreground">{level.label}</div>
                            <Badge variant="secondary">Level {level.value}</Badge>
                          </div>
                          <div className="mt-3 text-sm leading-6 text-muted-foreground">{level.description}</div>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

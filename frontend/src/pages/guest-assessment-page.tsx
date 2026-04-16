import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useParams } from "react-router-dom";
import { LoaderCircle, MonitorPlay, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AssessmentMatrix } from "@/components/assessment-matrix";
import { AssessmentPresentationMode } from "@/components/assessment-presentation-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { GuestAssessmentRunDetail } from "@/types";

type ResponseState = Record<string, { selectedValue: number; selectedLabel: string; comment?: string }>;

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

export function GuestAssessmentPage() {
  const { token = "" } = useParams();
  const queryClient = useQueryClient();
  const [responses, setResponses] = useState<ResponseState>({});
  const [guestDisplayName, setGuestDisplayName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [isPresentationModeOpen, setIsPresentationModeOpen] = useState(false);
  const [presentationQuestionIndex, setPresentationQuestionIndex] = useState(0);
  const [hasSubmissionSucceeded, setHasSubmissionSucceeded] = useState(false);
  const [showSubmissionGuard, setShowSubmissionGuard] = useState(false);

  const runQuery = useQuery({
    queryKey: ["guest-assessment", token],
    queryFn: () => api.get<GuestAssessmentRunDetail>(`/guest-assessments/${token}`),
    enabled: Boolean(token)
  });

  useEffect(() => {
    if (!runQuery.data || hasHydrated) {
      return;
    }

    const nextEntries = runQuery.data.domains.flatMap((domain) =>
      domain.questions
        .filter((question) => question.response)
        .map((question) => [
          question.id,
          {
            selectedValue: question.response!.selectedValue,
            selectedLabel: question.response!.selectedLabel,
            comment: question.response!.comment
          }
        ] as const)
    );

    const nextResponses = Object.fromEntries(nextEntries);
    setResponses(nextResponses);
    setGuestDisplayName(runQuery.data.guestAccess.guestDisplayName ?? "");
    setGuestEmail(runQuery.data.guestAccess.guestEmail ?? "");
    setLastSavedSnapshot(JSON.stringify(nextResponses));
    setHasHydrated(true);
  }, [hasHydrated, runQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: ResponseState) =>
      api.put(`/guest-assessments/${token}/responses`, {
        guestDisplayName,
        guestEmail,
        responses: Object.entries(payload).map(([questionId, response]) => ({
          questionId,
          ...response
        }))
      }),
    onSuccess: (_data, payload) => {
      setLastSavedSnapshot(JSON.stringify(payload));
      setAutosaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["guest-assessment", token] });
    },
    onError: (error: Error) => {
      setAutosaveStatus("error");
      toast.error(error.message);
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (currentSnapshot !== lastSavedSnapshot) {
        await saveMutation.mutateAsync(responses);
      }

      return api.post(`/guest-assessments/${token}/submit`, {
        guestDisplayName,
        guestEmail
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["guest-assessment", token] });
      setHasSubmissionSucceeded(true);
      toast.success("Assessment submitted");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const run = runQuery.data;
  const totalQuestions = run?.domains.reduce((sum, domain) => sum + domain.totalQuestions, 0) ?? 0;
  const answeredQuestions = Object.keys(responses).length;
  const unansweredQuestions = Math.max(0, totalQuestions - answeredQuestions);
  const currentSnapshot = JSON.stringify(responses);
  const hasUnsavedChanges = hasHydrated && currentSnapshot !== lastSavedSnapshot;
  const canPersist = guestDisplayName.trim().length > 0 && run?.status !== "SUBMITTED" && run?.status !== "ARCHIVED";
  const isSubmitted = run?.status === "SUBMITTED";
  const showSuccessState = hasSubmissionSucceeded || Boolean(run?.guestAccess.submittedAt);

  useEffect(() => {
    if (!hasHydrated || !canPersist || !hasUnsavedChanges || isSubmitted) {
      return;
    }

    setAutosaveStatus("saving");
    const timeout = window.setTimeout(() => {
      saveMutation.mutate(responses);
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [canPersist, hasHydrated, hasUnsavedChanges, isSubmitted, responses]);

  const autosaveMessage =
    !guestDisplayName.trim()
      ? "Enter your display name before your answers can be saved."
      : autosaveStatus === "saving"
        ? "Saving shared assessment progress..."
        : autosaveStatus === "saved"
          ? "Shared assessment progress saved"
          : autosaveStatus === "error"
            ? "Saving failed"
            : "Your answers will save as you respond";

  const firstUnansweredQuestionId = useMemo(
    () =>
      run?.domains
        .flatMap((domain) => domain.questions)
        .find((question) => !responses[question.id]?.selectedValue)?.id ?? null,
    [responses, run?.domains]
  );

  if (runQuery.isLoading) {
    return <div className="p-8 text-sm text-muted-foreground">Loading guest assessment...</div>;
  }

  if (!run) {
    return <div className="p-8 text-sm text-muted-foreground">This guest assessment link is unavailable.</div>;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,_rgba(114,191,68,0.22),_transparent_38%),linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(238,248,232,0.96))] px-6 py-8 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">Guest assessment</div>
          <h1 className="mt-3 text-4xl font-semibold">{run.title}</h1>
          <p className="mt-3 max-w-3xl text-sm text-muted-foreground">
            {run.team.name} · {run.periodLabel} · Template v{run.templateVersion.versionNumber}
          </p>
          {run.guestAccess.inviteLabel ? (
            <div className="mt-3">
              <Badge variant="outline">Invite: {run.guestAccess.inviteLabel}</Badge>
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Badge variant={run.status === "IN_PROGRESS" ? "default" : "secondary"}>{run.status}</Badge>
            <Badge variant="outline">{answeredQuestions}/{totalQuestions} answered</Badge>
            <Badge variant="outline">
              {run.guestAccess.expiresAt ? `Link expires ${formatDate(run.guestAccess.expiresAt)}` : "No link expiry"}
            </Badge>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>Guest identity</CardTitle>
            <CardDescription>
              Enter the name you want the assessment owner to see. This link is scoped only to this assessment.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input value={guestDisplayName} onChange={(event) => setGuestDisplayName(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={guestEmail} onChange={(event) => setGuestEmail(event.target.value)} />
            </div>
            <div className="md:col-span-2 text-sm text-muted-foreground">{autosaveMessage}</div>
          </CardContent>
        </Card>

        {!showSuccessState ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  <Sparkles className="h-4 w-4" />
                  Guided answering
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  Open a one-question-at-a-time workshop view for easier facilitation with external participants.
                </div>
              </div>
              <Button onClick={() => setIsPresentationModeOpen(true)} type="button" variant="outline">
                <MonitorPlay className="mr-2 h-4 w-4" />
                Presentation mode
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {firstUnansweredQuestionId && !showSuccessState ? (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="text-sm text-muted-foreground">Jump to the next unanswered question to finish faster.</div>
              <Button onClick={() => document.getElementById(`question-${firstUnansweredQuestionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })} type="button" variant="outline">
                Go to first unanswered
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {!showSuccessState ? (
          <AssessmentMatrix
            readOnly={isSubmitted}
            responses={responses}
            run={run}
            onCommentChange={(questionId, comment) =>
              setResponses((current) => ({
                ...current,
                [questionId]: {
                  ...current[questionId],
                  selectedValue: current[questionId]?.selectedValue ?? 0,
                  selectedLabel: current[questionId]?.selectedLabel ?? "",
                  comment
                }
              }))
            }
            onSelect={(questionId, value, label) =>
              setResponses((current) => ({
                ...current,
                [questionId]: {
                  selectedValue: value,
                  selectedLabel: label,
                  comment: current[questionId]?.comment
                }
              }))
            }
          />
        ) : null}

        {!showSuccessState ? (
          <Card>
            <CardHeader>
              <CardTitle>Submit assessment</CardTitle>
              <CardDescription>
                Submitting closes this shared team assessment for guest participation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {showSubmissionGuard && unansweredQuestions > 0 ? (
                <div className="rounded-[1rem] border border-primary/20 bg-accent px-4 py-4">
                  <div className="text-sm font-semibold text-foreground">Some questions are still unanswered</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {unansweredQuestions} question{unansweredQuestions === 1 ? "" : "s"} remain unanswered. You can go back and finish them or submit anyway.
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <Button disabled={submitMutation.isPending} onClick={() => submitMutation.mutate()} type="button">
                      Submit anyway
                    </Button>
                    <Button onClick={() => setShowSubmissionGuard(false)} type="button" variant="outline">
                      Review unanswered
                    </Button>
                  </div>
                </div>
              ) : null}
              <div className="flex flex-wrap gap-3">
              <Button
                disabled={!guestDisplayName.trim() || submitMutation.isPending}
                onClick={() => {
                  if (unansweredQuestions > 0) {
                    setShowSubmissionGuard(true);
                    return;
                  }

                  submitMutation.mutate();
                }}
                type="button"
              >
                {submitMutation.isPending ? "Submitting..." : "Submit assessment"}
              </Button>
              {unansweredQuestions > 0 ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  {unansweredQuestions} unanswered question{unansweredQuestions === 1 ? "" : "s"}
                </div>
              ) : null}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Assessment submitted</CardTitle>
              <CardDescription>
                The shared team assessment has been submitted successfully and is no longer accepting guest input.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-[1.1rem] border bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
                Submitted on {formatDate(run.guestAccess.submittedAt ?? run.submittedAt)}
              </div>
              <div className="text-sm text-muted-foreground">
                {run.guestAccess.resultsVisible
                  ? "The host has allowed guest access to the submitted results for this assessment."
                  : "Results remain available to the host inside the platform."}
              </div>
              {run.guestAccess.resultsVisible ? (
                <div>
                  <Link
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    to={`/guest-assessments/${token}/results`}
                  >
                    View results
                  </Link>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {isPresentationModeOpen && !showSuccessState ? (
          <AssessmentPresentationMode
            activeIndex={presentationQuestionIndex}
            onActiveIndexChange={setPresentationQuestionIndex}
            onClose={() => setIsPresentationModeOpen(false)}
            onCommentChange={(questionId, comment) =>
              setResponses((current) => ({
                ...current,
                [questionId]: {
                  ...current[questionId],
                  selectedValue: current[questionId]?.selectedValue ?? 0,
                  selectedLabel: current[questionId]?.selectedLabel ?? "",
                  comment
                }
              }))
            }
            onSelect={(questionId, value, label) =>
              setResponses((current) => ({
                ...current,
                [questionId]: {
                  selectedValue: value,
                  selectedLabel: label,
                  comment: current[questionId]?.comment
                }
              }))
            }
            readOnly={false}
            responses={responses}
            run={run}
          />
        ) : null}

        {submitMutation.isPending ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[1.5rem] border border-primary/20 bg-white p-6 shadow-2xl">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <LoaderCircle className="h-6 w-6 animate-spin" />
                </div>
                <div>
                  <div className="text-lg font-semibold text-foreground">Submitting assessment</div>
                  <div className="text-sm text-muted-foreground">Please wait while the team assessment is finalized.</div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

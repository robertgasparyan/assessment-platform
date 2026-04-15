import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { MonitorPlay, Sparkles, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { AssessmentMatrix } from "@/components/assessment-matrix";
import { AssessmentPresentationMode } from "@/components/assessment-presentation-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth-context";
import { api } from "@/lib/api";
import type { AssessmentRunDetail, UserSummary } from "@/types";

type ResponseState = Record<string, { selectedValue: number; selectedLabel: string; comment?: string }>;

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
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

function getDueDateState(dueDate: string | null | undefined, status: AssessmentRunDetail["status"] | undefined) {
  if (!dueDate || status === "SUBMITTED" || status === "ARCHIVED") {
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

export function AssessmentRunPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { runId = "" } = useParams();
  const returnTo = typeof location.state?.returnTo === "string" ? location.state.returnTo : "/assessments?tab=active";

  const runQuery = useQuery({
    queryKey: ["assessment-run", runId],
    queryFn: () => api.get<AssessmentRunDetail>(`/assessment-runs/${runId}`)
  });
  const usersQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => api.get<UserSummary[]>("/users/assignable")
  });

  const [responses, setResponses] = useState<ResponseState>({});
  const [submissionSummary, setSubmissionSummary] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editOwnerUserId, setEditOwnerUserId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPeriodLabel, setEditPeriodLabel] = useState("");
  const [isPresentationModeOpen, setIsPresentationModeOpen] = useState(false);
  const [presentationQuestionIndex, setPresentationQuestionIndex] = useState(0);

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
    setSubmissionSummary(runQuery.data.submissionSummary ?? "");
    setEditTitle(runQuery.data.title);
    setEditOwnerUserId(runQuery.data.ownerUser?.id ?? "");
    setEditDueDate(runQuery.data.dueDate ? new Date(runQuery.data.dueDate).toISOString().slice(0, 10) : "");
    setEditPeriodLabel(runQuery.data.periodLabel);
    setLastSavedSnapshot(JSON.stringify(nextResponses));
    setHasHydrated(true);
  }, [hasHydrated, runQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: ResponseState) =>
      api.put(`/assessment-runs/${runId}/responses`, {
        responses: Object.entries(payload).map(([questionId, response]) => ({
          questionId,
          ...response
        }))
      }),
    onSuccess: (_data, payload) => {
      setLastSavedSnapshot(JSON.stringify(payload));
      setAutosaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["assessment-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
    },
    onError: (error: Error) => {
      setAutosaveStatus("error");
      toast.error(error.message);
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync(responses);
      return api.post(`/assessment-runs/${runId}/submit`, {
        submissionSummary: submissionSummary.trim() || undefined
      });
    },
    onSuccess: () => {
      toast.success("Assessment submitted");
      queryClient.invalidateQueries({ queryKey: ["assessment-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
      navigate(`/assessments/${runId}/results`, { state: { returnTo } });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateRunMutation = useMutation({
    mutationFn: () =>
      api.put(`/assessment-runs/${runId}`, {
        title: editTitle,
        ownerUserId: editOwnerUserId || null,
        ownerName: selectedOwner?.displayName ?? null,
        dueDate: editDueDate ? new Date(`${editDueDate}T00:00:00.000Z`).toISOString() : null,
        periodLabel: editPeriodLabel
      }),
    onSuccess: () => {
      toast.success("Run details updated");
      queryClient.invalidateQueries({ queryKey: ["assessment-run", runId] });
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const run = runQuery.data;
  const isSubmitted = run?.status === "SUBMITTED";
  const selectedOwner = (usersQuery.data ?? []).find((candidate) => candidate.id === editOwnerUserId);
  const ownerOptions = useMemo(
    () =>
      [{ value: "", label: "No explicit owner" }].concat(
        (usersQuery.data ?? []).map((candidate) => ({
          value: candidate.id,
          label: `${candidate.displayName} (${candidate.username})`
        }))
      ),
    [usersQuery.data]
  );
  const totalQuestions = run?.domains.reduce((sum, domain) => sum + domain.totalQuestions, 0) ?? 0;
  const answeredQuestions = Object.keys(responses).length;
  const firstUnansweredQuestionId = useMemo(
    () =>
      run?.domains
        .flatMap((domain) => domain.questions)
        .find((question) => !responses[question.id]?.selectedValue)?.id ?? null,
    [responses, run?.domains]
  );
  const flatQuestionIds = useMemo(
    () => run?.domains.flatMap((domain) => domain.questions.map((question) => question.id)) ?? [],
    [run?.domains]
  );
  const currentSnapshot = JSON.stringify(responses);
  const hasUnsavedChanges = hasHydrated && currentSnapshot !== lastSavedSnapshot;
  const dueDateState = getDueDateState(run?.dueDate, run?.status);
  const canManageRun = Boolean(user && run && (user.role === "ADMIN" || user.role === "TEAM_LEAD" || run.ownerUser?.id === user.id));
  const canEditResponses = Boolean(
    user
    && run
    && (user.role === "ADMIN" || user.role === "TEAM_LEAD" || user.role === "TEAM_MEMBER" || run.ownerUser?.id === user.id)
  );

  useEffect(() => {
    if (!hasHydrated || isSubmitted || !canEditResponses || !hasUnsavedChanges) {
      return;
    }

    setAutosaveStatus("saving");
    const timeout = window.setTimeout(() => {
      saveMutation.mutate(responses);
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [canEditResponses, hasHydrated, hasUnsavedChanges, isSubmitted, responses]);

  const autosaveMessage =
    autosaveStatus === "saving"
      ? "Autosaving draft..."
      : autosaveStatus === "saved"
        ? "All draft changes saved"
        : autosaveStatus === "error"
          ? "Autosave failed"
          : "Draft changes are local until you answer";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Collaborative run</div>
          <h1 className="mt-2 text-4xl font-semibold">{run?.title ?? "Assessment"}</h1>
          <p className="mt-2 text-muted-foreground">
            {run?.team.name} · {run?.periodLabel} · Template v{run?.templateVersion.versionNumber}
          </p>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>Owner: {(run?.ownerUser?.displayName ?? run?.ownerName) || "-"}</span>
            <span>Due: {formatDate(run?.dueDate)}</span>
            {dueDateState ? <Badge variant={dueDateState.variant}>{dueDateState.label}</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Badge variant={run?.status === "SUBMITTED" ? "success" : run?.status === "IN_PROGRESS" ? "default" : "secondary"}>
            {run?.status ?? "DRAFT"}
          </Badge>
          {run?.status === "SUBMITTED" ? (
            <Button onClick={() => navigate(`/assessments/${runId}/results`, { state: { returnTo } })} type="button">
              View results
            </Button>
          ) : null}
        </div>
      </div>

      {canManageRun ? (
      <Card>
        <CardHeader>
          <CardTitle>Run details</CardTitle>
          <CardDescription>Update operational metadata for this run without changing the submitted assessment content.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium">Title</div>
            <input
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              disabled={isSubmitted}
              value={editTitle}
              onChange={(event) => setEditTitle(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Select disabled={isSubmitted} options={ownerOptions} value={editOwnerUserId} onChange={(event) => setEditOwnerUserId(event.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">Due date</div>
            <input
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              disabled={isSubmitted}
              type="date"
              value={editDueDate}
              onChange={(event) => setEditDueDate(event.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <div className="text-sm font-medium">Period label</div>
            <input
              className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
              disabled={isSubmitted}
              value={editPeriodLabel}
              onChange={(event) => setEditPeriodLabel(event.target.value)}
            />
          </div>
          {!isSubmitted ? (
            <div className="md:col-span-2">
              <Button
                disabled={!editTitle.trim() || updateRunMutation.isPending}
                onClick={() => updateRunMutation.mutate()}
                type="button"
                variant="outline"
              >
                Save run details
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
      ) : null}

      {run?.assignmentHistory.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Assignment history</CardTitle>
            <CardDescription>Track who changed ownership of this run and when the current assignment was set.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {run.assignmentHistory.map((entry) => (
              <div className="rounded-[1rem] border border-border/80 p-3" key={entry.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-foreground">
                    {(entry.fromUser?.displayName ?? entry.fromOwnerName ?? "Unassigned")}
                    {" -> "}
                    {(entry.toUser?.displayName ?? entry.toOwnerName ?? "Unassigned")}
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDate(entry.createdAt)}</div>
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Changed by {entry.assignedByUser.displayName}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Progress</CardTitle>
          <CardDescription>
            {isSubmitted
              ? "This assessment has been submitted and is now read-only."
              : "Drafts autosave while you work. Jump to the next unanswered question any time."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.9fr)]">
            <div className="rounded-[1.5rem] border border-border/80 bg-muted/25 p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Assessment progress</div>
                  <div className="text-2xl font-semibold text-foreground">
                    {answeredQuestions}/{totalQuestions} questions answered
                  </div>
                  <div className="text-sm text-muted-foreground">{autosaveMessage}</div>
                </div>
                <div className="rounded-[1.25rem] bg-white px-4 py-3 text-right shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Completion</div>
                  <div className="mt-1 text-2xl font-semibold text-primary">
                    {totalQuestions ? Math.round((answeredQuestions / totalQuestions) * 100) : 0}%
                  </div>
                </div>
              </div>
              <div className="mt-5 h-3 rounded-full bg-white">
                <div
                  className="h-3 rounded-full bg-primary transition-all"
                  style={{ width: `${totalQuestions ? (answeredQuestions / totalQuestions) * 100 : 0}%` }}
                />
              </div>
            </div>

            {!isSubmitted && canEditResponses && run ? (
              <div className="rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-[#eef8e8] to-white p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="rounded-[1.25rem] bg-primary p-3 text-primary-foreground shadow-sm">
                    <MonitorPlay className="h-5 w-5" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                      <Sparkles className="h-4 w-4" />
                      Collaborative workshop mode
                    </div>
                    <div className="text-xl font-semibold text-foreground">Presentation mode</div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Open a full-screen, one-question-at-a-time view for team discussion, shared answer selection, and live note-taking.
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button onClick={() => setIsPresentationModeOpen(true)} type="button">
                    <MonitorPlay className="mr-2 h-4 w-4" />
                    Launch presentation mode
                  </Button>
                  {firstUnansweredQuestionId ? (
                    <Button
                      onClick={() => {
                        const unansweredIndex = flatQuestionIds.findIndex((questionId) => questionId === firstUnansweredQuestionId);
                        setPresentationQuestionIndex(unansweredIndex >= 0 ? unansweredIndex : 0);
                        setIsPresentationModeOpen(true);
                      }}
                      type="button"
                      variant="outline"
                    >
                      <TimerReset className="mr-2 h-4 w-4" />
                      Start at next unanswered
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-3">
            {!isSubmitted && canEditResponses && firstUnansweredQuestionId ? (
              <Button
                onClick={() => {
                  const unansweredIndex = flatQuestionIds.findIndex((questionId) => questionId === firstUnansweredQuestionId);
                  setPresentationQuestionIndex(unansweredIndex >= 0 ? unansweredIndex : 0);
                  document.getElementById(`question-${firstUnansweredQuestionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
                type="button"
                variant="outline"
              >
                Resume at next unanswered
              </Button>
            ) : null}
            {!isSubmitted && canEditResponses ? (
              <>
                <Button onClick={() => saveMutation.mutate(responses)} type="button" variant="secondary">
                  Save draft now
                </Button>
                <Button disabled={!canManageRun || !run || answeredQuestions < totalQuestions || submitMutation.isPending} onClick={() => submitMutation.mutate()} type="button">
                  Submit assessment
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {!isSubmitted && canEditResponses ? (
        <Card>
          <CardHeader>
            <CardTitle>Submission summary</CardTitle>
            <CardDescription>Add a short summary for what changed, context for the scores, or follow-up notes to keep with the submitted run.</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Optional summary for the submitted report"
              value={submissionSummary}
              onChange={(event) => setSubmissionSummary(event.target.value)}
            />
          </CardContent>
        </Card>
      ) : run?.submissionSummary ? (
        <Card>
          <CardHeader>
            <CardTitle>Submission summary</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{run.submissionSummary}</CardContent>
        </Card>
      ) : null}

      {run ? (
        <AssessmentMatrix
          readOnly={isSubmitted || !canEditResponses}
          run={run}
          responses={responses}
          onSelect={(questionId, selectedValue, selectedLabel) =>
            setResponses((current) => ({
              ...current,
              [questionId]: {
                ...current[questionId],
                selectedValue,
                selectedLabel
              }
            }))
          }
          onCommentChange={(questionId, comment) =>
            setResponses((current) => ({
              ...current,
              [questionId]: {
                ...current[questionId],
                selectedValue:
                  current[questionId]?.selectedValue ??
                  run.domains.flatMap((domain) => domain.questions).find((question) => question.id === questionId)?.levels[0]?.value ??
                  1,
                selectedLabel:
                  current[questionId]?.selectedLabel ??
                  run.domains.flatMap((domain) => domain.questions).find((question) => question.id === questionId)?.levels[0]?.label ??
                  "Level 1",
                comment: comment || undefined
              }
            }))
          }
        />
      ) : null}

      {run && isPresentationModeOpen && canEditResponses ? (
        <AssessmentPresentationMode
          activeIndex={presentationQuestionIndex}
          onActiveIndexChange={setPresentationQuestionIndex}
          onClose={() => setIsPresentationModeOpen(false)}
          onCommentChange={(questionId, comment) =>
            setResponses((current) => ({
              ...current,
              [questionId]: {
                ...current[questionId],
                selectedValue:
                  current[questionId]?.selectedValue ??
                  run.domains.flatMap((domain) => domain.questions).find((question) => question.id === questionId)?.levels[0]?.value ??
                  1,
                selectedLabel:
                  current[questionId]?.selectedLabel ??
                  run.domains.flatMap((domain) => domain.questions).find((question) => question.id === questionId)?.levels[0]?.label ??
                  "Level 1",
                comment: comment || undefined
              }
            }))
          }
          onSelect={(questionId, selectedValue, selectedLabel) =>
            setResponses((current) => ({
              ...current,
              [questionId]: {
                ...current[questionId],
                selectedValue,
                selectedLabel
              }
            }))
          }
          readOnly={isSubmitted}
          responses={responses}
          run={run}
        />
      ) : null}

      <Button className="w-fit px-0 text-sm font-medium text-primary" onClick={() => navigate(returnTo)} type="button" variant="ghost">
        Back to all assessment runs
      </Button>
    </div>
  );
}

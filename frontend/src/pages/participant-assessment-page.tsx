import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { AssessmentMatrix } from "@/components/assessment-matrix";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { ParticipantAssessmentRunDetail } from "@/types";

type ResponseState = Record<string, { selectedValue: number; selectedLabel: string; comment?: string }>;

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function getParticipantStatusLabel(status: ParticipantAssessmentRunDetail["participant"]["status"]) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ParticipantAssessmentPage() {
  const { runId = "" } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runQuery = useQuery({
    queryKey: ["participant-assessment", runId],
    queryFn: () => api.get<ParticipantAssessmentRunDetail>(`/assessment-runs/${runId}/participant-me`),
    enabled: Boolean(runId)
  });

  const [responses, setResponses] = useState<ResponseState>({});
  const [hasHydrated, setHasHydrated] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (!runQuery.data || hasHydrated) {
      return;
    }

    const nextResponses = Object.fromEntries(
      runQuery.data.domains.flatMap((domain) =>
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
      )
    );

    setResponses(nextResponses);
    setLastSavedSnapshot(JSON.stringify(nextResponses));
    setLastSavedAt(runQuery.data.updatedAt ?? null);
    setHasHydrated(true);
  }, [hasHydrated, runQuery.data]);

  const saveMutation = useMutation({
    mutationFn: (payload: ResponseState) =>
      api.put(`/assessment-runs/${runId}/participant-me/responses`, {
        responses: Object.entries(payload)
          .filter(([, response]) => response.selectedValue > 0 && response.selectedLabel)
          .map(([questionId, response]) => ({
            questionId,
            ...response
          }))
      }),
    onSuccess: (_data, payload) => {
      setLastSavedSnapshot(JSON.stringify(payload));
      setLastSavedAt(new Date().toISOString());
      setAutosaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["participant-assessment", runId] });
      queryClient.invalidateQueries({ queryKey: ["my-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
    },
    onError: (error: Error) => {
      setAutosaveStatus("error");
      toast.error(error.message);
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      await saveMutation.mutateAsync(responses);
      return api.post(`/assessment-runs/${runId}/participant-me/submit`);
    },
    onSuccess: async () => {
      toast.success("Individual response submitted");
      await queryClient.invalidateQueries({ queryKey: ["participant-assessment", runId] });
      await queryClient.invalidateQueries({ queryKey: ["my-assessments"] });
      navigate("/my-assessments");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const run = runQuery.data;
  const isSubmitted = run?.participant.status === "SUBMITTED";
  const totalQuestions = run?.domains.reduce((sum, domain) => sum + domain.totalQuestions, 0) ?? 0;
  const answeredQuestions = Object.values(responses).filter((response) => response.selectedValue > 0 && response.selectedLabel).length;
  const unansweredQuestions = Math.max(totalQuestions - answeredQuestions, 0);
  const currentSnapshot = JSON.stringify(responses);
  const hasUnsavedChanges = hasHydrated && currentSnapshot !== lastSavedSnapshot;
  const canEdit = Boolean(run && !isSubmitted && run.status !== "SUBMITTED" && run.status !== "ARCHIVED");
  const autosaveMessage =
    autosaveStatus === "saving"
      ? "Autosaving individual response..."
      : autosaveStatus === "saved"
        ? "All individual response changes saved"
        : autosaveStatus === "error"
          ? "Autosave failed"
          : "Changes save automatically after you answer";
  const autosaveToneClass =
    autosaveStatus === "saving"
      ? "border-primary/20 bg-primary/5 text-primary"
      : autosaveStatus === "saved"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : autosaveStatus === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-border/80 bg-white text-muted-foreground";

  const completionPercent = useMemo(
    () => (totalQuestions ? Math.round((answeredQuestions / totalQuestions) * 100) : 0),
    [answeredQuestions, totalQuestions]
  );

  useEffect(() => {
    if (!canEdit || !hasUnsavedChanges) {
      return;
    }

    setAutosaveStatus("saving");
    const timeout = window.setTimeout(() => {
      saveMutation.mutate(responses);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [canEdit, hasUnsavedChanges, responses]);

  if (runQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading individual assessment...</div>;
  }

  if (!run) {
    return <div className="text-sm text-muted-foreground">Individual assessment was not found or is not assigned to you.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Individual assessment</div>
          <h1 className="mt-2 text-4xl font-semibold">{run.title}</h1>
          <p className="mt-2 text-muted-foreground">
            {run.team.name} · {run.periodLabel} · Template v{run.templateVersion.versionNumber}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge variant={isSubmitted ? "success" : run.participant.status === "IN_PROGRESS" ? "default" : "secondary"}>
              {getParticipantStatusLabel(run.participant.status)}
            </Badge>
            <Badge variant="outline">{answeredQuestions}/{totalQuestions} answered</Badge>
          </div>
        </div>
        <Button onClick={() => navigate("/my-assessments")} type="button" variant="outline">
          Back to my assessments
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your response progress</CardTitle>
          <CardDescription>
            Your answers are saved separately from the shared team run. Final aggregation will be handled in a later workflow step.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-2xl font-semibold text-foreground">{completionPercent}% complete</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Invited {formatDateTime(run.participant.invitedAt)} · Last saved {lastSavedAt ? formatDateTime(lastSavedAt) : "not yet"}
              </div>
            </div>
            <Badge variant={unansweredQuestions ? "secondary" : "success"}>
              {unansweredQuestions ? `${unansweredQuestions} unanswered` : "Ready to submit"}
            </Badge>
          </div>
          <div className="h-3 rounded-full bg-muted">
            <div className="h-3 rounded-full bg-primary transition-all" style={{ width: `${completionPercent}%` }} />
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border px-4 py-3 text-sm ${autosaveToneClass}`}>
            <div className="flex items-center gap-2">
              {autosaveStatus === "error" ? (
                <AlertTriangle className="h-4 w-4" />
              ) : autosaveStatus === "saved" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : null}
              <span className="font-medium">{autosaveMessage}</span>
            </div>
            {isSubmitted ? <Badge variant="success">Submitted {formatDateTime(run.participant.submittedAt)}</Badge> : null}
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => saveMutation.mutate(responses)} type="button" variant="secondary">
                Save now
              </Button>
              <Button disabled={answeredQuestions < totalQuestions || submitMutation.isPending} onClick={() => submitMutation.mutate()} type="button">
                Submit my response
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AssessmentMatrix
        readOnly={!canEdit}
        responses={responses}
        run={run}
        onCommentChange={(questionId, comment) =>
          setResponses((current) => ({
            ...current,
            [questionId]: {
              ...current[questionId],
              comment,
              selectedValue: current[questionId]?.selectedValue ?? 0,
              selectedLabel: current[questionId]?.selectedLabel ?? ""
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
      />
    </div>
  );
}

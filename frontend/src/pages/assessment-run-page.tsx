import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, Bot, CheckCircle2, Copy, ExternalLink, MonitorPlay, Sparkles, TimerReset } from "lucide-react";
import { toast } from "sonner";
import { AssessmentMatrix } from "@/components/assessment-matrix";
import { AssessmentPresentationMode } from "@/components/assessment-presentation-mode";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/features/auth-context";
import { ApiError, api } from "@/lib/api";
import type { AiAggregationInsight, AssessmentRunDetail, AssessmentRunParticipant, EmailDeliveryLog, ExternalContact, GuestAssessmentLink, GuestParticipationSettings, UserSummary } from "@/types";

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

function buildAbsoluteGuestUrl(guestUrl: string) {
  if (/^https?:\/\//i.test(guestUrl)) {
    return guestUrl;
  }

  return new URL(guestUrl, window.location.origin).toString();
}

async function copyTextToClipboard(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
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

function getParticipantStatusLabel(status: AssessmentRunParticipant["status"]) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getParticipantStatusVariant(status: AssessmentRunParticipant["status"]) {
  if (status === "SUBMITTED") {
    return "success" as const;
  }

  if (status === "IN_PROGRESS") {
    return "default" as const;
  }

  return "secondary" as const;
}

function getEmailDeliveryLabel(delivery: AssessmentRunParticipant["latestEmailDelivery"]) {
  if (!delivery) {
    return "No email sent";
  }

  const timestamp = delivery.sentAt ?? delivery.failedAt ?? delivery.createdAt;
  const typeLabel = delivery.type.includes("reminder") ? "Reminder" : "Invite";
  return `${typeLabel} ${delivery.status.toLowerCase()} ${formatDate(timestamp)}`;
}

function getEmailDeliveryVariant(delivery: AssessmentRunParticipant["latestEmailDelivery"]) {
  if (!delivery) {
    return "secondary" as const;
  }

  if (delivery.status === "SENT") {
    return "success" as const;
  }

  if (delivery.status === "FAILED") {
    return "secondary" as const;
  }

  return "outline" as const;
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
  const participantsQuery = useQuery({
    queryKey: ["assessment-run-participants", runId],
    queryFn: () => api.get<AssessmentRunParticipant[]>(`/assessment-runs/${runId}/participants`),
    enabled: Boolean(runId && runQuery.data)
  });
  const guestLinksQuery = useQuery({
    queryKey: ["assessment-run-guest-links", runId],
    queryFn: () => api.get<GuestAssessmentLink[]>(`/assessment-runs/${runId}/guest-links`),
    enabled: Boolean(
      runId
      && user
      && runQuery.data
      && (user.role === "ADMIN" || user.role === "TEAM_LEAD" || runQuery.data.ownerUser?.id === user.id)
      && runQuery.data.status !== "SUBMITTED"
      && runQuery.data.status !== "ARCHIVED"
    )
  });
  const guestParticipationSettingsQuery = useQuery({
    queryKey: ["assessment-run-guest-settings", runId],
    queryFn: () => api.get<GuestParticipationSettings>(`/assessment-runs/${runId}/guest-participation-settings`),
    enabled: Boolean(
      runId
      && user
      && runQuery.data
      && (user.role === "ADMIN" || user.role === "TEAM_LEAD" || runQuery.data.ownerUser?.id === user.id)
      && runQuery.data.status !== "SUBMITTED"
      && runQuery.data.status !== "ARCHIVED"
    )
  });
  const externalContactsQuery = useQuery({
    queryKey: ["external-contacts"],
    queryFn: async () => {
      try {
        return await api.get<ExternalContact[]>("/external-contacts");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return [];
        }

        throw error;
      }
    },
    enabled: Boolean(runId && user)
  });

  const [responses, setResponses] = useState<ResponseState>({});
  const [submissionSummary, setSubmissionSummary] = useState("");
  const [autosaveStatus, setAutosaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [hasHydrated, setHasHydrated] = useState(false);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editOwnerUserId, setEditOwnerUserId] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editPeriodLabel, setEditPeriodLabel] = useState("");
  const [guestExpiryDays, setGuestExpiryDays] = useState("7");
  const [guestInviteLabel, setGuestInviteLabel] = useState("");
  const [guestExternalContactId, setGuestExternalContactId] = useState("");
  const [newExternalContactName, setNewExternalContactName] = useState("");
  const [newExternalContactEmail, setNewExternalContactEmail] = useState("");
  const [newExternalContactOrganization, setNewExternalContactOrganization] = useState("");
  const [guestParticipationEnabled, setGuestParticipationEnabled] = useState(false);
  const [guestResultsVisible, setGuestResultsVisible] = useState(false);
  const [isGuestParticipationOpen, setIsGuestParticipationOpen] = useState(false);
  const [selectedParticipantUserIds, setSelectedParticipantUserIds] = useState<string[]>([]);
  const [selectedExternalParticipantContactIds, setSelectedExternalParticipantContactIds] = useState<string[]>([]);
  const [externalParticipantExpiryDays, setExternalParticipantExpiryDays] = useState("14");
  const [selectedEmailHistoryParticipantId, setSelectedEmailHistoryParticipantId] = useState<string | null>(null);
  const [participantSearch, setParticipantSearch] = useState("");
  const [participantStatusFilter, setParticipantStatusFilter] = useState("all");
  const [isPresentationModeOpen, setIsPresentationModeOpen] = useState(false);
  const [presentationQuestionIndex, setPresentationQuestionIndex] = useState(0);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);

  const participantEmailHistoryQuery = useQuery({
    queryKey: ["assessment-run-participant-email-history", runId, selectedEmailHistoryParticipantId],
    queryFn: () => api.get<EmailDeliveryLog[]>(`/assessment-runs/${runId}/participants/${selectedEmailHistoryParticipantId}/email-deliveries`),
    enabled: Boolean(runId && selectedEmailHistoryParticipantId)
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
    setSubmissionSummary(runQuery.data.submissionSummary ?? "");
    setEditTitle(runQuery.data.title);
    setEditOwnerUserId(runQuery.data.ownerUser?.id ?? "");
    setEditDueDate(runQuery.data.dueDate ? new Date(runQuery.data.dueDate).toISOString().slice(0, 10) : "");
    setEditPeriodLabel(runQuery.data.periodLabel);
    setLastSavedSnapshot(JSON.stringify(nextResponses));
    setLastSavedAt(runQuery.data.updatedAt ?? null);
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
      setLastSavedAt(new Date().toISOString());
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
      setIsSubmitConfirmOpen(false);
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
  const createGuestLinkMutation = useMutation({
    mutationFn: () =>
      api.post<GuestAssessmentLink>(`/assessment-runs/${runId}/guest-links`, {
        inviteLabel: guestInviteLabel.trim() || undefined,
        externalContactId: guestExternalContactId || undefined,
        expiresInDays: guestExpiryDays === "none" ? undefined : Number(guestExpiryDays)
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-guest-links", runId] });
      setGuestInviteLabel("");
      setGuestExternalContactId("");
      await copyTextToClipboard(buildAbsoluteGuestUrl(created.guestUrl));
      toast.success("Guest link created and copied");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const createExternalContactMutation = useMutation({
    mutationFn: () =>
      api.post<ExternalContact>("/external-contacts", {
        displayName: newExternalContactName,
        email: newExternalContactEmail || undefined,
        organization: newExternalContactOrganization || undefined
      }),
    onSuccess: async (contact) => {
      await queryClient.invalidateQueries({ queryKey: ["external-contacts"] });
      setGuestExternalContactId(contact.id);
      setNewExternalContactName("");
      setNewExternalContactEmail("");
      setNewExternalContactOrganization("");
      toast.success("External contact saved");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const revokeGuestLinkMutation = useMutation({
    mutationFn: (guestLinkId: string) => api.post<GuestAssessmentLink>(`/assessment-runs/${runId}/guest-links/${guestLinkId}/revoke`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-guest-links", runId] });
      toast.success("Guest link revoked");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateGuestParticipationSettingsMutation = useMutation({
    mutationFn: (nextVisible: boolean) =>
      api.put<GuestParticipationSettings>(`/assessment-runs/${runId}/guest-participation-settings`, {
        guestParticipationEnabled,
        guestResultsVisible: nextVisible
      }),
    onSuccess: async (data) => {
      setGuestParticipationEnabled(data.guestParticipationEnabled);
      setGuestResultsVisible(data.guestResultsVisible);
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-guest-settings", runId] });
      toast.success("Guest results visibility updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateGuestParticipationEnabledMutation = useMutation({
    mutationFn: (nextEnabled: boolean) =>
      api.put<GuestParticipationSettings>(`/assessment-runs/${runId}/guest-participation-settings`, {
        guestParticipationEnabled: nextEnabled,
        guestResultsVisible
      }),
    onSuccess: async (data) => {
      setGuestParticipationEnabled(data.guestParticipationEnabled);
      setGuestResultsVisible(data.guestResultsVisible);
      if (!data.guestParticipationEnabled) {
        setIsGuestParticipationOpen(false);
      }
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-guest-settings", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-guest-links", runId] });
      toast.success(`Guest participation ${data.guestParticipationEnabled ? "enabled" : "disabled"}`);
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateParticipantsMutation = useMutation({
    mutationFn: () =>
      api.post<AssessmentRunParticipant[]>(`/assessment-runs/${runId}/participants/internal-users`, {
        userIds: selectedParticipantUserIds
      }),
    onSuccess: async () => {
      toast.success("Participants updated");
      setSelectedParticipantUserIds([]);
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-run", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateExternalParticipantsMutation = useMutation({
    mutationFn: () =>
      api.post<AssessmentRunParticipant[]>(`/assessment-runs/${runId}/participants/external-contacts`, {
        externalContactIds: selectedExternalParticipantContactIds,
        expiresInDays: externalParticipantExpiryDays === "none" ? undefined : Number(externalParticipantExpiryDays)
      }),
    onSuccess: async () => {
      toast.success("External participants updated");
      setSelectedExternalParticipantContactIds([]);
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-run", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const sendParticipantInviteEmailMutation = useMutation({
    mutationFn: (participantId: string) => api.post(`/assessment-runs/${runId}/participants/${participantId}/send-invite-email`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      toast.success("Participant invite email sent");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const sendParticipantReminderEmailMutation = useMutation({
    mutationFn: (participantId: string) => api.post(`/assessment-runs/${runId}/participants/${participantId}/send-reminder-email`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      toast.success("Participant reminder email sent");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const sendBulkParticipantRemindersMutation = useMutation({
    mutationFn: () => api.post<{ sent: number; skipped: number; failed: number }>(`/assessment-runs/${runId}/participants/send-bulk-reminders`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      toast.success(`Bulk reminders sent: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`);
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const sendBulkParticipantInvitesMutation = useMutation({
    mutationFn: () => api.post<{ sent: number; skipped: number; failed: number }>(`/assessment-runs/${runId}/participants/send-bulk-invites`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      toast.success(`Bulk invites sent: ${result.sent} sent, ${result.skipped} skipped, ${result.failed} failed`);
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const regenerateExternalParticipantLinkMutation = useMutation({
    mutationFn: (participantId: string) =>
      api.post<AssessmentRunParticipant>(`/assessment-runs/${runId}/participants/${participantId}/external-link/regenerate`, {
        expiresInDays: externalParticipantExpiryDays === "none" ? null : Number(externalParticipantExpiryDays)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      toast.success("External participant link regenerated");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateExternalParticipantLinkExpiryMutation = useMutation({
    mutationFn: (participantId: string) =>
      api.put<AssessmentRunParticipant>(`/assessment-runs/${runId}/participants/${participantId}/external-link/expiry`, {
        expiresInDays: externalParticipantExpiryDays === "none" ? null : Number(externalParticipantExpiryDays)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      toast.success("External participant link expiry updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const revokeExternalParticipantLinkMutation = useMutation({
    mutationFn: (participantId: string) => api.post<AssessmentRunParticipant>(`/assessment-runs/${runId}/participants/${participantId}/external-link/revoke`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      toast.success("External participant link revoked");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const removeParticipantMutation = useMutation({
    mutationFn: (participantId: string) => api.delete(`/assessment-runs/${runId}/participants/${participantId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-run", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
      toast.success("Participant removed");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const sendGuestInviteEmailMutation = useMutation({
    mutationFn: (guestLinkId: string) => api.post(`/assessment-runs/${runId}/guest-links/${guestLinkId}/send-invite-email`),
    onSuccess: () => toast.success("Guest invite email sent"),
    onError: (error: Error) => toast.error(error.message)
  });
  const aggregateParticipantResponsesMutation = useMutation({
    mutationFn: () => api.post(`/assessment-runs/${runId}/aggregate-participant-responses`),
    onSuccess: async () => {
      toast.success("Participant responses aggregated and submitted");
      await queryClient.invalidateQueries({ queryKey: ["assessment-run", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-run-participants", runId] });
      await queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
      await queryClient.invalidateQueries({ queryKey: ["my-assessments"] });
      navigate(`/assessments/${runId}/results`, { state: { returnTo } });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const aggregationInsightMutation = useMutation({
    mutationFn: () => api.post<AiAggregationInsight>(`/assessment-runs/${runId}/participant-aggregation-insight`),
    onError: (error: Error) => toast.error(error.message)
  });

  const run = runQuery.data;
  const isSubmitted = run?.status === "SUBMITTED";
  const selectedOwner = (usersQuery.data ?? []).find((candidate) => candidate.id === editOwnerUserId);
  const participants = participantsQuery.data ?? [];
  const participantProgress = useMemo(
    () => ({
      submitted: participants.filter((participant) => participant.status === "SUBMITTED").length,
      inProgress: participants.filter((participant) => participant.status === "IN_PROGRESS").length,
      notStarted: participants.filter((participant) => participant.status === "INVITED" || participant.status === "NOT_STARTED").length
    }),
    [participants]
  );
  const requiredParticipantSubmissions = run?.minimumParticipantResponses
    ? Math.min(run.minimumParticipantResponses, participants.length)
    : participants.length;
  const canAggregateParticipantResponses = Boolean(
    run
    && run.responseMode === "INDIVIDUAL_AGGREGATED"
    && run.status !== "SUBMITTED"
    && run.status !== "ARCHIVED"
    && participants.length > 0
    && participantProgress.submitted >= requiredParticipantSubmissions
  );
  const bulkReminderCount = participants.filter((participant) => participant.status !== "SUBMITTED" && (participant.email || participant.externalContact?.email || participant.user?.email)).length;
  const bulkInviteCount = participants.filter((participant) => participant.status !== "SUBMITTED" && (participant.email || participant.externalContact?.email || participant.user?.email)).length;
  const pendingExternalParticipantLinks = participants.filter(
    (participant) => participant.externalAccessUrl && participant.status !== "SUBMITTED" && !participant.externalAccessRevoked
  );
  const filteredParticipants = useMemo(() => {
    const query = participantSearch.trim().toLowerCase();
    return participants.filter((participant) => {
      const matchesSearch =
        !query
        || participant.displayName.toLowerCase().includes(query)
        || (participant.email ?? "").toLowerCase().includes(query)
        || (participant.externalContact?.organization ?? "").toLowerCase().includes(query)
        || (participant.user?.username ?? "").toLowerCase().includes(query);
      const matchesStatus =
        participantStatusFilter === "all"
        || participant.status === participantStatusFilter
        || (participantStatusFilter === "EXTERNAL" && Boolean(participant.externalContact))
        || (participantStatusFilter === "INTERNAL" && Boolean(participant.user));
      return matchesSearch && matchesStatus;
    });
  }, [participantSearch, participantStatusFilter, participants]);
  const participantUserIdSet = useMemo(
    () => new Set(participants.map((participant) => participant.user?.id).filter((id): id is string => Boolean(id))),
    [participants]
  );
  const participantExternalContactIdSet = useMemo(
    () => new Set(participants.map((participant) => participant.externalContact?.id).filter((id): id is string => Boolean(id))),
    [participants]
  );
  const availableTeamParticipants = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((candidate) => run && candidate.teams.some((team) => team.id === run.team.id) && !participantUserIdSet.has(candidate.id))
        .map((candidate) => ({
          id: candidate.id,
          label: candidate.displayName,
          detail: `${candidate.username}${candidate.email ? ` · ${candidate.email}` : ""}`
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [participantUserIdSet, run, usersQuery.data]
  );
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
  const unansweredQuestions = Math.max(totalQuestions - answeredQuestions, 0);
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
  const isIndividualCollectionRun = Boolean(run && run.responseMode === "INDIVIDUAL_AGGREGATED" && run.status !== "SUBMITTED");
  const canEditResponses = Boolean(
    user
    && run
    && !isIndividualCollectionRun
    && (user.role === "ADMIN" || user.role === "TEAM_LEAD" || user.role === "TEAM_MEMBER" || run.ownerUser?.id === user.id)
  );
  const guestLinks = guestLinksQuery.data ?? [];
  const externalContacts = externalContactsQuery.data ?? [];
  const availableExternalParticipantContacts = useMemo(
    () =>
      externalContacts
        .filter((contact) => !participantExternalContactIdSet.has(contact.id))
        .map((contact) => ({
          id: contact.id,
          label: contact.displayName,
          detail: `${contact.email || "No email"}${contact.organization ? ` · ${contact.organization}` : ""}`
        })),
    [externalContacts, participantExternalContactIdSet]
  );
  const activeGuestLinks = guestLinks.filter((link) => !link.isRevoked && !link.submittedAt && !(link.expiresAt && new Date(link.expiresAt) < new Date()));
  const submittedGuestLinks = guestLinks.filter((link) => Boolean(link.submittedAt));
  const inactiveGuestLinks = guestLinks.filter((link) => link.isRevoked || (!link.submittedAt && Boolean(link.expiresAt && new Date(link.expiresAt) < new Date())));

  useEffect(() => {
    if (typeof guestParticipationSettingsQuery.data?.guestParticipationEnabled === "boolean") {
      setGuestParticipationEnabled(guestParticipationSettingsQuery.data.guestParticipationEnabled);
    }
    if (typeof guestParticipationSettingsQuery.data?.guestResultsVisible === "boolean") {
      setGuestResultsVisible(guestParticipationSettingsQuery.data.guestResultsVisible);
    }
  }, [guestParticipationSettingsQuery.data?.guestParticipationEnabled, guestParticipationSettingsQuery.data?.guestResultsVisible]);

  useEffect(() => {
    setSelectedParticipantUserIds([]);
  }, [runId]);

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
  const autosaveToneClass =
    autosaveStatus === "saving"
      ? "border-primary/20 bg-primary/5 text-primary"
      : autosaveStatus === "saved"
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : autosaveStatus === "error"
          ? "border-rose-200 bg-rose-50 text-rose-700"
          : "border-border/80 bg-white text-muted-foreground";

  function renderGuestLinkList(links: GuestAssessmentLink[], emptyMessage: string) {
    if (!links.length) {
      return (
        <div className="rounded-[1.1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      );
    }

    return (
      <div className="space-y-2">
        {links.map((link) => {
          const isExpired = Boolean(link.expiresAt && new Date(link.expiresAt) < new Date());
          const isUsable = !link.isRevoked && !isExpired && !link.submittedAt;

          return (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border bg-white px-3 py-3" key={link.id}>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="text-sm font-medium leading-5">
                    {link.inviteLabel || link.guestDisplayName || "Unlabeled guest link"}
                  </div>
                  {link.guestDisplayName || link.guestEmail ? (
                    <div className="text-xs text-muted-foreground">
                      {link.guestDisplayName || "Guest participant"}
                      {link.guestEmail ? ` · ${link.guestEmail}` : ""}
                    </div>
                  ) : null}
                  <div className="truncate text-xs text-muted-foreground" title={buildAbsoluteGuestUrl(link.guestUrl)}>
                    {buildAbsoluteGuestUrl(link.guestUrl)}
                  </div>
                <div className="text-xs text-muted-foreground">
                  Created {formatDate(link.createdAt)} · {link.expiresAt ? `Expires ${formatDate(link.expiresAt)}` : "No expiry"}
                  {link.lastAccessedAt ? ` · Last opened ${formatDate(link.lastAccessedAt)}` : ""}
                  {link.submittedAt ? ` · Submitted ${formatDate(link.submittedAt)}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={link.isRevoked ? "secondary" : link.submittedAt ? "success" : isExpired ? "secondary" : "outline"}>
                  {link.isRevoked ? "Revoked" : link.submittedAt ? "Submitted" : isExpired ? "Expired" : "Active"}
                </Badge>
                {isUsable ? (
                  <>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={() => window.open(buildAbsoluteGuestUrl(link.guestUrl), "_blank", "noopener,noreferrer")}
                      type="button"
                      variant="outline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      className="h-8 w-8 p-0"
                      onClick={async () => {
                        await copyTextToClipboard(buildAbsoluteGuestUrl(link.guestUrl));
                        toast.success("Guest link copied");
                      }}
                      type="button"
                      variant="outline"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </>
                ) : null}
                {!link.isRevoked && !link.submittedAt ? (
                  <Button
                    className="h-8 px-2.5 text-xs"
                    disabled={revokeGuestLinkMutation.isPending}
                    onClick={() => revokeGuestLinkMutation.mutate(link.id)}
                    type="button"
                    variant="outline"
                  >
                    Revoke
                  </Button>
                ) : null}
                {isUsable && link.guestEmail ? (
                  <Button
                    className="h-8 px-2.5 text-xs"
                    disabled={sendGuestInviteEmailMutation.isPending}
                    onClick={() => sendGuestInviteEmailMutation.mutate(link.id)}
                    type="button"
                    variant="outline"
                  >
                    Email invite
                  </Button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

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
            {run?.responseMode === "INDIVIDUAL_AGGREGATED" ? <Badge variant="secondary">Individual responses</Badge> : null}
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

      {canManageRun && run ? (
        <Card>
          <CardHeader>
            <CardTitle>Team member participation</CardTitle>
            <CardDescription>
              Manage individual team-member collection, monitor response progress, and aggregate submitted responses into the final team-level result.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={run.responseMode === "INDIVIDUAL_AGGREGATED" ? "default" : "outline"}>
                {run.responseMode === "INDIVIDUAL_AGGREGATED" ? "Individual team member mode" : "Shared team response"}
              </Badge>
              <Badge variant="secondary">{participants.length} participants</Badge>
              <Badge variant="success">{participantProgress.submitted} submitted</Badge>
              <Badge variant="outline">{participantProgress.inProgress} in progress</Badge>
              <Badge variant="secondary">{participantProgress.notStarted} not started</Badge>
              <Badge variant="outline">Required {requiredParticipantSubmissions || 0}</Badge>
              {!isSubmitted && run.status !== "ARCHIVED" ? (
                <Button
                  className="h-8 px-2.5 text-xs"
                  disabled={!bulkReminderCount || sendBulkParticipantRemindersMutation.isPending}
                  onClick={() => sendBulkParticipantRemindersMutation.mutate()}
                  type="button"
                  variant="outline"
                >
                  Send reminders to {bulkReminderCount}
                </Button>
              ) : null}
              {!isSubmitted && run.status !== "ARCHIVED" ? (
                <Button
                  className="h-8 px-2.5 text-xs"
                  disabled={!bulkInviteCount || sendBulkParticipantInvitesMutation.isPending}
                  onClick={() => sendBulkParticipantInvitesMutation.mutate()}
                  type="button"
                  variant="outline"
                >
                  Send invites to {bulkInviteCount}
                </Button>
              ) : null}
              {pendingExternalParticipantLinks.length ? (
                <Button
                  className="h-8 px-2.5 text-xs"
                  onClick={async () => {
                    await copyTextToClipboard(
                      pendingExternalParticipantLinks
                        .map((participant) => `${participant.displayName}: ${buildAbsoluteGuestUrl(participant.externalAccessUrl!)}`)
                        .join("\n")
                    );
                    toast.success(`Copied ${pendingExternalParticipantLinks.length} pending external links`);
                  }}
                  type="button"
                  variant="outline"
                >
                  Copy pending external links
                </Button>
              ) : null}
            </div>

            <div className="grid gap-3 rounded-[1rem] border bg-muted/20 p-3 md:grid-cols-[minmax(0,1fr),220px]">
              <Input
                onChange={(event) => setParticipantSearch(event.target.value)}
                placeholder="Search participants by name, email, username, or organization"
                value={participantSearch}
              />
              <Select
                value={participantStatusFilter}
                onChange={(event) => setParticipantStatusFilter(event.target.value)}
                options={[
                  { value: "all", label: "All participants" },
                  { value: "INVITED", label: "Invited" },
                  { value: "NOT_STARTED", label: "Not started" },
                  { value: "IN_PROGRESS", label: "In progress" },
                  { value: "SUBMITTED", label: "Submitted" },
                  { value: "EXTERNAL", label: "External only" },
                  { value: "INTERNAL", label: "Internal only" }
                ]}
              />
            </div>

            {run.responseMode === "INDIVIDUAL_AGGREGATED" && !isSubmitted && run.status !== "ARCHIVED" ? (
              <div className="rounded-[1rem] border bg-[linear-gradient(135deg,_rgba(238,248,232,0.75),_rgba(255,255,255,0.98))] p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Finalize from individual responses</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Aggregation averages submitted participant answers per question, chooses the nearest maturity level, writes the final shared run responses, and submits the run for normal reporting.
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      Progress: {participantProgress.submitted}/{requiredParticipantSubmissions || 0} required submissions ready.
                    </div>
                  </div>
                  <Button
                    disabled={!canAggregateParticipantResponses || aggregateParticipantResponsesMutation.isPending}
                    onClick={() => aggregateParticipantResponsesMutation.mutate()}
                    type="button"
                  >
                    Aggregate and submit
                  </Button>
                </div>
                <div className="mt-4 rounded-[1rem] border bg-white/85 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Bot className="h-4 w-4 text-primary" />
                        AI aggregation insight
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Review disagreement, comment themes, and facilitator questions before aggregating submitted participant responses.
                      </div>
                    </div>
                    <Button
                      disabled={aggregationInsightMutation.isPending || participantProgress.submitted === 0}
                      onClick={() => aggregationInsightMutation.mutate()}
                      type="button"
                      variant="outline"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {aggregationInsightMutation.isPending ? "Reviewing..." : "Generate insight"}
                    </Button>
                  </div>
                  {aggregationInsightMutation.data ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={aggregationInsightMutation.data.disagreementLevel === "low" ? "success" : aggregationInsightMutation.data.disagreementLevel === "high" ? "secondary" : "outline"}>
                          {aggregationInsightMutation.data.disagreementLevel} disagreement
                        </Badge>
                        {aggregationInsightMutation.data.providerLabel ? <Badge variant="outline">{aggregationInsightMutation.data.providerLabel}</Badge> : null}
                        <Badge variant="outline">Submitted participants only</Badge>
                      </div>
                      <div className="rounded-xl bg-muted/30 px-3 py-3 text-sm leading-6 text-foreground">
                        {aggregationInsightMutation.data.summary}
                      </div>
                      <div className="rounded-xl border bg-white px-3 py-3 text-sm leading-6 text-muted-foreground">
                        <span className="font-medium text-foreground">Readiness: </span>
                        {aggregationInsightMutation.data.aggregationReadiness}
                      </div>
                      {aggregationInsightMutation.data.highVarianceQuestions.length ? (
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">High-variance questions</div>
                          <div className="mt-2 space-y-2">
                            {aggregationInsightMutation.data.highVarianceQuestions.map((item, index) => (
                              <div className="rounded-xl border bg-white px-3 py-3 text-sm" key={`aggregation-variance-${index}`}>
                                <div className="font-medium text-foreground">{item.domainTitle}</div>
                                <div className="mt-1 text-muted-foreground">{item.prompt}</div>
                                <div className="mt-2 text-foreground">{item.reason}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      <div className="grid gap-3 md:grid-cols-2">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Comment themes</div>
                          <div className="mt-2 space-y-2">
                            {aggregationInsightMutation.data.commentThemes.map((item, index) => (
                              <div className="rounded-xl bg-muted/30 px-3 py-2 text-sm text-foreground" key={`aggregation-theme-${index}`}>
                                {item}
                              </div>
                            ))}
                            {!aggregationInsightMutation.data.commentThemes.length ? <div className="text-sm text-muted-foreground">No strong comment themes detected.</div> : null}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Facilitator questions</div>
                          <div className="mt-2 space-y-2">
                            {aggregationInsightMutation.data.facilitatorQuestions.map((item, index) => (
                              <div className="rounded-xl bg-primary/5 px-3 py-2 text-sm text-foreground" key={`aggregation-question-${index}`}>
                                {item}
                              </div>
                            ))}
                            {!aggregationInsightMutation.data.facilitatorQuestions.length ? <div className="text-sm text-muted-foreground">No follow-up questions suggested.</div> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {filteredParticipants.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {filteredParticipants.map((participant) => (
                  <div className="rounded-[1rem] border bg-white px-4 py-3" key={participant.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-foreground">{participant.displayName}</div>
                        <div className="mt-1 truncate text-xs text-muted-foreground">
                          {participant.externalContact
                            ? `${participant.email || "No email"} · External contact`
                            : participant.email || participant.user?.username || "Internal participant"}
                        </div>
                      </div>
                      <Badge variant={getParticipantStatusVariant(participant.status)}>{getParticipantStatusLabel(participant.status)}</Badge>
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {participant.responseCount}/{totalQuestions} answers saved ·{" "}
                      Invited {formatDate(participant.invitedAt)}
                      {participant.startedAt ? ` · Started ${formatDate(participant.startedAt)}` : ""}
                      {participant.submittedAt ? ` · Submitted ${formatDate(participant.submittedAt)}` : ""}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant={getEmailDeliveryVariant(participant.latestEmailDelivery)}>
                        {getEmailDeliveryLabel(participant.latestEmailDelivery)}
                      </Badge>
                      {participant.latestEmailDelivery?.errorMessage ? (
                        <span className="text-xs text-destructive" title={participant.latestEmailDelivery.errorMessage}>
                          Email error
                        </span>
                      ) : null}
                    </div>
                    {participant.externalAccessUrl ? (
                      <div className="mt-2 truncate rounded-lg bg-muted/40 px-2 py-1 text-xs text-muted-foreground" title={buildAbsoluteGuestUrl(participant.externalAccessUrl)}>
                        {buildAbsoluteGuestUrl(participant.externalAccessUrl)}
                      </div>
                    ) : null}
                    {participant.externalContact ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant={participant.externalAccessRevoked ? "secondary" : "outline"}>
                          {participant.externalAccessRevoked ? "Link revoked" : "External link active"}
                        </Badge>
                        <Badge variant="outline">
                          {participant.externalAccessExpiresAt ? `Expires ${formatDate(participant.externalAccessExpiresAt)}` : "No expiry"}
                        </Badge>
                      </div>
                    ) : null}
                    {!isSubmitted && (participant.email || participant.externalAccessUrl) ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="h-8 px-2.5 text-xs"
                          disabled={sendParticipantInviteEmailMutation.isPending}
                          onClick={() => sendParticipantInviteEmailMutation.mutate(participant.id)}
                          type="button"
                          variant="outline"
                        >
                          Email invite
                        </Button>
                        {participant.status !== "SUBMITTED" ? (
                          <Button
                            className="h-8 px-2.5 text-xs"
                            disabled={sendParticipantReminderEmailMutation.isPending}
                            onClick={() => sendParticipantReminderEmailMutation.mutate(participant.id)}
                            type="button"
                            variant="outline"
                          >
                            Reminder
                          </Button>
                        ) : null}
                        {participant.externalAccessUrl ? (
                          <>
                            <Button
                              className="h-8 px-2.5 text-xs"
                              onClick={() => window.open(buildAbsoluteGuestUrl(participant.externalAccessUrl!), "_blank", "noopener,noreferrer")}
                              type="button"
                              variant="ghost"
                            >
                              Open
                            </Button>
                            <Button
                              className="h-8 px-2.5 text-xs"
                              onClick={async () => {
                                await copyTextToClipboard(buildAbsoluteGuestUrl(participant.externalAccessUrl!));
                                toast.success("External participant link copied");
                              }}
                              type="button"
                              variant="ghost"
                            >
                              Copy link
                            </Button>
                          </>
                        ) : null}
                        {participant.externalContact ? (
                          <>
                            <Button
                              className="h-8 px-2.5 text-xs"
                              disabled={updateExternalParticipantLinkExpiryMutation.isPending}
                              onClick={() => updateExternalParticipantLinkExpiryMutation.mutate(participant.id)}
                              type="button"
                              variant="outline"
                            >
                              Update expiry
                            </Button>
                            <Button
                              className="h-8 px-2.5 text-xs"
                              disabled={regenerateExternalParticipantLinkMutation.isPending}
                              onClick={() => regenerateExternalParticipantLinkMutation.mutate(participant.id)}
                              type="button"
                              variant="outline"
                            >
                              Regenerate link
                            </Button>
                            {!participant.externalAccessRevoked ? (
                              <Button
                                className="h-8 px-2.5 text-xs"
                                disabled={revokeExternalParticipantLinkMutation.isPending}
                                onClick={() => revokeExternalParticipantLinkMutation.mutate(participant.id)}
                                type="button"
                                variant="ghost"
                              >
                                Revoke link
                              </Button>
                            ) : null}
                          </>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        className="h-8 px-2.5 text-xs"
                        onClick={() =>
                          setSelectedEmailHistoryParticipantId((current) => (current === participant.id ? null : participant.id))
                        }
                        type="button"
                        variant="ghost"
                      >
                        Email history
                      </Button>
                      {!isSubmitted && participant.responseCount === 0 && participant.status !== "SUBMITTED" ? (
                        <Button
                          className="h-8 px-2.5 text-xs text-destructive hover:text-destructive"
                          disabled={removeParticipantMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Remove ${participant.displayName} from this run?`)) {
                              removeParticipantMutation.mutate(participant.id);
                            }
                          }}
                          type="button"
                          variant="ghost"
                        >
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    {selectedEmailHistoryParticipantId === participant.id ? (
                      <div className="mt-3 rounded-xl border bg-muted/20 p-3">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Email history</div>
                        {participantEmailHistoryQuery.isLoading ? (
                          <div className="text-xs text-muted-foreground">Loading email history...</div>
                        ) : (participantEmailHistoryQuery.data ?? []).length ? (
                          <div className="space-y-2">
                            {(participantEmailHistoryQuery.data ?? []).map((delivery) => (
                              <div className="rounded-lg border bg-white px-3 py-2" key={delivery.id}>
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={delivery.status === "SENT" ? "success" : delivery.status === "FAILED" ? "secondary" : "outline"}>
                                    {delivery.status}
                                  </Badge>
                                  <span className="text-xs font-medium text-foreground">{delivery.type.replace(/_/g, " ")}</span>
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground">
                                  {delivery.recipientEmail} · {formatDateTime(delivery.sentAt ?? delivery.failedAt ?? delivery.createdAt)}
                                </div>
                                {delivery.errorMessage ? <div className="mt-1 text-xs text-destructive">{delivery.errorMessage}</div> : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs text-muted-foreground">No email delivery records for this participant yet.</div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
                {participants.length ? "No participants match the current filters." : "No individual team-member participants are assigned yet."}
              </div>
            )}

            {!isSubmitted && run.status !== "ARCHIVED" ? (
              <div className="space-y-3 rounded-[1rem] border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Add team members</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Adding members switches the run to individual team-member mode. Existing shared answers are not changed.
                    </div>
                  </div>
                  <Badge variant={selectedParticipantUserIds.length ? "outline" : "secondary"}>{selectedParticipantUserIds.length} selected</Badge>
                </div>
                {availableTeamParticipants.length ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {availableTeamParticipants.map((participant) => (
                      <label className="flex items-start gap-3 rounded-xl border bg-white px-3 py-3 text-sm" key={participant.id}>
                        <input
                          checked={selectedParticipantUserIds.includes(participant.id)}
                          className="mt-1"
                          onChange={(event) => {
                            setSelectedParticipantUserIds((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, participant.id]))
                                : current.filter((userId) => userId !== participant.id)
                            );
                          }}
                          type="checkbox"
                        />
                        <span>
                          <span className="block font-medium text-foreground">{participant.label}</span>
                          <span className="block text-xs text-muted-foreground">{participant.detail}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-white px-4 py-5 text-sm text-muted-foreground">
                    Every active member of this team is already added, or the team has no assignable members.
                  </div>
                )}
                <Button
                  disabled={!selectedParticipantUserIds.length || updateParticipantsMutation.isPending}
                  onClick={() => updateParticipantsMutation.mutate()}
                  type="button"
                  variant="outline"
                >
                  Add selected participants
                </Button>
              </div>
            ) : null}

            {!isSubmitted && run.status !== "ARCHIVED" ? (
              <div className="space-y-3 rounded-[1rem] border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Add external contacts</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      External contacts receive tokenized individual response links and do not need platform accounts.
                    </div>
                  </div>
                  <Badge variant={selectedExternalParticipantContactIds.length ? "outline" : "secondary"}>
                    {selectedExternalParticipantContactIds.length} selected
                  </Badge>
                </div>
                <div className="max-w-xs space-y-2">
                  <Label>Link expiry</Label>
                  <Select
                    value={externalParticipantExpiryDays}
                    onChange={(event) => setExternalParticipantExpiryDays(event.target.value)}
                    options={[
                      { value: "7", label: "7 days" },
                      { value: "14", label: "14 days" },
                      { value: "30", label: "30 days" },
                      { value: "none", label: "No expiry" }
                    ]}
                  />
                </div>
                {availableExternalParticipantContacts.length ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {availableExternalParticipantContacts.map((contact) => (
                      <label className="flex items-start gap-3 rounded-xl border bg-white px-3 py-3 text-sm" key={contact.id}>
                        <input
                          checked={selectedExternalParticipantContactIds.includes(contact.id)}
                          className="mt-1"
                          onChange={(event) => {
                            setSelectedExternalParticipantContactIds((current) =>
                              event.target.checked
                                ? Array.from(new Set([...current, contact.id]))
                                : current.filter((contactId) => contactId !== contact.id)
                            );
                          }}
                          type="checkbox"
                        />
                        <span>
                          <span className="block font-medium text-foreground">{contact.label}</span>
                          <span className="block text-xs text-muted-foreground">{contact.detail}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed bg-white px-4 py-5 text-sm text-muted-foreground">
                    Every external contact is already added, or no external contacts exist yet. Add contacts from Administration or the guest participation panel.
                  </div>
                )}
                <Button
                  disabled={!selectedExternalParticipantContactIds.length || updateExternalParticipantsMutation.isPending}
                  onClick={() => updateExternalParticipantsMutation.mutate()}
                  type="button"
                  variant="outline"
                >
                  Add selected external contacts
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {canManageRun && !isSubmitted && run?.status !== "ARCHIVED" ? (
        <Card>
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-4 py-1">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">Guest participation</div>
                  <Badge variant={guestParticipationEnabled ? "default" : "secondary"}>
                    {guestParticipationEnabled ? "Enabled" : "Off"}
                  </Badge>
                  {guestParticipationEnabled ? <Badge variant="outline">{activeGuestLinks.length} active</Badge> : null}
                  {guestParticipationEnabled ? <Badge variant="success">{submittedGuestLinks.length} submitted</Badge> : null}
                  {guestParticipationEnabled && inactiveGuestLinks.length ? (
                    <Badge variant="secondary">{inactiveGuestLinks.length} inactive</Badge>
                  ) : null}
                  {guestParticipationEnabled && guestResultsVisible ? <Badge variant="outline">Guest results visible</Badge> : null}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Use this when the run needs outside participants without platform accounts.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-3 text-sm text-muted-foreground">
                  <input
                    checked={guestParticipationEnabled}
                    disabled={updateGuestParticipationEnabledMutation.isPending}
                    onChange={(event) => {
                      const nextEnabled = event.target.checked;
                      setGuestParticipationEnabled(nextEnabled);
                      if (!nextEnabled) {
                        setGuestResultsVisible(false);
                      }
                      updateGuestParticipationEnabledMutation.mutate(nextEnabled);
                    }}
                    type="checkbox"
                  />
                  Enable guest participation
                </label>
                <Button
                  disabled={!guestParticipationEnabled}
                  onClick={() => setIsGuestParticipationOpen(true)}
                  type="button"
                  variant="outline"
                >
                  Manage links
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isGuestParticipationOpen && guestParticipationEnabled ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-5xl rounded-[1.5rem] border border-primary/20 bg-white p-6 shadow-2xl">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold text-foreground">Guest participation</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Create guest links, control guest results visibility, and review active or completed external participation.
                </div>
              </div>
              <Button onClick={() => setIsGuestParticipationOpen(false)} type="button" variant="outline">
                Close
              </Button>
            </div>

            <div className="mt-6 space-y-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr),minmax(0,0.85fr)]">
                <div className="rounded-[1rem] border bg-[linear-gradient(135deg,_rgba(238,248,232,0.9),_rgba(255,255,255,0.98))] px-4 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Overview</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">{activeGuestLinks.length} active</Badge>
                    <Badge variant="success">{submittedGuestLinks.length} submitted</Badge>
                    <Badge variant="secondary">{inactiveGuestLinks.length} inactive</Badge>
                    <Badge variant={guestResultsVisible ? "outline" : "secondary"}>
                      {guestResultsVisible ? "Results visible" : "Results hidden"}
                    </Badge>
                  </div>
                </div>
                <div className="rounded-[1rem] border bg-muted/20 px-4 py-4">
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">Create guest link</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Generate a shareable link for an external participant.
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto,auto] md:items-end">
                      <div className="space-y-2 md:col-span-3">
                        <Label>Reusable external contact</Label>
                        <Select
                          options={[
                            { value: "", label: "No contact / one-off guest link" },
                            ...externalContacts.map((contact) => ({
                              value: contact.id,
                              label: `${contact.displayName}${contact.organization ? ` (${contact.organization})` : ""}${contact.email ? ` · ${contact.email}` : ""}`
                            }))
                          ]}
                          value={guestExternalContactId}
                          onChange={(event) => setGuestExternalContactId(event.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Invite label</Label>
                        <Input
                          onChange={(event) => setGuestInviteLabel(event.target.value)}
                          placeholder="Vendor workshop"
                          value={guestInviteLabel}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Link expiry</Label>
                        <Select
                          options={[
                            { value: "7", label: "7 days" },
                            { value: "14", label: "14 days" },
                            { value: "30", label: "30 days" },
                            { value: "none", label: "No expiry" }
                          ]}
                          value={guestExpiryDays}
                          onChange={(event) => setGuestExpiryDays(event.target.value)}
                        />
                      </div>
                      <Button disabled={createGuestLinkMutation.isPending} onClick={() => createGuestLinkMutation.mutate()} type="button">
                        {createGuestLinkMutation.isPending ? "Creating..." : "Create guest link"}
                      </Button>
                    </div>
                    <div className="mt-4 rounded-[1rem] border bg-white p-3">
                      <div className="text-sm font-semibold text-foreground">Add external contact</div>
                      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr),minmax(0,1fr),minmax(0,1fr),auto] md:items-end">
                        <div className="space-y-2">
                          <Label>Name</Label>
                          <Input value={newExternalContactName} onChange={(event) => setNewExternalContactName(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Email</Label>
                          <Input value={newExternalContactEmail} onChange={(event) => setNewExternalContactEmail(event.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label>Organization</Label>
                          <Input value={newExternalContactOrganization} onChange={(event) => setNewExternalContactOrganization(event.target.value)} />
                        </div>
                        <Button
                          disabled={!newExternalContactName.trim() || createExternalContactMutation.isPending}
                          onClick={() => createExternalContactMutation.mutate()}
                          type="button"
                          variant="outline"
                        >
                          Save contact
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1rem] border bg-muted/20 px-4 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-foreground">Allow guests to view submitted results</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      If enabled, guests who submit through their link can open a guest-safe results page after submission.
                    </div>
                  </div>
                  <label className="flex items-center gap-3 text-sm text-muted-foreground">
                    <input
                      checked={guestResultsVisible}
                      disabled={updateGuestParticipationSettingsMutation.isPending}
                      onChange={(event) => {
                        const nextVisible = event.target.checked;
                        setGuestResultsVisible(nextVisible);
                        updateGuestParticipationSettingsMutation.mutate(nextVisible);
                      }}
                      type="checkbox"
                    />
                    Guest results visible
                  </label>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-3">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">Active guest links</div>
                    <Badge variant="outline">{activeGuestLinks.length}</Badge>
                  </div>
                  {renderGuestLinkList(activeGuestLinks, "No active guest links.")}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">Submitted guest sessions</div>
                    <Badge variant="success">{submittedGuestLinks.length}</Badge>
                  </div>
                  {renderGuestLinkList(submittedGuestLinks, "No submitted guest sessions yet.")}
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">Inactive links</div>
                    <Badge variant="secondary">{inactiveGuestLinks.length}</Badge>
                  </div>
                  {renderGuestLinkList(inactiveGuestLinks, "No expired or revoked links.")}
                </div>
              </div>
            </div>
          </div>
        </div>
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
            {isIndividualCollectionRun
              ? "This run is collecting individual participant responses. Use aggregation when enough participants submit."
              : isSubmitted
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
                    {isIndividualCollectionRun
                      ? `${participantProgress.submitted}/${requiredParticipantSubmissions || 0} required submissions`
                      : `${answeredQuestions}/${totalQuestions} questions answered`}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isIndividualCollectionRun ? (
                      <>
                        <Badge variant="success">{participantProgress.submitted} submitted</Badge>
                        <Badge variant="outline">{participantProgress.inProgress} in progress</Badge>
                        <Badge variant="secondary">{participantProgress.notStarted} not started</Badge>
                      </>
                    ) : (
                      <>
                        <Badge variant={unansweredQuestions ? "secondary" : "success"}>
                          {unansweredQuestions ? `${unansweredQuestions} unanswered` : "All questions answered"}
                        </Badge>
                        {firstUnansweredQuestionId ? <Badge variant="outline">Next gap ready to resume</Badge> : null}
                      </>
                    )}
                  </div>
                </div>
                <div className="rounded-[1.25rem] bg-white px-4 py-3 text-right shadow-sm">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Completion</div>
                  <div className="mt-1 text-2xl font-semibold text-primary">
                    {isIndividualCollectionRun ? `${participantProgress.submitted}/${requiredParticipantSubmissions || 0}` : `${totalQuestions ? Math.round((answeredQuestions / totalQuestions) * 100) : 0}%`}
                  </div>
                </div>
              </div>
              <div className="mt-5 h-3 rounded-full bg-white">
                <div
                  className="h-3 rounded-full bg-primary transition-all"
                  style={{
                    width: `${
                      isIndividualCollectionRun
                        ? requiredParticipantSubmissions
                          ? Math.min(100, (participantProgress.submitted / requiredParticipantSubmissions) * 100)
                          : 0
                        : totalQuestions
                          ? (answeredQuestions / totalQuestions) * 100
                          : 0
                    }%`
                  }}
                />
              </div>
              <div className={`mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border px-4 py-3 text-sm ${autosaveToneClass}`}>
                <div className="flex items-center gap-2">
                  {autosaveStatus === "error" ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : autosaveStatus === "saved" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : null}
                  <span className="font-medium">{autosaveMessage}</span>
                </div>
                <div className="text-xs">
                  Last saved: {lastSavedAt ? formatDateTime(lastSavedAt) : "Not yet"}
                </div>
              </div>
            </div>

            {isIndividualCollectionRun ? (
              <div className="rounded-[1.75rem] border border-primary/20 bg-gradient-to-br from-primary/10 via-[#eef8e8] to-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Individual response collection</div>
                <div className="mt-2 text-xl font-semibold text-foreground">Shared editing is paused</div>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Team members should answer from My Assessments. When the required number of responses is submitted, use Aggregate and submit from the participant panel.
                </p>
              </div>
            ) : null}

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
              <div className="inline-flex items-center rounded-full bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {unansweredQuestions
                  ? `${unansweredQuestions} questions still need answers before submission`
                  : "Everything is answered and ready for final submission"}
              </div>
            ) : null}
            {!isSubmitted && canEditResponses ? (
              <>
                <Button onClick={() => saveMutation.mutate(responses)} type="button" variant="secondary">
                  Save draft now
                </Button>
                <Button
                  disabled={!canManageRun || !run || answeredQuestions < totalQuestions || submitMutation.isPending}
                  onClick={() => setIsSubmitConfirmOpen(true)}
                  type="button"
                >
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

      {run && isSubmitConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 px-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[1.5rem] border border-primary/20 bg-white p-6 shadow-2xl">
            <div className="space-y-2">
              <div className="text-lg font-semibold text-foreground">Submit assessment</div>
              <div className="text-sm text-muted-foreground">
                This will finalize the run and move it into submitted results. The assessment content will become read-only.
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-[1rem] border bg-muted/20 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Answered</div>
                <div className="mt-1 text-xl font-semibold text-foreground">{answeredQuestions}</div>
              </div>
              <div className="rounded-[1rem] border bg-muted/20 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Total</div>
                <div className="mt-1 text-xl font-semibold text-foreground">{totalQuestions}</div>
              </div>
              <div className="rounded-[1rem] border bg-muted/20 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Summary note</div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  {submissionSummary.trim() ? "Included" : "Not provided"}
                </div>
              </div>
            </div>

            <div className={`mt-4 rounded-[1rem] border px-4 py-3 text-sm ${unansweredQuestions ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
              {unansweredQuestions
                ? `${unansweredQuestions} questions are still unanswered. Complete them before submitting.`
                : "All questions are answered. This run is ready to submit."}
            </div>

            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button onClick={() => setIsSubmitConfirmOpen(false)} type="button" variant="outline">
                Cancel
              </Button>
              <Button
                disabled={submitMutation.isPending || unansweredQuestions > 0}
                onClick={() => submitMutation.mutate()}
                type="button"
              >
                {submitMutation.isPending ? "Submitting..." : "Confirm submit"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Button className="w-fit px-0 text-sm font-medium text-primary" onClick={() => navigate(returnTo)} type="button" variant="ghost">
        Back to all assessment runs
      </Button>
    </div>
  );
}

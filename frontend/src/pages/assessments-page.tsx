import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth-context";
import { ApiError, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AssessmentPeriodType, AssessmentResponseMode, AssessmentRunSummary, ExternalContact, Team, TemplateSummary, UserSummary } from "@/types";

type DuplicateCheckResponse = {
  periodLabel: string;
  hasDuplicate: boolean;
  matches: Array<{
    id: string;
    title: string;
    status: AssessmentRunSummary["status"];
    periodLabel: string;
    updatedAt: string;
    teamName: string;
    templateName: string;
  }>;
};

type PendingRunAction =
  | { type: "archive"; run: AssessmentRunSummary }
  | { type: "copy"; run: AssessmentRunSummary }
  | { type: "delete"; run: AssessmentRunSummary }
  | { type: "restore"; run: AssessmentRunSummary };

function toIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function formatDateLabel(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

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

function startOfToday() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

function getDueDateState(run: AssessmentRunSummary) {
  if (!run.dueDate || run.status === "SUBMITTED" || run.status === "ARCHIVED") {
    return null;
  }

  const dueDate = new Date(run.dueDate);
  const today = startOfToday();
  const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return { label: "Overdue", variant: "secondary" as const };
  }

  if (diffDays <= 3) {
    return { label: "Due soon", variant: "default" as const };
  }

  return { label: "Scheduled", variant: "outline" as const };
}

function dueDateSortValue(run: AssessmentRunSummary) {
  if (run.status === "ARCHIVED") {
    return Number.MAX_SAFE_INTEGER;
  }

  if (!run.dueDate) {
    return Number.MAX_SAFE_INTEGER - 1;
  }

  return new Date(run.dueDate).getTime();
}

function RunTable({
  actionLabel,
  emptyMessage,
  onArchive,
  onCopy,
  onDelete,
  onRestore,
  runs,
  submittedView
}: {
  actionLabel?: string;
  emptyMessage: string;
  onArchive?: (run: AssessmentRunSummary) => void;
  onCopy?: (run: AssessmentRunSummary) => void;
  onDelete?: (run: AssessmentRunSummary) => void;
  onRestore?: (run: AssessmentRunSummary) => void;
  runs: AssessmentRunSummary[];
  submittedView: boolean;
}) {
  if (!runs.length) {
    return (
      <div className="rounded-[1.25rem] border border-dashed bg-muted/20 px-6 py-10 text-sm text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Assessment</TableHead>
          <TableHead>Team</TableHead>
          <TableHead>Template</TableHead>
          <TableHead>Owner</TableHead>
          <TableHead>Period</TableHead>
          <TableHead>Due</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Urgency</TableHead>
          <TableHead>{submittedView ? "Submitted" : "Updated"}</TableHead>
          <TableHead>Score</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {runs.map((run) => (
          <TableRow className={getDueDateState(run)?.label === "Overdue" ? "bg-secondary/70" : undefined} key={run.id}>
            <TableCell>
              <div className="space-y-1">
                <div className="font-medium">{run.title}</div>
                {run.guestParticipationEnabled ? <Badge variant="outline">Guest-enabled</Badge> : null}
                {run.responseMode === "INDIVIDUAL_AGGREGATED" ? <Badge variant="secondary">Individual responses</Badge> : null}
              </div>
            </TableCell>
            <TableCell>
              <div className="space-y-1">
                <div>{run.team.name}</div>
                {run.team.group ? <Badge variant="outline">{run.team.group.name}</Badge> : null}
              </div>
            </TableCell>
            <TableCell>
              {run.templateVersion.name} v{run.templateVersion.versionNumber}
            </TableCell>
            <TableCell>{run.ownerName || "-"}</TableCell>
            <TableCell>{run.periodLabel}</TableCell>
            <TableCell>{formatDate(run.dueDate)}</TableCell>
            <TableCell>
              <Badge variant={run.status === "SUBMITTED" ? "success" : run.status === "IN_PROGRESS" ? "default" : "secondary"}>
                {run.status}
              </Badge>
            </TableCell>
            <TableCell>
              {getDueDateState(run) ? <Badge variant={getDueDateState(run)?.variant}>{getDueDateState(run)?.label}</Badge> : "-"}
            </TableCell>
            <TableCell>{formatDate(submittedView ? run.submittedAt : run.updatedAt)}</TableCell>
            <TableCell>{run.overallScore != null ? run.overallScore.toFixed(2) : "-"}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                {run.status !== "ARCHIVED" ? (
                  <Link
                    className={cn(buttonVariants({ size: "sm", variant: submittedView ? "outline" : "default" }))}
                    state={{ returnTo: submittedView ? "/assessments?tab=submitted" : "/assessments?tab=active" }}
                    to={submittedView ? `/assessments/${run.id}/results` : `/assessments/${run.id}`}
                  >
                    {actionLabel ?? (submittedView ? "View results" : "Continue")}
                  </Link>
                ) : null}
                {run.status !== "ARCHIVED" && onCopy ? (
                  <Button onClick={() => onCopy(run)} size="sm" type="button" variant="outline">
                    Copy
                  </Button>
                ) : null}
                {!submittedView && run.status !== "ARCHIVED" && onArchive ? (
                  <Button onClick={() => onArchive(run)} size="sm" type="button" variant="outline">
                    Archive
                  </Button>
                ) : null}
                {!submittedView && run.status !== "ARCHIVED" && onDelete ? (
                  <Button onClick={() => onDelete(run)} size="sm" type="button" variant="ghost">
                    Delete
                  </Button>
                ) : null}
                {submittedView && run.status !== "ARCHIVED" && onArchive ? (
                  <Button onClick={() => onArchive(run)} size="sm" type="button" variant="outline">
                    Archive
                  </Button>
                ) : null}
                {!submittedView && run.status === "ARCHIVED" && onRestore ? (
                  <Button onClick={() => onRestore(run)} size="sm" type="button" variant="outline">
                    Restore
                  </Button>
                ) : null}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function AssessmentsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const initialTab = searchParams.get("tab");
  const initialTeamId = searchParams.get("teamId") ?? "";
  const [pageTab, setPageTab] = useState(initialTab === "active" || initialTab === "submitted" || initialTab === "create" ? initialTab : "create");
  const [title, setTitle] = useState("");
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [teamId, setTeamId] = useState(initialTeamId);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [guestParticipationEnabled, setGuestParticipationEnabled] = useState(false);
  const [responseMode, setResponseMode] = useState<AssessmentResponseMode>("SHARED");
  const [participantUserIds, setParticipantUserIds] = useState<string[]>([]);
  const [participantExternalContactIds, setParticipantExternalContactIds] = useState<string[]>([]);
  const [minimumParticipantResponses, setMinimumParticipantResponses] = useState("");
  const [periodType, setPeriodType] = useState<AssessmentPeriodType>("QUARTER");
  const [periodLabel, setPeriodLabel] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [quarter, setQuarter] = useState(Math.min(4, Math.max(1, Math.ceil((new Date().getMonth() + 1) / 3))));
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [referenceDate, setReferenceDate] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);
  const [search, setSearch] = useState("");
  const [teamGroupFilter, setTeamGroupFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [templateFilter, setTemplateFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [guestFilter, setGuestFilter] = useState("all");
  const [periodTypeFilter, setPeriodTypeFilter] = useState("all");
  const [dueDateFilter, setDueDateFilter] = useState("all");
  const [submittedDateFrom, setSubmittedDateFrom] = useState("");
  const [submittedDateTo, setSubmittedDateTo] = useState("");
  const [scoreBandFilter, setScoreBandFilter] = useState("all");
  const [pendingRunAction, setPendingRunAction] = useState<PendingRunAction | null>(null);

  const runsQuery = useQuery({
    queryKey: ["assessment-runs"],
    queryFn: () => api.get<AssessmentRunSummary[]>("/assessment-runs")
  });
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/teams")
  });
  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<TemplateSummary[]>("/templates")
  });
  const usersQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => api.get<UserSummary[]>("/users/assignable")
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
    }
  });

  const templateOptions = useMemo(
    () =>
      (templatesQuery.data ?? []).map((template) => ({
        value: template.id,
        label: `${template.name} (${template.latestVersion ? `v${template.latestVersion.versionNumber}` : "no version"})`
      })),
    [templatesQuery.data]
  );
  const templateFilterOptions = useMemo(
    () =>
      Array.from(new Set((runsQuery.data ?? []).map((run) => run.templateVersion.name))).map((templateName) => ({
        value: templateName,
        label: templateName
      })),
    [runsQuery.data]
  );
  const teamOptions = useMemo(
    () => (teamsQuery.data ?? []).map((team) => ({ value: team.id, label: team.group ? `${team.name} (${team.group.name})` : team.name })),
    [teamsQuery.data]
  );
  const teamGroupOptions = useMemo(
    () =>
      Array.from(
        new Map(
          (teamsQuery.data ?? [])
            .filter((team) => team.group)
            .map((team) => [team.group!.id, { value: team.group!.id, label: team.group!.name }])
        ).values()
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [teamsQuery.data]
  );
  const ownerOptions = useMemo(
    () =>
      [{ value: "", label: "No explicit owner" }].concat(
        (usersQuery.data ?? []).map((user) => ({
          value: user.id,
          label: `${user.displayName} (${user.username})`
        }))
      ),
    [usersQuery.data]
  );
  const selectedOwner = (usersQuery.data ?? []).find((candidate) => candidate.id === ownerUserId);
  const canCreateRuns = user?.role === "ADMIN" || user?.role === "TEAM_LEAD";

  const selectedTemplate = (templatesQuery.data ?? []).find((template) => template.id === templateId);
  const selectedTeam = (teamsQuery.data ?? []).find((team) => team.id === teamId);
  const teamParticipantOptions = useMemo(
    () =>
      (usersQuery.data ?? [])
        .filter((candidate) => candidate.teams.some((team) => team.id === teamId))
        .map((candidate) => ({
          id: candidate.id,
          label: candidate.displayName,
          detail: `${candidate.username}${candidate.email ? ` · ${candidate.email}` : ""}`
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [teamId, usersQuery.data]
  );
  const externalParticipantOptions = useMemo(
    () =>
      (externalContactsQuery.data ?? [])
        .map((contact) => ({
          id: contact.id,
          label: contact.displayName,
          detail: `${contact.email || "No email"}${contact.organization ? ` · ${contact.organization}` : ""}`
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [externalContactsQuery.data]
  );
  const ownerFilterOptions = useMemo(
    () => [{ value: "all", label: "All assignees" }, { value: "unassigned", label: "Unassigned" }, ...ownerOptions.filter((option) => option.value)],
    [ownerOptions]
  );
  const suggestedPeriodLabel = useMemo(() => {
    if (periodLabel.trim()) {
      return periodLabel.trim();
    }

    if (periodType === "QUARTER") {
      return `Q${quarter} ${year}`;
    }

    if (periodType === "CUSTOM_RANGE") {
      return startDate && endDate ? `${formatDateLabel(startDate)} - ${formatDateLabel(endDate)}` : "";
    }

    return referenceDate ? formatDateLabel(referenceDate) : "";
  }, [endDate, periodLabel, periodType, quarter, referenceDate, startDate, year]);
  const suggestedTitle = useMemo(() => {
    if (!selectedTemplate?.name || !selectedTeam?.name || !suggestedPeriodLabel) {
      return "";
    }

    const parts = [selectedTemplate.name, selectedTeam.name, suggestedPeriodLabel];
    return parts.join(" - ");
  }, [selectedTeam?.name, selectedTemplate?.name, suggestedPeriodLabel]);
  const effectiveTitle = titleManuallyEdited ? title : suggestedTitle;

  const createPayload = useMemo(() => {
    const basePayload = {
      title: effectiveTitle,
      teamId,
      templateId,
      templateVersionId: selectedTemplate?.latestVersion?.id ?? "",
      ownerUserId: ownerUserId || undefined,
      ownerName: selectedOwner?.displayName || undefined,
      dueDate: dueDate ? toIsoDate(dueDate) : undefined,
      guestParticipationEnabled,
      responseMode,
      minimumParticipantResponses:
        responseMode === "INDIVIDUAL_AGGREGATED" && minimumParticipantResponses
          ? Number(minimumParticipantResponses)
          : undefined,
      participantCollection:
        responseMode === "INDIVIDUAL_AGGREGATED"
          ? {
              userIds: participantUserIds,
              externalContactIds: participantExternalContactIds
            }
          : undefined,
      periodType,
      periodLabel: periodLabel.trim() || undefined
    };

    if (periodType === "QUARTER") {
      return { ...basePayload, periodType, year, quarter };
    }

    if (periodType === "CUSTOM_RANGE") {
      return {
        ...basePayload,
        periodType,
        startDate: startDate ? toIsoDate(startDate) : "",
        endDate: endDate ? toIsoDate(endDate) : ""
      };
    }

    return {
      ...basePayload,
      periodType,
      referenceDate: referenceDate ? toIsoDate(referenceDate) : ""
    };
  }, [dueDate, effectiveTitle, endDate, guestParticipationEnabled, minimumParticipantResponses, ownerUserId, participantExternalContactIds, participantUserIds, periodLabel, periodType, quarter, referenceDate, responseMode, selectedOwner?.displayName, selectedTemplate?.latestVersion?.id, startDate, teamId, templateId, year]);

  const periodReady =
    periodType === "QUARTER"
      ? year >= 2024 && quarter >= 1 && quarter <= 4
      : periodType === "CUSTOM_RANGE"
        ? Boolean(startDate && endDate)
        : Boolean(referenceDate);

  const totalSelectedParticipants = participantUserIds.length + participantExternalContactIds.length;
  const participantsReady = responseMode === "SHARED" || totalSelectedParticipants > 0;
  const createReady = Boolean(effectiveTitle.trim() && teamId && templateId && selectedTemplate?.latestVersion?.id && periodReady && participantsReady);

  const duplicateCheckQuery = useQuery({
    queryKey: ["assessment-run-duplicate-check", createPayload],
    queryFn: () => api.post<DuplicateCheckResponse>("/assessment-runs/check-duplicate", createPayload),
    enabled: createReady
  });

  useEffect(() => {
    setAllowDuplicate(false);
  }, [createPayload]);

  useEffect(() => {
    setParticipantUserIds([]);
  }, [teamId]);

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/assessment-runs", {
        ...createPayload,
        allowDuplicate
      }),
    onSuccess: () => {
      toast.success("Assessment run created");
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
      setTitle("");
      setTitleManuallyEdited(false);
      setOwnerUserId("");
      setDueDate("");
      setGuestParticipationEnabled(false);
      setResponseMode("SHARED");
      setParticipantUserIds([]);
      setParticipantExternalContactIds([]);
      setMinimumParticipantResponses("");
      setPeriodLabel("");
      setStartDate("");
      setEndDate("");
      setReferenceDate("");
      setAllowDuplicate(false);
      setPageTab("active");
      setSearchParams({ tab: "active" });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const archiveMutation = useMutation({
    mutationFn: (runId: string) => api.post(`/assessment-runs/${runId}/archive`),
    onSuccess: () => {
      toast.success("Run archived");
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const copyRunMutation = useMutation({
    mutationFn: (runId: string) => api.post<AssessmentRunSummary>(`/assessment-runs/${runId}/copy`),
    onSuccess: () => {
      toast.success("Run copied");
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
      setPageTab("active");
      setSearchParams({ tab: "active" });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (runId: string) => api.delete(`/assessment-runs/${runId}`),
    onSuccess: () => {
      toast.success("Run deleted");
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const restoreMutation = useMutation({
    mutationFn: (runId: string) => api.post(`/assessment-runs/${runId}/unarchive`),
    onSuccess: () => {
      toast.success("Run restored");
      queryClient.invalidateQueries({ queryKey: ["assessment-runs"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const runs = runsQuery.data ?? [];
  const activeRuns = useMemo(() => runs.filter((run) => run.status === "DRAFT" || run.status === "IN_PROGRESS"), [runs]);
  const submittedRuns = useMemo(() => runs.filter((run) => run.status === "SUBMITTED"), [runs]);
  const archivedRuns = useMemo(() => runs.filter((run) => run.status === "ARCHIVED"), [runs]);

  const commonFilteredRuns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return runs.filter((run) => {
      const matchesSearch =
        !query
        || run.title.toLowerCase().includes(query)
        || run.team.name.toLowerCase().includes(query)
        || run.templateVersion.name.toLowerCase().includes(query)
        || run.periodLabel.toLowerCase().includes(query)
        || (run.ownerName ?? "").toLowerCase().includes(query);
      const matchesTeam = teamFilter === "all" || run.team.id === teamFilter;
      const matchesTeamGroup =
        teamGroupFilter === "all"
        || (teamGroupFilter === "none" && !run.team.group)
        || run.team.group?.id === teamGroupFilter;
      const matchesTemplate = templateFilter === "all" || run.templateVersion.name === templateFilter;
      const matchesOwner =
        ownerFilter === "all"
        || (ownerFilter === "unassigned" && !run.ownerUser?.id)
        || run.ownerUser?.id === ownerFilter;
      const matchesGuest =
        guestFilter === "all"
        || (guestFilter === "guest" && run.guestParticipationEnabled)
        || (guestFilter === "internal" && !run.guestParticipationEnabled);
      const matchesPeriodType = periodTypeFilter === "all" || run.periodType === periodTypeFilter;
      return matchesSearch && matchesTeamGroup && matchesTeam && matchesTemplate && matchesOwner && matchesGuest && matchesPeriodType;
    });
  }, [guestFilter, ownerFilter, periodTypeFilter, runs, search, teamFilter, teamGroupFilter, templateFilter]);

  const filteredActiveRuns = commonFilteredRuns
    .filter((run) => run.status === "DRAFT" || run.status === "IN_PROGRESS")
    .filter((run) => {
      const dueState = getDueDateState(run);
      return (
        dueDateFilter === "all"
        || (dueDateFilter === "overdue" && dueState?.label === "Overdue")
        || (dueDateFilter === "due_soon" && dueState?.label === "Due soon")
        || (dueDateFilter === "scheduled" && dueState?.label === "Scheduled")
        || (dueDateFilter === "no_due_date" && !run.dueDate)
      );
    })
    .sort((a, b) => {
      const dueDiff = dueDateSortValue(a) - dueDateSortValue(b);
      if (dueDiff !== 0) {
        return dueDiff;
      }

      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  const filteredSubmittedRuns = commonFilteredRuns
    .filter((run) => run.status === "SUBMITTED")
    .filter((run) => {
      const submittedAt = run.submittedAt ? new Date(run.submittedAt) : null;
      const matchesSubmittedFrom = !submittedDateFrom || (submittedAt && submittedAt >= new Date(`${submittedDateFrom}T00:00:00.000Z`));
      const matchesSubmittedTo = !submittedDateTo || (submittedAt && submittedAt <= new Date(`${submittedDateTo}T23:59:59.999Z`));
      const matchesScoreBand =
        scoreBandFilter === "all"
        || (scoreBandFilter === "high" && typeof run.overallScore === "number" && run.overallScore >= 4)
        || (scoreBandFilter === "medium" && typeof run.overallScore === "number" && run.overallScore >= 2.5 && run.overallScore < 4)
        || (scoreBandFilter === "low" && typeof run.overallScore === "number" && run.overallScore < 2.5)
        || (scoreBandFilter === "no_score" && run.overallScore == null);

      return Boolean(matchesSubmittedFrom && matchesSubmittedTo && matchesScoreBand);
    })
    .sort((a, b) => new Date(b.submittedAt ?? b.updatedAt).getTime() - new Date(a.submittedAt ?? a.updatedAt).getTime());
  const filteredArchivedRuns = commonFilteredRuns
    .filter((run) => run.status === "ARCHIVED")
    .filter((run) => {
      const dueState = getDueDateState(run);
      return (
        dueDateFilter === "all"
        || (dueDateFilter === "overdue" && dueState?.label === "Overdue")
        || (dueDateFilter === "due_soon" && dueState?.label === "Due soon")
        || (dueDateFilter === "scheduled" && dueState?.label === "Scheduled")
        || (dueDateFilter === "no_due_date" && !run.dueDate)
      );
    })
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  const submittedThisMonth = submittedRuns.filter((run) => {
    if (!run.submittedAt) {
      return false;
    }

    const submittedAt = new Date(run.submittedAt);
    const now = new Date();
    return submittedAt.getFullYear() === now.getFullYear() && submittedAt.getMonth() === now.getMonth();
  }).length;

  const filterBlock = (
    <div className="grid gap-3 rounded-[1.25rem] border bg-muted/20 p-4 md:grid-cols-2 xl:grid-cols-8">
      <div className="space-y-2">
        <Label>Search runs</Label>
        <Input placeholder="Title, team, template, owner, or period" value={search} onChange={(event) => setSearch(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Group</Label>
        <Select
          options={[{ value: "all", label: "All groups" }, { value: "none", label: "Ungrouped" }, ...teamGroupOptions]}
          value={teamGroupFilter}
          onChange={(event) => setTeamGroupFilter(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Team</Label>
        <Select
          options={[{ value: "all", label: "All teams" }, ...teamOptions]}
          value={teamFilter}
          onChange={(event) => setTeamFilter(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Template</Label>
        <Select
          options={[{ value: "all", label: "All templates" }, ...templateFilterOptions]}
          value={templateFilter}
          onChange={(event) => setTemplateFilter(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Assignee</Label>
        <Select options={ownerFilterOptions} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} />
      </div>
      <div className="space-y-2">
        <Label>Participation</Label>
        <Select
          options={[
            { value: "all", label: "All runs" },
            { value: "guest", label: "Guest-enabled" },
            { value: "internal", label: "Internal only" }
          ]}
          value={guestFilter}
          onChange={(event) => setGuestFilter(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Period type</Label>
        <Select
          options={[
            { value: "all", label: "All period types" },
            { value: "QUARTER", label: "Quarter" },
            { value: "CUSTOM_RANGE", label: "Custom range" },
            { value: "POINT_IN_TIME", label: "Specific date" }
          ]}
          value={periodTypeFilter}
          onChange={(event) => setPeriodTypeFilter(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Due date</Label>
        <Select
          options={[
            { value: "all", label: "All due states" },
            { value: "overdue", label: "Overdue" },
            { value: "due_soon", label: "Due soon" },
            { value: "scheduled", label: "Scheduled" },
            { value: "no_due_date", label: "No due date" }
          ]}
          value={dueDateFilter}
          onChange={(event) => setDueDateFilter(event.target.value)}
        />
      </div>
    </div>
  );

  const submittedFilterBlock = (
    <div className="space-y-3 rounded-[1.25rem] border bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
        <div className="space-y-2 xl:col-span-2">
          <Label>Search submitted runs</Label>
          <Input
            placeholder="Title, team, template, owner, or period"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Group</Label>
          <Select
            options={[{ value: "all", label: "All groups" }, { value: "none", label: "Ungrouped" }, ...teamGroupOptions]}
            value={teamGroupFilter}
            onChange={(event) => setTeamGroupFilter(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Team</Label>
          <Select
            options={[{ value: "all", label: "All teams" }, ...teamOptions]}
            value={teamFilter}
            onChange={(event) => setTeamFilter(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Template</Label>
          <Select
            options={[{ value: "all", label: "All templates" }, ...templateFilterOptions]}
            value={templateFilter}
            onChange={(event) => setTemplateFilter(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Assignee</Label>
          <Select options={ownerFilterOptions} value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Participation</Label>
          <Select
            options={[
              { value: "all", label: "All runs" },
              { value: "guest", label: "Guest-enabled" },
              { value: "internal", label: "Internal only" }
            ]}
            value={guestFilter}
            onChange={(event) => setGuestFilter(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className="space-y-2">
          <Label>Period type</Label>
          <Select
            options={[
              { value: "all", label: "All period types" },
              { value: "QUARTER", label: "Quarter" },
              { value: "CUSTOM_RANGE", label: "Custom range" },
              { value: "POINT_IN_TIME", label: "Specific date" }
            ]}
            value={periodTypeFilter}
            onChange={(event) => setPeriodTypeFilter(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Submitted from</Label>
          <Input type="date" value={submittedDateFrom} onChange={(event) => setSubmittedDateFrom(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Submitted to</Label>
          <Input type="date" value={submittedDateTo} onChange={(event) => setSubmittedDateTo(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Score band</Label>
          <Select
            options={[
              { value: "all", label: "All scores" },
              { value: "high", label: "High (4.0+)" },
              { value: "medium", label: "Medium (2.5-3.99)" },
              { value: "low", label: "Low (<2.5)" },
              { value: "no_score", label: "No score" }
            ]}
            value={scoreBandFilter}
            onChange={(event) => setScoreBandFilter(event.target.value)}
          />
        </div>
        <div className="flex items-end">
          <Button
            className="w-full"
            onClick={() => {
              setSearch("");
              setTeamGroupFilter("all");
              setTeamFilter("all");
              setTemplateFilter("all");
              setOwnerFilter("all");
              setGuestFilter("all");
              setPeriodTypeFilter("all");
              setSubmittedDateFrom("");
              setSubmittedDateTo("");
              setScoreBandFilter("all");
            }}
            type="button"
            variant="outline"
          >
            Reset submitted filters
          </Button>
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    const tab = searchParams.get("tab");
    const requestedTeamId = searchParams.get("teamId");

    if (tab === "active" || tab === "submitted" || tab === "create") {
      setPageTab(tab);
    }

    if (requestedTeamId) {
      setTeamId(requestedTeamId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!canCreateRuns && pageTab === "create") {
      setPageTab("active");
      setSearchParams({ tab: "active" });
    }
  }, [canCreateRuns, pageTab, setSearchParams]);

  const confirmRunAction = () => {
    if (!pendingRunAction) {
      return;
    }

    if (pendingRunAction.type === "archive") {
      archiveMutation.mutate(pendingRunAction.run.id);
    }

    if (pendingRunAction.type === "delete") {
      deleteMutation.mutate(pendingRunAction.run.id);
    }

    if (pendingRunAction.type === "copy") {
      copyRunMutation.mutate(pendingRunAction.run.id);
    }

    if (pendingRunAction.type === "restore") {
      restoreMutation.mutate(pendingRunAction.run.id);
    }

    setPendingRunAction(null);
  };

  const pendingActionCopy = pendingRunAction
    ? pendingRunAction.type === "archive"
      ? {
          title: "Archive assessment run?",
          description:
            pendingRunAction.run.status === "SUBMITTED"
              ? "The submitted run will move out of the submitted list and into archived history. An admin can restore it later without changing the submitted data."
              : "The run will move out of the active list but can still be restored later without losing saved responses.",
          confirmLabel: "Archive run"
        }
      : pendingRunAction.type === "delete"
        ? {
            title: "Delete assessment run?",
            description: "This permanently removes the draft run and all saved responses. This action cannot be undone.",
            confirmLabel: "Delete run"
          }
        : pendingRunAction.type === "copy"
          ? {
              title: "Copy assessment run?",
              description: "A new draft run will be created with the same template, team, period, owner, response mode, and participant setup. Saved answers are not copied.",
              confirmLabel: "Copy run"
            }
          : {
              title: "Restore assessment run?",
              description: pendingRunAction.run.submittedAt
                ? "The archived submitted run will return to the submitted list."
                : "The run will return to the active list and can be continued from its previous draft state.",
              confirmLabel: "Restore run"
            }
    : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Assessment runs</div>
        <h1 className="mt-2 text-4xl font-semibold">Launch, track, and review team assessments</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Start new runs from published templates, keep active work visible, and give submitted assessments a cleaner reporting surface.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard hint="Draft or in-progress work" label="Active runs" value={activeRuns.length} />
        <StatCard hint="Soft-hidden operational history" label="Archived runs" value={archivedRuns.length} />
        <StatCard hint="Completed assessment history" label="Submitted runs" value={submittedRuns.length} />
        <StatCard hint="Closed during the current month" label="Submitted this month" value={submittedThisMonth} />
        <StatCard hint="Templates ready to launch from" label="Published templates" value={templateOptions.length} />
      </div>

      {pendingRunAction && pendingActionCopy ? (
        <Card className="border-primary/30 shadow-sm">
          <CardHeader>
            <CardTitle>{pendingActionCopy.title}</CardTitle>
            <CardDescription>
              {pendingActionCopy.description}
              {" "}
              <span className="font-medium text-foreground">{pendingRunAction.run.title}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              onClick={confirmRunAction}
              type="button"
              variant={pendingRunAction.type === "delete" ? "destructive" : "default"}
            >
              {pendingActionCopy.confirmLabel}
            </Button>
            <Button onClick={() => setPendingRunAction(null)} type="button" variant="outline">
              Cancel
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Tabs
        onValueChange={(value) => {
          setPageTab(value);
          setSearchParams({ tab: value });
        }}
        value={pageTab}
      >
        <TabsList
          className={`grid w-full gap-2 rounded-[1.75rem] border border-primary/15 bg-[linear-gradient(135deg,_rgba(238,248,232,0.95),_rgba(244,244,244,0.92))] p-2 shadow-sm ${canCreateRuns ? "grid-cols-3" : "grid-cols-2"}`}
        >
          {canCreateRuns ? (
            <TabsTrigger
              className={`rounded-[1.15rem] border px-4 py-3 text-left ${
                pageTab === "create"
                  ? "border-primary/30 bg-primary text-primary-foreground shadow-[0_14px_30px_rgba(114,191,68,0.28)]"
                  : "border-transparent bg-white/60 text-muted-foreground hover:bg-white/85"
              }`}
              value="create"
            >
              <span className="block text-sm font-semibold">Create</span>
              <span className={`mt-1 block text-xs ${pageTab === "create" ? "text-primary-foreground/80" : "text-muted-foreground"}`}>Launch a new run</span>
            </TabsTrigger>
          ) : null}
          <TabsTrigger
            className={`rounded-[1.15rem] border px-4 py-3 text-left ${
              pageTab === "active"
                ? "border-primary/30 bg-[linear-gradient(135deg,_rgba(114,191,68,0.92),_rgba(96,170,56,0.96))] text-white shadow-[0_14px_30px_rgba(114,191,68,0.28)]"
                : "border-transparent bg-white/60 text-muted-foreground hover:bg-white/85"
            }`}
            value="active"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Active</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pageTab === "active" ? "bg-white/20 text-white" : "bg-primary/10 text-primary"}`}>{activeRuns.length}</span>
            </span>
            <span className={`mt-1 block text-xs ${pageTab === "active" ? "text-white/80" : "text-muted-foreground"}`}>Drafts and in-progress work</span>
          </TabsTrigger>
          <TabsTrigger
            className={`rounded-[1.15rem] border px-4 py-3 text-left ${
              pageTab === "submitted"
                ? "border-slate-400 bg-[linear-gradient(135deg,_rgba(85,85,85,0.96),_rgba(51,51,51,0.98))] text-white shadow-[0_14px_30px_rgba(85,85,85,0.22)]"
                : "border-transparent bg-white/60 text-muted-foreground hover:bg-white/85"
            }`}
            value="submitted"
          >
            <span className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">Submitted</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${pageTab === "submitted" ? "bg-white/15 text-white" : "bg-primary/10 text-primary"}`}>{submittedRuns.length}</span>
            </span>
            <span className={`mt-1 block text-xs ${pageTab === "submitted" ? "text-white/75" : "text-muted-foreground"}`}>Completed runs and results</span>
          </TabsTrigger>
        </TabsList>

        {canCreateRuns ? (
        <TabsContent className="space-y-6" value="create">
          <Card>
            <CardHeader>
              <CardTitle>Create assessment run</CardTitle>
              <CardDescription>
                Create a collaborative run from a published template, optionally assign an owner and due date, and detect duplicate periods before launch.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Label>Run title</Label>
                  {titleManuallyEdited && suggestedTitle ? (
                    <Button
                      onClick={() => {
                        setTitle("");
                        setTitleManuallyEdited(false);
                      }}
                      type="button"
                      variant="ghost"
                    >
                      Reset to suggested title
                    </Button>
                  ) : null}
                </div>
                <Input
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleManuallyEdited(true);
                  }}
                  placeholder="A suggested title will be generated automatically"
                  value={effectiveTitle}
                />
                <div className="text-sm text-muted-foreground">
                  A suggested title is generated from the template, team, and period. Edit only if you need a custom label.
                </div>
              </div>
              <div className="space-y-2">
                <Label>Template</Label>
                <Select
                  options={[{ value: "", label: "Select template" }, ...templateOptions]}
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Team</Label>
                <Select
                  options={[{ value: "", label: "Select team" }, ...teamOptions]}
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Owner</Label>
                <Select options={ownerOptions} value={ownerUserId} onChange={(event) => setOwnerUserId(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Due date</Label>
                <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Period type</Label>
                <Select
                  options={[
                    { value: "QUARTER", label: "Quarter" },
                    { value: "CUSTOM_RANGE", label: "Custom range" },
                    { value: "POINT_IN_TIME", label: "Specific date" }
                  ]}
                  value={periodType}
                  onChange={(event) => setPeriodType(event.target.value as AssessmentPeriodType)}
                />
              </div>
              <div className="space-y-2">
                <Label>Label override</Label>
                <Input placeholder="Optional custom label" value={periodLabel} onChange={(event) => setPeriodLabel(event.target.value)} />
              </div>
              {periodType === "QUARTER" ? (
                <>
                  <div className="space-y-2">
                    <Label>Year</Label>
                    <Input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Quarter</Label>
                    <Select
                      options={[
                        { value: "1", label: "Q1" },
                        { value: "2", label: "Q2" },
                        { value: "3", label: "Q3" },
                        { value: "4", label: "Q4" }
                      ]}
                      value={String(quarter)}
                      onChange={(event) => setQuarter(Number(event.target.value))}
                    />
                  </div>
                </>
              ) : null}
              {periodType === "CUSTOM_RANGE" ? (
                <>
                  <div className="space-y-2">
                    <Label>Start date</Label>
                    <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>End date</Label>
                    <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  </div>
                </>
              ) : null}
              {periodType === "POINT_IN_TIME" ? (
                <div className="space-y-2">
                  <Label>Assessment date</Label>
                  <Input type="date" value={referenceDate} onChange={(event) => setReferenceDate(event.target.value)} />
                </div>
              ) : null}

              {duplicateCheckQuery.data?.hasDuplicate ? (
                <div className="space-y-3 rounded-[1.25rem] border border-primary/20 bg-accent p-4 md:col-span-2">
                  <div>
                    <div className="font-semibold text-foreground">Existing run found for this team, template, and period</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Creating another run is allowed, but should be intentional.
                    </div>
                  </div>
                  <div className="space-y-2 text-sm text-muted-foreground">
                    {duplicateCheckQuery.data.matches.map((match) => (
                      <div className="rounded-xl border border-border bg-white px-3 py-2" key={match.id}>
                        {match.title} · {match.status} · {formatDate(match.updatedAt)}
                      </div>
                    ))}
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input checked={allowDuplicate} onChange={(event) => setAllowDuplicate(event.target.checked)} type="checkbox" />
                    Allow duplicate run for this period
                  </label>
                </div>
              ) : null}

              <div className="space-y-2 md:col-span-2">
                <label className="flex items-start gap-3 rounded-[1rem] border bg-muted/20 px-4 py-3 text-sm">
                  <input
                    checked={guestParticipationEnabled}
                    className="mt-0.5"
                    onChange={(event) => setGuestParticipationEnabled(event.target.checked)}
                    type="checkbox"
                  />
                  <span className="space-y-1">
                    <span className="block font-medium text-foreground">This run includes guest participants</span>
                    <span className="block text-muted-foreground">
                      Pre-enable guest participation so external links can be managed as soon as the run is created.
                    </span>
                  </span>
                </label>
              </div>

              <div className="space-y-3 rounded-[1.25rem] border bg-[linear-gradient(135deg,_rgba(238,248,232,0.7),_rgba(255,255,255,0.98))] p-4 md:col-span-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Label>Response mode</Label>
                    <div className="mt-1 text-sm text-muted-foreground">
                      Keep shared mode for workshop-style scoring. Use individual mode when team members should answer separately in a later workflow step.
                    </div>
                  </div>
                  <Badge variant={responseMode === "INDIVIDUAL_AGGREGATED" ? "default" : "outline"}>
                    {responseMode === "INDIVIDUAL_AGGREGATED" ? "Individual team members" : "Shared team response"}
                  </Badge>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label
                    className={`cursor-pointer rounded-[1rem] border px-4 py-3 text-sm transition ${
                      responseMode === "SHARED" ? "border-primary/40 bg-primary/10" : "bg-white hover:bg-muted/30"
                    }`}
                  >
                    <input
                      checked={responseMode === "SHARED"}
                      className="sr-only"
                      onChange={() => setResponseMode("SHARED")}
                      type="radio"
                    />
                    <span className="block font-semibold text-foreground">Shared team response</span>
                    <span className="mt-1 block text-muted-foreground">Current behavior: one collaborative answer set for the team.</span>
                  </label>
                  <label
                    className={`cursor-pointer rounded-[1rem] border px-4 py-3 text-sm transition ${
                      responseMode === "INDIVIDUAL_AGGREGATED" ? "border-primary/40 bg-primary/10" : "bg-white hover:bg-muted/30"
                    }`}
                  >
                    <input
                      checked={responseMode === "INDIVIDUAL_AGGREGATED"}
                      className="sr-only"
                      onChange={() => setResponseMode("INDIVIDUAL_AGGREGATED")}
                      type="radio"
                    />
                    <span className="block font-semibold text-foreground">Individual team member responses</span>
                    <span className="mt-1 block text-muted-foreground">Prepare a run where selected team members answer individually.</span>
                  </label>
                </div>
                {responseMode === "INDIVIDUAL_AGGREGATED" ? (
                  <div className="space-y-3 rounded-[1rem] border bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-foreground">Participants</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          Select registered team members and/or external contacts. Everyone answers separately, then managers aggregate submitted responses into the final result.
                        </div>
                      </div>
                      <Badge variant={totalSelectedParticipants ? "outline" : "secondary"}>{totalSelectedParticipants} selected</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)] md:items-end">
                      <div className="space-y-2">
                        <Label>Minimum submissions</Label>
                        <Input
                          min="1"
                          max={totalSelectedParticipants || undefined}
                          onChange={(event) => setMinimumParticipantResponses(event.target.value)}
                          placeholder="All selected"
                          type="number"
                          value={minimumParticipantResponses}
                        />
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Leave blank to require every selected participant before aggregation. Set a lower number when partial participation is acceptable.
                      </div>
                    </div>
                    {externalParticipantOptions.length ? (
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-foreground">External contacts</div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {externalParticipantOptions.map((contact) => (
                            <label className="flex items-start gap-3 rounded-xl border bg-muted/10 px-3 py-3 text-sm" key={contact.id}>
                              <input
                                checked={participantExternalContactIds.includes(contact.id)}
                                className="mt-1"
                                onChange={(event) => {
                                  setParticipantExternalContactIds((current) =>
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
                      </div>
                    ) : (
                      <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                        No external contacts are available yet. You can add them in Administration &gt; External Contacts, or add them later from the run page.
                      </div>
                    )}
                    <div className="text-sm font-medium text-foreground">Registered team members</div>
                    {!teamId ? (
                      <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">Select a team before choosing participants.</div>
                    ) : teamParticipantOptions.length ? (
                      <div className="grid gap-2 md:grid-cols-2">
                        {teamParticipantOptions.map((participant) => (
                          <label className="flex items-start gap-3 rounded-xl border bg-muted/10 px-3 py-3 text-sm" key={participant.id}>
                            <input
                              checked={participantUserIds.includes(participant.id)}
                              className="mt-1"
                              onChange={(event) => {
                                setParticipantUserIds((current) =>
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
                      <div className="rounded-xl border border-dashed px-4 py-5 text-sm text-muted-foreground">
                        This team has no active platform members available for individual participation.
                      </div>
                    )}
                    {!participantsReady ? <div className="text-sm font-medium text-destructive">Select at least one participant to create this run.</div> : null}
                  </div>
                ) : null}
              </div>

              <div className="md:col-span-2">
                <Button
                  className="w-full md:w-auto"
                  disabled={!createReady || createMutation.isPending || (duplicateCheckQuery.data?.hasDuplicate && !allowDuplicate)}
                  onClick={() => createMutation.mutate()}
                  type="button"
                >
                  {duplicateCheckQuery.data?.hasDuplicate && allowDuplicate ? "Create duplicate run" : "Create run"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        ) : null}

        <TabsContent className="space-y-6" value="active">
          <Card>
            <CardHeader>
              <CardTitle>Active runs</CardTitle>
              <CardDescription>Draft and in-progress assessments that still need team input or submission.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {filterBlock}
              <RunTable
                emptyMessage="No active runs match the current filters."
                onArchive={(run) => setPendingRunAction({ type: "archive", run })}
                onCopy={(run) => setPendingRunAction({ type: "copy", run })}
                onDelete={(run) => setPendingRunAction({ type: "delete", run })}
                runs={filteredActiveRuns}
                submittedView={false}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Archived runs</CardTitle>
              <CardDescription>Temporarily hidden runs can be restored back into active work without losing their saved responses.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RunTable
                actionLabel="Archived"
                emptyMessage="No archived runs match the current filters."
                onCopy={(run) => setPendingRunAction({ type: "copy", run })}
                onRestore={(run) => setPendingRunAction({ type: "restore", run })}
                runs={filteredArchivedRuns}
                submittedView={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent className="space-y-6" value="submitted">
          <Card>
            <CardHeader>
              <CardTitle>Submitted runs</CardTitle>
              <CardDescription>Completed assessments ready for results review, comparison, and print summaries.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {submittedFilterBlock}
              <RunTable
                emptyMessage="No submitted runs match the current filters."
                onArchive={user?.role === "ADMIN" ? (run) => setPendingRunAction({ type: "archive", run }) : undefined}
                onCopy={(run) => setPendingRunAction({ type: "copy", run })}
                runs={filteredSubmittedRuns}
                submittedView={true}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

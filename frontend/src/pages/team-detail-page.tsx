import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, FileText, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { TeamDetail, TeamMembershipRole, UserSummary } from "@/types";

type PendingMemberAction = { type: "remove-member"; member: TeamDetail["members"][number] };

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

function statusLabel(status: string) {
  return status.replace(/_/g, " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export function TeamDetailPage() {
  const { teamId } = useParams();
  const queryClient = useQueryClient();
  const [memberUserId, setMemberUserId] = useState("");
  const [memberRole, setMemberRole] = useState<TeamMembershipRole>("MEMBER");
  const [pendingMemberAction, setPendingMemberAction] = useState<PendingMemberAction | null>(null);

  const teamQuery = useQuery({
    queryKey: ["team-detail", teamId],
    queryFn: () => api.get<TeamDetail>(`/teams/${teamId}`),
    enabled: Boolean(teamId)
  });

  const usersQuery = useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => api.get<UserSummary[]>("/users/assignable")
  });

  const addMemberMutation = useMutation({
    mutationFn: () =>
      api.post(`/teams/${teamId}/members`, {
        userId: memberUserId,
        membershipRole: memberRole
      }),
    onSuccess: async () => {
      toast.success("Team membership updated");
      setMemberUserId("");
      setMemberRole("MEMBER");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-detail", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] })
      ]);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) => api.delete(`/teams/${teamId}/members/${userId}`),
    onSuccess: async () => {
      toast.success("Team member removed");
      setPendingMemberAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-detail", teamId] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["users"] })
      ]);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const team = teamQuery.data;
  const latestSubmitted = useMemo(
    () =>
      [...(team?.submittedRuns ?? [])].sort(
        (left, right) => (right.submittedAt ? new Date(right.submittedAt).getTime() : 0) - (left.submittedAt ? new Date(left.submittedAt).getTime() : 0)
      )[0] ?? null,
    [team?.submittedRuns]
  );
  const availableUsers = useMemo(() => {
    const memberIds = new Set((team?.members ?? []).map((member) => member.id));
    return (usersQuery.data ?? []).filter((user) => !memberIds.has(user.id));
  }, [team?.members, usersQuery.data]);

  function confirmPendingMemberAction() {
    if (!pendingMemberAction) {
      return;
    }

    removeMemberMutation.mutate(pendingMemberAction.member.id);
  }

  if (teamQuery.isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-56 animate-pulse rounded-2xl bg-muted" />
        <div className="h-48 animate-pulse rounded-[2rem] bg-muted/70" />
      </div>
    );
  }

  if (!team) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team not found</CardTitle>
          <CardDescription>The team may not exist or may not be visible to your account.</CardDescription>
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
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Team profile</div>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold">{team.name}</h1>
              {team.group ? <Badge>{team.group.name}</Badge> : <Badge variant="outline">Ungrouped</Badge>}
            </div>
            <p className="mt-2 max-w-3xl text-muted-foreground">{team.description || "No description has been added for this team yet."}</p>
            <div className="mt-4">
              <Link className={buttonVariants()} to={`/assessments?tab=create&teamId=${team.id}`}>
                Create assessment for this team
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Members</div>
              <div className="mt-1 text-2xl font-semibold">{team.members.length}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active runs</div>
              <div className="mt-1 text-2xl font-semibold">{team.activeRuns.length}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Submitted</div>
              <div className="mt-1 text-2xl font-semibold">{team.submittedRuns.length}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm sm:col-span-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Latest score</div>
              <div className="mt-1 text-2xl font-semibold">{latestSubmitted?.overallScore != null ? latestSubmitted.overallScore.toFixed(2) : "-"}</div>
              <div className="mt-1 text-xs text-muted-foreground">
                {latestSubmitted ? `${latestSubmitted.templateVersion.name} · ${latestSubmitted.periodLabel}` : "No submitted assessment yet"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {pendingMemberAction ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <div className="font-semibold">Remove {pendingMemberAction.member.displayName} from this team?</div>
              <div className="mt-1 text-sm text-muted-foreground">
                This only removes the team membership. The user account and previous assessment records remain unchanged.
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setPendingMemberAction(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={removeMemberMutation.isPending} onClick={confirmPendingMemberAction} type="button" variant="destructive">
                Confirm remove
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Members
            </CardTitle>
            <CardDescription>Current users assigned to this team.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-[1.1rem] border border-primary/20 bg-primary/5 p-4">
              <div className="text-sm font-semibold text-foreground">Add member</div>
              <div className="mt-3 grid gap-3">
                <div className="space-y-2">
                  <Label>User</Label>
                  <Select
                    options={[{ value: "", label: "Select user" }, ...availableUsers.map((user) => ({ value: user.id, label: `${user.displayName} (${user.username})` }))]}
                    value={memberUserId}
                    onChange={(event) => setMemberUserId(event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Membership role</Label>
                  <Select
                    options={[
                      { value: "MEMBER", label: "Member" },
                      { value: "LEAD", label: "Lead" }
                    ]}
                    value={memberRole}
                    onChange={(event) => setMemberRole(event.target.value as TeamMembershipRole)}
                  />
                </div>
                <Button disabled={!memberUserId || addMemberMutation.isPending} onClick={() => addMemberMutation.mutate()} type="button">
                  Add to team
                </Button>
              </div>
            </div>
            {team.members.map((member) => (
              <div className="rounded-[1.1rem] border bg-white p-4" key={member.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{member.displayName}</div>
                    <div className="mt-1 text-sm text-muted-foreground">@{member.username}</div>
                  </div>
                  <Badge variant={member.membershipRole === "LEAD" ? "default" : "outline"}>
                    {member.membershipRole === "LEAD" ? "Lead" : "Member"}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border px-2.5 py-1">{member.role.replace(/_/g, " ")}</span>
                  <span className="rounded-full border px-2.5 py-1">{member.isActive ? "Active" : "Inactive"}</span>
                </div>
                <div className="mt-3 flex gap-3 text-sm">
                  <button className="font-medium text-muted-foreground" onClick={() => setPendingMemberAction({ type: "remove-member", member })} type="button">
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {team.members.length === 0 ? (
              <div className="rounded-[1.1rem] border border-dashed p-6 text-sm text-muted-foreground">
                No members are assigned to this team yet.
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-primary" />
                Active assessments
              </CardTitle>
              <CardDescription>Draft, in-progress, and archived runs attached to this team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {team.activeRuns.map((run) => (
                <div className="rounded-[1.1rem] border bg-white p-4" key={run.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link className="font-semibold text-foreground transition hover:text-primary" to={`/assessments/${run.id}`}>
                        {run.title}
                      </Link>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {run.templateVersion.name} · {run.periodLabel}
                      </div>
                    </div>
                    <Badge variant="outline">{statusLabel(run.status)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border px-2.5 py-1">Due: {formatDate(run.dueDate)}</span>
                    <span className="rounded-full border px-2.5 py-1">Updated: {formatDate(run.updatedAt)}</span>
                    {run.guestParticipationEnabled ? <span className="rounded-full border px-2.5 py-1">Guest-enabled</span> : null}
                  </div>
                </div>
              ))}
              {team.activeRuns.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed p-6 text-sm text-muted-foreground">
                  No active assessments are attached to this team.
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Submitted assessments
              </CardTitle>
              <CardDescription>Completed runs and result links for this team.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {team.submittedRuns.map((run) => (
                <div className="rounded-[1.1rem] border bg-white p-4" key={run.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link className="font-semibold text-foreground transition hover:text-primary" to={`/assessments/${run.id}/results`}>
                        {run.title}
                      </Link>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {run.templateVersion.name} · {run.periodLabel}
                      </div>
                    </div>
                    <Badge>{typeof run.overallScore === "number" ? `Score ${run.overallScore.toFixed(2)}` : "Submitted"}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border px-2.5 py-1">Submitted: {formatDate(run.submittedAt)}</span>
                    {run.guestParticipationEnabled ? <span className="rounded-full border px-2.5 py-1">Guest-enabled</span> : null}
                  </div>
                </div>
              ))}
              {team.submittedRuns.length === 0 ? (
                <div className="rounded-[1.1rem] border border-dashed p-6 text-sm text-muted-foreground">
                  No submitted assessments are attached to this team yet.
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

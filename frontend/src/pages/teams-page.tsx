import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FolderTree, Layers3, PlusCircle, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { Team, TeamGroup } from "@/types";

type TeamForm = {
  name: string;
  description: string;
  groupId: string;
};

type TeamGroupForm = {
  name: string;
  description: string;
  sortOrder: string;
};

type PendingDirectoryAction = { type: "delete-team"; team: Team } | { type: "delete-group"; group: TeamGroup };
type DirectoryViewMode = "cards" | "compact";

const emptyTeamForm: TeamForm = {
  name: "",
  description: "",
  groupId: "none"
};

const emptyGroupForm: TeamGroupForm = {
  name: "",
  description: "",
  sortOrder: "0"
};

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

export function TeamsPage() {
  const queryClient = useQueryClient();
  const [teamForm, setTeamForm] = useState<TeamForm>(emptyTeamForm);
  const [teamEditId, setTeamEditId] = useState<string | null>(null);
  const [groupForm, setGroupForm] = useState<TeamGroupForm>(emptyGroupForm);
  const [groupEditId, setGroupEditId] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState("all");
  const [directorySearch, setDirectorySearch] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingDirectoryAction | null>(null);
  const [viewMode, setViewMode] = useState<DirectoryViewMode>("cards");

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/teams")
  });

  const teamGroupsQuery = useQuery({
    queryKey: ["team-groups"],
    queryFn: () => api.get<TeamGroup[]>("/team-groups")
  });

  const groupOptions = useMemo(
    () => [
      { value: "none", label: "No group" },
      ...(teamGroupsQuery.data ?? []).map((group) => ({ value: group.id, label: group.name }))
    ],
    [teamGroupsQuery.data]
  );

  const filteredTeams = useMemo(() => {
    const teams = teamsQuery.data ?? [];
    const search = directorySearch.trim().toLowerCase();

    return teams.filter((team) => {
      const matchesGroup = groupFilter === "all" || (groupFilter === "none" ? !team.group : team.group?.id === groupFilter);
      const matchesSearch =
        !search ||
        team.name.toLowerCase().includes(search) ||
        (team.description ?? "").toLowerCase().includes(search) ||
        (team.group?.name ?? "").toLowerCase().includes(search);

      return matchesGroup && matchesSearch;
    });
  }, [directorySearch, groupFilter, teamsQuery.data]);

  const filteredGroups = useMemo(() => {
    const search = directorySearch.trim().toLowerCase();
    const groups = teamGroupsQuery.data ?? [];

    if (!search) {
      return groups;
    }

    return groups.filter((group) => group.name.toLowerCase().includes(search) || (group.description ?? "").toLowerCase().includes(search));
  }, [directorySearch, teamGroupsQuery.data]);

  const groupedTeamCount = (teamsQuery.data ?? []).filter((team) => team.group).length;
  const ungroupedTeamCount = (teamsQuery.data ?? []).filter((team) => !team.group).length;
  const groupSummaryMetrics = useMemo(
    () =>
      (teamGroupsQuery.data ?? []).reduce(
        (summary, group) => ({
          members: summary.members + (group.metrics?.memberCount ?? 0),
          activeRuns: summary.activeRuns + (group.metrics?.activeRunCount ?? 0),
          submittedRuns: summary.submittedRuns + (group.metrics?.submittedRunCount ?? 0)
        }),
        { members: 0, activeRuns: 0, submittedRuns: 0 }
      ),
    [teamGroupsQuery.data]
  );

  const saveTeamMutation = useMutation({
    mutationFn: () =>
      teamEditId
        ? api.put(`/teams/${teamEditId}`, {
            ...teamForm,
            groupId: teamForm.groupId === "none" ? null : teamForm.groupId
          })
        : api.post("/teams", {
            ...teamForm,
            groupId: teamForm.groupId === "none" ? null : teamForm.groupId
          }),
    onSuccess: async () => {
      toast.success(teamEditId ? "Team updated" : "Team created");
      setTeamForm(emptyTeamForm);
      setTeamEditId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["team-groups"] })
      ]);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const deleteTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.delete(`/teams/${teamId}`),
    onSuccess: async () => {
      toast.success("Team removed");
      setPendingAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["teams"] }),
        queryClient.invalidateQueries({ queryKey: ["team-groups"] })
      ]);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const saveGroupMutation = useMutation({
    mutationFn: () =>
      groupEditId
        ? api.put(`/team-groups/${groupEditId}`, {
            name: groupForm.name,
            description: groupForm.description,
            sortOrder: Number(groupForm.sortOrder) || 0
          })
        : api.post("/team-groups", {
            name: groupForm.name,
            description: groupForm.description,
            sortOrder: Number(groupForm.sortOrder) || 0
          }),
    onSuccess: async () => {
      toast.success(groupEditId ? "Group updated" : "Group created");
      setGroupForm(emptyGroupForm);
      setGroupEditId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-groups"] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] })
      ]);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: string) => api.delete(`/team-groups/${groupId}`),
    onSuccess: async () => {
      toast.success("Group removed. Teams in that group are now ungrouped.");
      setPendingAction(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["team-groups"] }),
        queryClient.invalidateQueries({ queryKey: ["teams"] })
      ]);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  function startEditTeam(team: Team) {
    setTeamEditId(team.id);
    setTeamForm({
      name: team.name,
      description: team.description ?? "",
      groupId: team.group?.id ?? "none"
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function startEditGroup(group: TeamGroup) {
    setGroupEditId(group.id);
    setGroupForm({
      name: group.name,
      description: group.description ?? "",
      sortOrder: String(group.sortOrder ?? 0)
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function confirmPendingAction() {
    if (!pendingAction) {
      return;
    }

    if (pendingAction.type === "delete-team") {
      deleteTeamMutation.mutate(pendingAction.team.id);
      return;
    }

    deleteGroupMutation.mutate(pendingAction.group.id);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border bg-gradient-to-br from-primary/10 via-white to-accent/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Team directory</div>
            <h1 className="mt-2 text-4xl font-semibold">Teams</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Create teams, optionally organize them into groups, and open team profiles to review assessment activity.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Teams</div>
              <div className="mt-1 text-2xl font-semibold">{teamsQuery.data?.length ?? "-"}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Grouped</div>
              <div className="mt-1 text-2xl font-semibold">{groupedTeamCount}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white/80 px-4 py-3 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ungrouped</div>
              <div className="mt-1 text-2xl font-semibold">{ungroupedTeamCount}</div>
            </div>
          </div>
        </div>
      </div>

      {pendingAction ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <div className="font-semibold">
                {pendingAction.type === "delete-team" ? `Remove team "${pendingAction.team.name}"?` : `Remove group "${pendingAction.group.name}"?`}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {pendingAction.type === "delete-team"
                  ? "Teams can only be removed when they have no assessment history. If runs exist, the system will block this action."
                  : "The group will be removed and any teams in it will become ungrouped."}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setPendingAction(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={deleteTeamMutation.isPending || deleteGroupMutation.isPending} onClick={confirmPendingAction} type="button" variant="destructive">
                Confirm remove
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className={teamEditId ? "border-primary/30 bg-primary/5" : ""}>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <PlusCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{teamEditId ? "Edit team" : "Create team"}</CardTitle>
                <CardDescription>Use this for the actual teams that receive assessment runs.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={teamForm.name} onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Group</Label>
              <Select value={teamForm.groupId} options={groupOptions} onChange={(event) => setTeamForm((current) => ({ ...current, groupId: event.target.value }))} />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Description</Label>
              <Textarea value={teamForm.description} onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))} />
              <div className="text-xs text-muted-foreground">Group is optional. Teams can stay ungrouped until the structure is useful.</div>
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-2">
              <Button disabled={!teamForm.name.trim() || saveTeamMutation.isPending} onClick={() => saveTeamMutation.mutate()} type="button">
                {teamEditId ? "Update team" : "Create team"}
              </Button>
              {teamEditId ? (
                <Button
                  onClick={() => {
                    setTeamEditId(null);
                    setTeamForm(emptyTeamForm);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className={groupEditId ? "border-primary/30 bg-primary/5" : ""}>
          <CardHeader>
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <Layers3 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>{groupEditId ? "Edit team group" : "Create team group"}</CardTitle>
                <CardDescription>Use groups for departments, regions, functions, or product areas.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_140px]">
            <div className="space-y-2">
              <Label>Group name</Label>
              <Input value={groupForm.name} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Sort order</Label>
              <Input type="number" value={groupForm.sortOrder} onChange={(event) => setGroupForm((current) => ({ ...current, sortOrder: event.target.value }))} />
            </div>
            <div className="space-y-2 lg:col-span-2">
              <Label>Description</Label>
              <Textarea value={groupForm.description} onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="flex flex-wrap gap-3 lg:col-span-2">
              <Button disabled={!groupForm.name.trim() || saveGroupMutation.isPending} onClick={() => saveGroupMutation.mutate()} type="button">
                {groupEditId ? "Update group" : "Create group"}
              </Button>
              {groupEditId ? (
                <Button
                  onClick={() => {
                    setGroupEditId(null);
                    setGroupForm(emptyGroupForm);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-4 p-4 md:grid-cols-[1fr_260px]">
          <div className="space-y-2">
            <Label>Search teams and groups</Label>
            <Input
              placeholder="Search by team, group, or description"
              value={directorySearch}
              onChange={(event) => setDirectorySearch(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Team group filter</Label>
            <Select
              value={groupFilter}
              options={[
                { value: "all", label: "All teams" },
                { value: "none", label: "Ungrouped" },
                ...(teamGroupsQuery.data ?? []).map((group) => ({ value: group.id, label: group.name }))
              ]}
              onChange={(event) => setGroupFilter(event.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Grouped members</div>
            <div className="mt-1 text-2xl font-semibold">{groupSummaryMetrics.members}</div>
            <div className="mt-1 text-xs text-muted-foreground">Members across grouped teams</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Active group runs</div>
            <div className="mt-1 text-2xl font-semibold">{groupSummaryMetrics.activeRuns}</div>
            <div className="mt-1 text-xs text-muted-foreground">Draft, in-progress, or archived</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Submitted group runs</div>
            <div className="mt-1 text-2xl font-semibold">{groupSummaryMetrics.submittedRuns}</div>
            <div className="mt-1 text-xs text-muted-foreground">Completed runs in groups</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Team groups</CardTitle>
              <CardDescription>Optional categories that help managers scan related teams together.</CardDescription>
            </div>
            <Badge variant="outline">{teamGroupsQuery.data?.length ?? 0} groups</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredGroups.map((group) => (
            <div className="rounded-[1.25rem] border bg-white p-4" key={group.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{group.name}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{group.description || "No description"}</div>
                </div>
                <Badge variant="outline">{group.teamCount ?? 0} teams</Badge>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <div className="font-semibold text-foreground">{group.metrics?.memberCount ?? 0}</div>
                  <div className="text-muted-foreground">Members</div>
                </div>
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <div className="font-semibold text-foreground">{group.metrics?.activeRunCount ?? 0}</div>
                  <div className="text-muted-foreground">Active runs</div>
                </div>
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <div className="font-semibold text-foreground">{group.metrics?.submittedRunCount ?? 0}</div>
                  <div className="text-muted-foreground">Submitted</div>
                </div>
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <div className="font-semibold text-foreground">
                    {typeof group.metrics?.averageSubmittedScore === "number" ? group.metrics.averageSubmittedScore.toFixed(2) : "-"}
                  </div>
                  <div className="text-muted-foreground">Avg score</div>
                </div>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">Latest submitted: {formatDate(group.metrics?.latestSubmittedAt)}</div>
              <div className="mt-3 flex gap-3 text-sm">
                <Link className="font-medium text-primary" to={`/team-groups/${group.id}`}>
                  Open
                </Link>
                <button className="font-medium text-primary" onClick={() => startEditGroup(group)} type="button">
                  Edit
                </button>
                <button className="font-medium text-muted-foreground" onClick={() => setPendingAction({ type: "delete-group", group })} type="button">
                  Remove
                </button>
              </div>
            </div>
          ))}
          {filteredGroups.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed p-6 text-sm text-muted-foreground md:col-span-2 xl:col-span-3">
              {directorySearch.trim()
                ? "No team groups match this search."
                : "No team groups yet. Create one above if you want to categorize teams by function, department, region, or program."}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>Team list</CardTitle>
              <CardDescription>Open a team profile to review members, active assessments, and submitted assessments.</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{filteredTeams.length} shown</Badge>
              <div className="flex rounded-xl border bg-muted/20 p-1">
                <Button size="sm" type="button" variant={viewMode === "cards" ? "default" : "ghost"} onClick={() => setViewMode("cards")}>
                  Cards
                </Button>
                <Button size="sm" type="button" variant={viewMode === "compact" ? "default" : "ghost"} onClick={() => setViewMode("compact")}>
                  Compact
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {viewMode === "cards" ? (
            filteredTeams.map((team) => (
              <div className="rounded-[1.25rem] border bg-white p-4" key={team.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link className="font-semibold text-foreground transition hover:text-primary" to={`/teams/${team.id}`}>
                        {team.name}
                      </Link>
                      {team.group ? (
                        <Link to={`/team-groups/${team.group.id}`}>
                          <Badge>{team.group.name}</Badge>
                        </Link>
                      ) : (
                        <Badge variant="outline">Ungrouped</Badge>
                      )}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">{team.description || "No description"}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
                        <Users className="h-3.5 w-3.5" />
                        {team.counts?.members ?? 0} members
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1">
                        <FolderTree className="h-3.5 w-3.5" />
                        {team.counts?.assessmentRuns ?? 0} runs
                      </span>
                    </div>
                  </div>
                  <Link className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary/5" to={`/teams/${team.id}`}>
                    Open profile
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
                <div className="mt-4 flex gap-3 text-sm">
                  <button className="font-medium text-primary" onClick={() => startEditTeam(team)} type="button">
                    Edit
                  </button>
                  <button className="font-medium text-muted-foreground" onClick={() => setPendingAction({ type: "delete-team", team })} type="button">
                    Remove
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="overflow-x-auto rounded-[1.25rem] border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>Group</TableHead>
                    <TableHead className="text-right">Members</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTeams.map((team) => (
                    <TableRow key={team.id}>
                      <TableCell>
                        <div>
                          <Link className="font-semibold text-foreground transition hover:text-primary" to={`/teams/${team.id}`}>
                            {team.name}
                          </Link>
                          <div className="max-w-xl truncate text-xs text-muted-foreground">{team.description || "No description"}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {team.group ? (
                          <Link to={`/team-groups/${team.group.id}`}>
                            <Badge>{team.group.name}</Badge>
                          </Link>
                        ) : (
                          <Badge variant="outline">Ungrouped</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{team.counts?.members ?? 0}</TableCell>
                      <TableCell className="text-right">{team.counts?.assessmentRuns ?? 0}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-3 text-sm">
                          <Link className="font-medium text-primary" to={`/teams/${team.id}`}>
                            Open
                          </Link>
                          <button className="font-medium text-primary" onClick={() => startEditTeam(team)} type="button">
                            Edit
                          </button>
                          <button className="font-medium text-muted-foreground" onClick={() => setPendingAction({ type: "delete-team", team })} type="button">
                            Remove
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {filteredTeams.length === 0 ? (
            <div className="rounded-[1.25rem] border border-dashed p-8 text-sm text-muted-foreground">
              No teams match this search or group filter.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

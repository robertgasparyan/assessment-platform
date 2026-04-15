import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { Team, TeamMembershipRole, UserRole, UserSummary } from "@/types";

type MembershipSelection = Record<string, "NONE" | TeamMembershipRole>;

const roleOptions: Array<{ value: UserRole; label: string }> = [
  { value: "ADMIN", label: "Admin" },
  { value: "TEMPLATE_MANAGER", label: "Template Manager" },
  { value: "TEAM_LEAD", label: "Team Lead" },
  { value: "TEAM_MEMBER", label: "Team Member" },
  { value: "VIEWER", label: "Viewer" }
];

const roleScopeSummary: Array<{ role: string; summary: string }> = [
  { role: "Admin", summary: "Full platform access, including users, teams, templates, reports, administration, AI settings, and exports." },
  { role: "Template Manager", summary: "Owns templates and reusable library content, without full administration or user management access." },
  { role: "Team Lead", summary: "Works in team-scoped assessments, results, and reports for the teams they can manage." },
  { role: "Team Member", summary: "Completes assigned assessments and views the run and result surfaces they are allowed to access." },
  { role: "Viewer", summary: "Read-only access within allowed scope, mainly for submitted results and reporting visibility." }
];

function emptyMembershipSelection(teams: Team[]): MembershipSelection {
  return Object.fromEntries(teams.map((team) => [team.id, "NONE"])) as MembershipSelection;
}

function buildMembershipSelection(user: UserSummary | null, teams: Team[]): MembershipSelection {
  const base = emptyMembershipSelection(teams);
  if (!user) {
    return base;
  }

  for (const membership of user.teams) {
    base[membership.id] = membership.membershipRole;
  }

  return base;
}

function formatDate(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

export function UsersManagementSection() {
  const queryClient = useQueryClient();
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<UserSummary[]>("/users")
  });
  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/teams")
  });

  const teams = teamsQuery.data ?? [];
  const [userEditId, setUserEditId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    displayName: "",
    username: "",
    email: "",
    role: "TEAM_MEMBER" as UserRole,
    isActive: true,
    mustChangePassword: true,
    password: ""
  });
  const [membershipSelection, setMembershipSelection] = useState<MembershipSelection>({});
  const [resetPassword, setResetPassword] = useState("");
  const [inviteLink, setInviteLink] = useState("");

  const saveUserMutation = useMutation({
    mutationFn: () => {
      const memberships = Object.entries(membershipSelection)
        .filter(([, membershipRole]) => membershipRole !== "NONE")
        .map(([teamId, membershipRole]) => ({
          teamId,
          membershipRole
        }));

      if (userEditId) {
        return api.put(`/users/${userEditId}`, {
          displayName: userForm.displayName,
          username: userForm.username,
          email: userForm.email,
          role: userForm.role,
          isActive: userForm.isActive,
          mustChangePassword: userForm.mustChangePassword,
          memberships
        });
      }

      return api.post("/users", {
        displayName: userForm.displayName,
        username: userForm.username,
        email: userForm.email,
        role: userForm.role,
        isActive: userForm.isActive,
        mustChangePassword: userForm.mustChangePassword,
        password: userForm.password,
        memberships
      });
    },
    onSuccess: () => {
      toast.success(userEditId ? "User updated" : "User created");
      setUserEditId(null);
      setUserForm({
        displayName: "",
        username: "",
        email: "",
        role: "TEAM_MEMBER",
        isActive: true,
        mustChangePassword: true,
        password: ""
      });
      setMembershipSelection(emptyMembershipSelection(teams));
      setResetPassword("");
      setInviteLink("");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const resetPasswordMutation = useMutation({
    mutationFn: () => api.post(`/users/${userEditId}/reset-password`, { newPassword: resetPassword }),
    onSuccess: () => {
      toast.success("Password reset");
      setResetPassword("");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const inviteUserMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post<{ inviteToken: string; inviteExpiresAt: string }>(`/users/${userEditId}/invite`, {});
      const nextLink = `${window.location.origin}/activate-account?token=${response.inviteToken}`;
      setInviteLink(nextLink);
      try {
        await navigator.clipboard.writeText(nextLink);
        toast.success("Activation link copied");
      } catch {
        toast.success("Activation link generated");
      }
    },
    onError: (error: Error) => toast.error(error.message)
  });

  function startCreateUser() {
    setUserEditId(null);
    setUserForm({
      displayName: "",
      username: "",
      email: "",
      role: "TEAM_MEMBER",
      isActive: true,
      mustChangePassword: true,
      password: ""
    });
    setMembershipSelection(emptyMembershipSelection(teams));
    setResetPassword("");
    setInviteLink("");
  }

  function startEditUser(user: UserSummary) {
    setUserEditId(user.id);
    setUserForm({
      displayName: user.displayName,
      username: user.username,
      email: user.email ?? "",
      role: user.role,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      password: ""
    });
    setMembershipSelection(buildMembershipSelection(user, teams));
    setResetPassword("");
    setInviteLink("");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[520px,1fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{userEditId ? "Edit user" : "Add user"}</CardTitle>
            <CardDescription>
              {userEditId
                ? "Update the user profile, role, activation status, and team memberships."
                : "Create a new user account and assign their starting role."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Display name</Label>
                <Input value={userForm.displayName} onChange={(event) => setUserForm((current) => ({ ...current, displayName: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Username</Label>
                <Input value={userForm.username} onChange={(event) => setUserForm((current) => ({ ...current, username: event.target.value }))} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input value={userForm.email} onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <select
                  className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                  value={userForm.role}
                  onChange={(event) => setUserForm((current) => ({ ...current, role: event.target.value as UserRole }))}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {!userEditId ? (
              <div className="space-y-2">
                <Label>Initial password</Label>
                <Input
                  type="password"
                  value={userForm.password}
                  onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
                />
                <div className="text-xs text-muted-foreground">Leave blank to create the account for invitation-based activation only.</div>
              </div>
            ) : null}

            <div className="rounded-[1.25rem] border border-border/80 bg-muted/25 p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">Status</div>
              <label className="flex items-center gap-3 text-sm text-muted-foreground">
                <input
                  checked={userForm.isActive}
                  onChange={(event) => setUserForm((current) => ({ ...current, isActive: event.target.checked }))}
                  type="checkbox"
                />
                User is active and allowed to sign in
              </label>
              <label className="mt-3 flex items-center gap-3 text-sm text-muted-foreground">
                <input
                  checked={userForm.mustChangePassword}
                  onChange={(event) => setUserForm((current) => ({ ...current, mustChangePassword: event.target.checked }))}
                  type="checkbox"
                />
                Force password change on next login
              </label>
            </div>

            <div className="rounded-[1.25rem] border border-border/80 bg-muted/25 p-4">
              <div className="mb-3 text-sm font-semibold text-foreground">Team membership</div>
              <div className="space-y-3">
                {teams.map((team) => (
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px]" key={team.id}>
                    <div>
                      <div className="font-medium text-foreground">{team.name}</div>
                      <div className="text-sm text-muted-foreground">{team.description || "No description"}</div>
                    </div>
                    <select
                      className="flex h-10 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                      value={membershipSelection[team.id] ?? "NONE"}
                      onChange={(event) =>
                        setMembershipSelection((current) => ({
                          ...current,
                          [team.id]: event.target.value as "NONE" | TeamMembershipRole
                        }))
                      }
                    >
                      <option value="NONE">No access</option>
                      <option value="MEMBER">Member</option>
                      <option value="LEAD">Lead</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!userForm.displayName.trim() || !userForm.username.trim() || saveUserMutation.isPending}
                onClick={() => saveUserMutation.mutate()}
                type="button"
              >
                {userEditId ? "Update user" : "Create user"}
              </Button>
              <Button onClick={startCreateUser} type="button" variant="outline">
                New blank user
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#72BF44]/20 bg-[#EEF8E8]/55">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Roles at a glance</CardTitle>
            <CardDescription>Quick scope reminder for role assignment. Full detail stays in the roles guide.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {roleScopeSummary.map((item) => (
              <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-3" key={item.role}>
                <div className="text-sm font-semibold text-foreground">{item.role}</div>
                <div className="mt-1 text-sm text-muted-foreground">{item.summary}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {userEditId ? (
          <Card>
            <CardHeader>
              <CardTitle>Reset password</CardTitle>
              <CardDescription>Set a new password for this user. Existing sessions will be invalidated.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>New password</Label>
                <Input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} />
              </div>
              <Button
                disabled={!resetPassword.trim() || resetPasswordMutation.isPending}
                onClick={() => resetPasswordMutation.mutate()}
                type="button"
                variant="outline"
              >
                Reset password and require change
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {userEditId ? (
          <Card>
            <CardHeader>
              <CardTitle>Invitation</CardTitle>
              <CardDescription>Generate a one-time activation link so the user can choose a password and sign in directly.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button disabled={inviteUserMutation.isPending} onClick={() => inviteUserMutation.mutate()} type="button" variant="outline">
                {inviteUserMutation.isPending ? "Generating..." : "Generate activation link"}
              </Button>
              {inviteLink ? (
                <div className="space-y-2">
                  <Label>Activation link</Label>
                  <Input readOnly value={inviteLink} />
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User directory</CardTitle>
          <CardDescription>Review platform accounts, last login activity, roles, and team memberships.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(usersQuery.data ?? []).map((user) => (
            <div className="rounded-[1.25rem] border bg-white p-4" key={user.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{user.displayName}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    @{user.username}
                    {user.email ? ` · ${user.email}` : ""}
                  </div>
                </div>
                <div className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {user.role.replace(/_/g, " ")}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className={`rounded-full px-2.5 py-1 font-medium ${user.isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {user.isActive ? "Active" : "Inactive"}
                </span>
                {user.mustChangePassword ? (
                  <span className="rounded-full bg-accent px-2.5 py-1 font-medium text-foreground">
                    Password change required
                  </span>
                ) : null}
                <span>Last login: {formatDate(user.lastLoginAt)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {user.teams.length ? (
                  user.teams.map((team) => (
                    <span className="rounded-full border border-border/80 px-2.5 py-1 text-xs text-muted-foreground" key={`${user.id}-${team.id}`}>
                      {team.name} · {team.membershipRole === "LEAD" ? "Lead" : "Member"}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-muted-foreground">No team membership</span>
                )}
              </div>
              <div className="mt-4 flex gap-3 text-sm">
                <button className="font-medium text-primary" onClick={() => startEditUser(user)} type="button">
                  Edit
                </button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

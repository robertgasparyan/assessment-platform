import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, ClipboardList, FileStack, Radar, LibraryBig, Users, LineChart, LockKeyhole, LogOut, UserCircle2, ListTodo, Bell, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth-context";
import { Button } from "@/components/ui/button";
import { CommandPalette } from "@/components/command-palette";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useApplicationBranding } from "@/hooks/use-application-branding";
import { useNavigationSearchSettings } from "@/hooks/use-navigation-search-settings";
import type { AiStatus, NotificationsResponse, UserRole } from "@/types";

const navItems: Array<{ to: string; label: string; icon: typeof LayoutDashboard; roles: UserRole[] }> = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["ADMIN", "TEMPLATE_MANAGER", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"] },
  { to: "/assessments", label: "Assessments", icon: ClipboardList, roles: ["ADMIN", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"] },
  { to: "/my-assessments", label: "My Assessments", icon: ListTodo, roles: ["ADMIN", "TEMPLATE_MANAGER", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"] },
  { to: "/templates", label: "Templates", icon: FileStack, roles: ["ADMIN", "TEMPLATE_MANAGER"] },
  { to: "/reports", label: "Reports", icon: LineChart, roles: ["ADMIN", "TEMPLATE_MANAGER", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"] },
  { to: "/teams", label: "Teams", icon: Users, roles: ["ADMIN"] },
  { to: "/libraries", label: "Libraries", icon: LibraryBig, roles: ["ADMIN", "TEMPLATE_MANAGER"] },
  { to: "/administration", label: "Administration", icon: ShieldCheck, roles: ["ADMIN"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, changePassword } = useAuth();
  const { applicationTitle } = useApplicationBranding();
  const navigationSearchQuery = useNavigationSearchSettings();
  const queryClient = useQueryClient();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPasswordPanelOpen, setIsPasswordPanelOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationsResponse>("/notifications"),
    enabled: Boolean(user)
  });
  const aiStatusQuery = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => api.get<AiStatus>("/settings/ai-status"),
    enabled: Boolean(user)
  });

  async function handleLogout() {
    await logout();
    toast.success("Logged out");
  }

  async function markNotificationRead(notificationId: string) {
    if (notificationId.startsWith("due-")) {
      return;
    }

    await api.post(`/notifications/${notificationId}/read`);
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function markAllNotificationsRead() {
    await api.post("/notifications/read-all");
    await queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }

  async function handlePasswordChange(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("New password confirmation does not match");
      return;
    }

    setIsSavingPassword(true);

    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setIsPasswordPanelOpen(false);
      setIsProfileMenuOpen(false);
      toast.success("Password changed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password change failed");
    } finally {
      setIsSavingPassword(false);
    }
  }

  return (
    <div className="min-h-screen">
      <div className="mx-auto flex max-w-[1600px] gap-6 px-4 py-6 lg:px-6">
        <aside className="hidden w-72 shrink-0 rounded-[2rem] border bg-white/88 p-5 shadow-sm backdrop-blur lg:block">
          <Link className="flex items-center gap-3 pb-8" to="/">
            <div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-sm">
              <Radar className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-muted-foreground">Admin workspace</div>
              <div className="text-xl font-semibold">{applicationTitle}</div>
            </div>
          </Link>
          <nav className="space-y-2">
            {navItems
            .filter((item) => !user?.role || item.roles.includes(user.role))
            .map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )
                  }
                  key={item.to}
                  to={item.to}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">
          <div className="mb-4 flex justify-end">
            <div className="flex items-center gap-3">
              <CommandPalette enabled={navigationSearchQuery.data?.enabled ?? true} />
              <div className="relative">
                <button
                  className="relative flex items-center gap-3 rounded-[1.25rem] border border-border/80 bg-white/92 px-3 py-2 text-left shadow-sm transition hover:border-primary/35 hover:bg-white"
                  onClick={() => setIsNotificationsOpen((current) => !current)}
                  type="button"
                >
                  <div className="rounded-full bg-primary/10 p-2 text-primary">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notifications</div>
                    <div className="text-sm font-semibold text-foreground">
                      {notificationsQuery.data?.unreadCount ? `${notificationsQuery.data.unreadCount} unread` : "Up to date"}
                    </div>
                  </div>
                  {(notificationsQuery.data?.unreadCount ?? 0) > 0 ? (
                    <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-primary" />
                  ) : null}
                </button>

                {isNotificationsOpen ? (
                  <div className="absolute right-0 z-20 mt-3 w-[380px] rounded-[1.5rem] border border-border/80 bg-white p-4 shadow-xl">
                    <div className="flex items-center justify-between gap-3 border-b border-border/80 pb-4">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Notifications</div>
                        <div className="mt-1 text-base font-semibold text-foreground">
                          {notificationsQuery.data?.unreadCount ?? 0} unread
                        </div>
                      </div>
                      <Button onClick={() => void markAllNotificationsRead()} size="sm" variant="outline">
                        Mark all read
                      </Button>
                    </div>
                    <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto">
                      {(notificationsQuery.data?.items ?? []).length ? (
                        notificationsQuery.data?.items.map((item) => (
                          <Link
                            className={cn(
                              "block rounded-[1.1rem] border px-4 py-3 transition hover:border-primary/35 hover:bg-accent/40",
                              item.isRead ? "bg-white" : "bg-accent/50"
                            )}
                            key={item.id}
                            onClick={() => {
                              setIsNotificationsOpen(false);
                              void markNotificationRead(item.id);
                            }}
                            to={item.linkUrl ?? "#"}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="text-sm font-semibold text-foreground">{item.title}</div>
                              {!item.isRead ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
                            </div>
                            <div className="mt-1 text-sm text-muted-foreground">{item.message}</div>
                            <div className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                              {new Intl.DateTimeFormat("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric"
                              }).format(new Date(item.createdAt))}
                            </div>
                          </Link>
                        ))
                      ) : (
                        <div className="rounded-[1.1rem] border border-dashed px-4 py-8 text-sm text-muted-foreground">
                          No notifications yet.
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="relative">
              <button
                className="flex items-center gap-3 rounded-[1.25rem] border border-border/80 bg-white/92 px-3 py-2 text-left shadow-sm transition hover:border-primary/35 hover:bg-white"
                onClick={() => setIsProfileMenuOpen((current) => !current)}
                type="button"
              >
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <UserCircle2 className="h-5 w-5" />
                </div>
                <div className="hidden sm:block">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Profile</div>
                  <div className="text-sm font-semibold text-foreground">{user?.displayName ?? user?.username}</div>
                  {aiStatusQuery.data?.visibleProviderLabel ? (
                    <div className="text-xs text-muted-foreground">{aiStatusQuery.data.visibleProviderLabel}</div>
                  ) : null}
                </div>
              </button>

              {isProfileMenuOpen ? (
                <div className="absolute right-0 z-20 mt-3 w-[320px] rounded-[1.5rem] border border-border/80 bg-white p-4 shadow-xl">
                  <div className="border-b border-border/80 pb-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Signed in</div>
                    <div className="mt-1 text-base font-semibold text-foreground">{user?.displayName ?? user?.username}</div>
                    <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      {user?.role.replace(/_/g, " ") ?? ""}
                    </div>
                    {aiStatusQuery.data?.visibleProviderLabel ? (
                      <div className="mt-2 text-xs font-medium text-muted-foreground">
                        Active AI: {aiStatusQuery.data.visibleProviderLabel}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 flex flex-col gap-2">
                    <Button
                      className="justify-start"
                      onClick={() => setIsPasswordPanelOpen((current) => !current)}
                      size="sm"
                      variant="outline"
                    >
                      <LockKeyhole className="mr-2 h-4 w-4" />
                      Change password
                    </Button>
                    <Button
                      className="justify-start"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        void handleLogout();
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      <LogOut className="mr-2 h-4 w-4" />
                      Logout
                    </Button>
                  </div>

                  {isPasswordPanelOpen ? (
                    <form className="mt-4 space-y-3 border-t border-border/80 pt-4" onSubmit={handlePasswordChange}>
                      <div className="space-y-1.5">
                        <Label htmlFor="current-password">Current password</Label>
                        <Input
                          id="current-password"
                          onChange={(event) => setCurrentPassword(event.target.value)}
                          type="password"
                          value={currentPassword}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-password">New password</Label>
                        <Input
                          id="new-password"
                          onChange={(event) => setNewPassword(event.target.value)}
                          type="password"
                          value={newPassword}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm-password">Confirm new password</Label>
                        <Input
                          id="confirm-password"
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          type="password"
                          value={confirmPassword}
                        />
                      </div>
                      <Button className="w-full" disabled={isSavingPassword} size="sm" type="submit">
                        {isSavingPassword ? "Saving..." : "Update password"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              ) : null}
              </div>
            </div>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}

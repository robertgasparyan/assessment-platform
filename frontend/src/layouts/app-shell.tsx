import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { LayoutDashboard, ClipboardList, FileStack, Radar, LibraryBig, Users, LineChart, LockKeyhole, LogOut, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assessments", label: "Assessments", icon: ClipboardList },
  { to: "/templates", label: "Templates", icon: FileStack },
  { to: "/reports", label: "Reports", icon: LineChart },
  { to: "/teams", label: "Teams", icon: Users },
  { to: "/libraries", label: "Libraries", icon: LibraryBig },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout, changePassword } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isPasswordPanelOpen, setIsPasswordPanelOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSavingPassword, setIsSavingPassword] = useState(false);

  async function handleLogout() {
    await logout();
    toast.success("Logged out");
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
              <div className="text-xl font-semibold">Assessment Platform</div>
            </div>
          </Link>
          <nav className="space-y-2">
            {navItems.map((item) => {
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
                  <div className="text-sm font-semibold text-foreground">{user?.username}</div>
                </div>
              </button>

              {isProfileMenuOpen ? (
                <div className="absolute right-0 z-20 mt-3 w-[320px] rounded-[1.5rem] border border-border/80 bg-white p-4 shadow-xl">
                  <div className="border-b border-border/80 pb-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Signed in</div>
                    <div className="mt-1 text-base font-semibold text-foreground">{user?.username}</div>
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
          {children}
        </main>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ClipboardList, FileStack, LayoutDashboard, LineChart, ListTodo, Search, Settings2, ShieldCheck, Users, LibraryBig } from "lucide-react";
import { useAuth } from "@/features/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { UserRole } from "@/types";

type CommandItem = {
  id: string;
  title: string;
  subtitle: string;
  to: string;
  icon: typeof LayoutDashboard;
  roles: UserRole[];
  aliases: string[];
};

const commandItems: CommandItem[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    subtitle: "Go to the operational home page",
    to: "/",
    icon: LayoutDashboard,
    roles: ["ADMIN", "TEMPLATE_MANAGER", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"],
    aliases: ["home", "overview"]
  },
  {
    id: "assessments-create",
    title: "Create assessment",
    subtitle: "Open Assessments on the Create tab",
    to: "/assessments?tab=create",
    icon: ClipboardList,
    roles: ["ADMIN", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"],
    aliases: ["new assessment", "launch run"]
  },
  {
    id: "assessments-active",
    title: "Active assessments",
    subtitle: "Open in-progress assessment runs",
    to: "/assessments?tab=active",
    icon: ClipboardList,
    roles: ["ADMIN", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"],
    aliases: ["current assessments", "draft runs"]
  },
  {
    id: "assessments-submitted",
    title: "Submitted assessments",
    subtitle: "Open completed assessment runs",
    to: "/assessments?tab=submitted",
    icon: ClipboardList,
    roles: ["ADMIN", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"],
    aliases: ["completed assessments", "archive"]
  },
  {
    id: "my-assessments",
    title: "My assessments",
    subtitle: "Open your personal assessment workspace",
    to: "/my-assessments",
    icon: ListTodo,
    roles: ["ADMIN", "TEMPLATE_MANAGER", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"],
    aliases: ["my work", "assigned runs"]
  },
  {
    id: "templates",
    title: "Templates",
    subtitle: "Open template authoring and versions",
    to: "/templates",
    icon: FileStack,
    roles: ["ADMIN", "TEMPLATE_MANAGER"],
    aliases: ["create template", "template library", "author template"]
  },
  {
    id: "libraries",
    title: "Libraries",
    subtitle: "Open reusable domains and questions",
    to: "/libraries",
    icon: LibraryBig,
    roles: ["ADMIN", "TEMPLATE_MANAGER"],
    aliases: ["question library", "domain library"]
  },
  {
    id: "reports",
    title: "Reports",
    subtitle: "Open current-state reporting across teams",
    to: "/reports",
    icon: LineChart,
    roles: ["ADMIN", "TEMPLATE_MANAGER", "TEAM_LEAD", "TEAM_MEMBER", "VIEWER"],
    aliases: ["latest by team", "analytics"]
  },
  {
    id: "teams",
    title: "Teams",
    subtitle: "Open team administration",
    to: "/teams",
    icon: Users,
    roles: ["ADMIN"],
    aliases: ["manage teams"]
  },
  {
    id: "administration",
    title: "Administration",
    subtitle: "Open administrator workspace",
    to: "/administration",
    icon: ShieldCheck,
    roles: ["ADMIN"],
    aliases: ["admin", "settings"]
  },
  {
    id: "users",
    title: "Users",
    subtitle: "Open user management in administration",
    to: "/administration?tab=users",
    icon: Users,
    roles: ["ADMIN"],
    aliases: ["user management", "accounts"]
  },
  {
    id: "audit-trail",
    title: "Audit trail",
    subtitle: "Open governance and audit history",
    to: "/administration?tab=audit",
    icon: Settings2,
    roles: ["ADMIN"],
    aliases: ["audit", "logs"]
  }
];

export function CommandPalette({
  enabled
}: {
  enabled: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const visibleCommands = useMemo(
    () => commandItems.filter((item) => !user?.role || item.roles.includes(user.role)),
    [user?.role]
  );

  const filteredCommands = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return visibleCommands;
    }

    return visibleCommands.filter((item) =>
      [item.title, item.subtitle, ...item.aliases].some((value) => value.toLowerCase().includes(normalizedQuery))
    );
  }, [query, visibleCommands]);

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
        return;
      }

      if (!isOpen) {
        return;
      }

      if (event.key === "Escape") {
        setIsOpen(false);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((current) => Math.min(current + 1, Math.max(filteredCommands.length - 1, 0)));
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key === "Enter" && filteredCommands[activeIndex]) {
        event.preventDefault();
        navigate(filteredCommands[activeIndex].to);
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeIndex, enabled, filteredCommands, isOpen, navigate]);

  useEffect(() => {
    setQuery("");
    setActiveIndex(0);
    setIsOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!enabled) {
    return null;
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} type="button" variant="outline">
        <Search className="mr-2 h-4 w-4" />
        Search
        <span className="ml-3 rounded-md border border-border/80 bg-muted/30 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Ctrl+K
        </span>
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/35 px-4 pt-[10vh] backdrop-blur-sm" onClick={() => setIsOpen(false)}>
          <div
            className="w-full max-w-2xl rounded-[1.75rem] border border-border/80 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border/80 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-primary/10 p-2 text-primary">
                  <Search className="h-5 w-5" />
                </div>
                <Input
                  autoFocus
                  className="border-0 px-0 text-base shadow-none focus-visible:ring-0"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search pages and quick destinations"
                  value={query}
                />
              </div>
            </div>

            <div className="max-h-[420px] overflow-y-auto p-3">
              {filteredCommands.length ? (
                <div className="space-y-2">
                  {filteredCommands.map((item, index) => {
                    const Icon = item.icon;
                    const isActive = index === activeIndex;

                    return (
                      <button
                        className={`flex w-full items-center justify-between gap-3 rounded-[1.1rem] border px-4 py-3 text-left transition ${
                          isActive ? "border-primary/20 bg-primary/5" : "border-transparent bg-white hover:border-primary/15 hover:bg-muted/25"
                        }`}
                        key={item.id}
                        onClick={() => {
                          navigate(item.to);
                          setIsOpen(false);
                        }}
                        onMouseEnter={() => setActiveIndex(index)}
                        type="button"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={`rounded-2xl p-3 ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground">{item.title}</div>
                            <div className="truncate text-sm text-muted-foreground">{item.subtitle}</div>
                          </div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-[1.1rem] border border-dashed px-4 py-10 text-sm text-muted-foreground">
                  No matching destinations found.
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

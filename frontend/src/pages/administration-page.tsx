import { useMemo } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { ShieldCheck, Users, Settings2, ScrollText, Database } from "lucide-react";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/features/auth-context";
import { ApplicationBrandingSection } from "@/components/application-branding-section";
import { AiAssistantSection } from "@/components/ai-assistant-section";
import { NavigationSearchSection } from "@/components/navigation-search-section";
import { UsersManagementSection } from "@/components/users-management-section";
import { AiConfigurationSection } from "@/components/ai-configuration-section";
import { EmailConfigurationSection } from "@/components/email-configuration-section";
import { AuditTrailSection } from "@/components/audit-trail-section";
import { DataModelSection } from "@/components/data-model-section";

const adminTabs = [
  { value: "users", label: "User Management", icon: Users },
  { value: "configurations", label: "Configurations", icon: Settings2 },
  { value: "audit", label: "Audit Trail", icon: ScrollText },
  { value: "data-model", label: "Data Model", icon: Database }
] as const;

type AdministrationTab = (typeof adminTabs)[number]["value"];

function normalizeTab(value: string | null): AdministrationTab {
  if (value === "users" || value === "configurations" || value === "audit" || value === "data-model") {
    return value;
  }

  return "users";
}

export function AdministrationPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = normalizeTab(searchParams.get("tab"));

  const tabMeta = useMemo(
    () => adminTabs.find((tab) => tab.value === activeTab) ?? adminTabs[0],
    [activeTab]
  );

  if (user?.role !== "ADMIN") {
    return <Navigate replace to="/" />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border bg-gradient-to-br from-primary/10 via-white to-accent/40 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Administration</div>
            <h1 className="mt-2 text-4xl font-semibold">Administration</h1>
            <p className="mt-2 max-w-3xl text-muted-foreground">
              Manage platform users, system configurations, and administrator-only governance tools from one workspace.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-primary/20 bg-white/80 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">{tabMeta.label}</div>
                <div className="text-sm text-muted-foreground">Administrator-only controls</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Tabs
        onValueChange={(value) => setSearchParams({ tab: value })}
        value={activeTab}
      >
        <TabsList>
          {adminTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.value} value={tab.value}>
                <span className="inline-flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent className="space-y-6" value="users">
          <UsersManagementSection />
        </TabsContent>

        <TabsContent className="space-y-6" value="configurations">
          <ApplicationBrandingSection />
          <NavigationSearchSection />
          <AiAssistantSection />
          <AiConfigurationSection />
          <EmailConfigurationSection />
        </TabsContent>

        <TabsContent className="space-y-6" value="audit">
          <AuditTrailSection />
        </TabsContent>

        <TabsContent className="space-y-6" value="data-model">
          <DataModelSection />
        </TabsContent>
      </Tabs>

      <div className="text-sm text-muted-foreground">
        Existing direct links still work:
        {" "}
        <Link className="font-medium text-primary" to="/administration?tab=users">User Management</Link>
        {" · "}
        <Link className="font-medium text-primary" to="/administration?tab=configurations">Configurations</Link>
        {" · "}
        <Link className="font-medium text-primary" to="/administration?tab=audit">Audit Trail</Link>
        {" · "}
        <Link className="font-medium text-primary" to="/administration?tab=data-model">Data Model</Link>
      </div>
    </div>
  );
}

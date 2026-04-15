import { Database, FileStack, GitBranch, Link2, Radar, Rows3, ShieldCheck, Sparkles, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportDataSection } from "@/components/export-data-section";

type EntityCard = {
  name: string;
  description: string;
  role: string;
  keys: string[];
  relationships: string[];
  tone: "green" | "slate" | "amber";
};

type EntityGroup = {
  title: string;
  description: string;
  icon: typeof Database;
  entities: EntityCard[];
};

const entityGroups: EntityGroup[] = [
  {
    title: "Identity And Access",
    description: "Who can use the platform, how they belong to teams, and where system-level settings live.",
    icon: Users,
    entities: [
      {
        name: "User",
        description: "Platform account, role, login session, invitation, and ownership anchor.",
        role: "Core identity",
        keys: ["id (PK)", "username", "role", "sessionToken", "inviteToken"],
        relationships: ["1 User -> many UserTeamMembership", "1 User -> many AssessmentRun (owner)", "1 User -> many ReportShareLink"],
        tone: "green"
      },
      {
        name: "UserTeamMembership",
        description: "Bridge table connecting users to teams with a lead/member role.",
        role: "Access bridge",
        keys: ["id (PK)", "userId (FK)", "teamId (FK)", "membershipRole"],
        relationships: ["many memberships -> 1 User", "many memberships -> 1 Team"],
        tone: "slate"
      },
      {
        name: "PlatformSetting",
        description: "Lightweight key/value storage for admin-managed platform configuration.",
        role: "System config",
        keys: ["key (PK)", "value"],
        relationships: ["Standalone settings model"],
        tone: "amber"
      }
    ]
  },
  {
    title: "Templates And Libraries",
    description: "Authoring-side models for reusable content, published snapshots, and versioned assessment structure.",
    icon: FileStack,
    entities: [
      {
        name: "AssessmentTemplate",
        description: "Top-level assessment family that owns multiple published versions.",
        role: "Template root",
        keys: ["id (PK)", "slug", "name"],
        relationships: ["1 template -> many TemplateVersion", "1 template -> many AssessmentRun"],
        tone: "green"
      },
      {
        name: "TemplateVersion",
        description: "Published snapshot of a template used as historical truth for runs.",
        role: "Version snapshot",
        keys: ["id (PK)", "templateId (FK)", "versionNumber"],
        relationships: ["many versions -> 1 AssessmentTemplate", "1 version -> many TemplateDomain", "1 version -> many AssessmentRun"],
        tone: "green"
      },
      {
        name: "TemplateDomain",
        description: "Ordered domain inside a published template version.",
        role: "Assessment structure",
        keys: ["id (PK)", "versionId (FK)", "sortOrder"],
        relationships: ["many domains -> 1 TemplateVersion", "1 domain -> many TemplateQuestion"],
        tone: "slate"
      },
      {
        name: "TemplateQuestion",
        description: "Question snapshot inside a published domain; responses connect here.",
        role: "Reporting join point",
        keys: ["id (PK)", "domainId (FK)", "sortOrder"],
        relationships: ["many questions -> 1 TemplateDomain", "1 question -> many QuestionLevel", "1 question -> many AssessmentResponse"],
        tone: "green"
      },
      {
        name: "QuestionLevel",
        description: "Scoring labels and descriptions for a question's maturity choices.",
        role: "Answer vocabulary",
        keys: ["id (PK)", "questionId (FK)", "value"],
        relationships: ["many levels -> 1 TemplateQuestion"],
        tone: "slate"
      },
      {
        name: "TemplateDraft",
        description: "Unpublished working copy used during authoring before release.",
        role: "Authoring only",
        keys: ["id (PK)", "slug", "draftData"],
        relationships: ["Draft-only, not part of submitted reporting truth"],
        tone: "amber"
      },
      {
        name: "Category",
        description: "Managed category list used during template authoring and classification.",
        role: "Managed reference",
        keys: ["id (PK)", "name"],
        relationships: ["Referenced by templates and drafts as classification data"],
        tone: "amber"
      },
      {
        name: "QuestionLibraryItem",
        description: "Reusable authoring question source before publishing into template snapshots.",
        role: "Library source",
        keys: ["id (PK)", "title", "prompt"],
        relationships: ["Used by authoring flows, not historical reporting joins"],
        tone: "amber"
      },
      {
        name: "DomainLibraryItem",
        description: "Reusable authoring domain source composed from library questions.",
        role: "Library source",
        keys: ["id (PK)", "title", "questions"],
        relationships: ["Used by authoring flows, not historical reporting joins"],
        tone: "amber"
      }
    ]
  },
  {
    title: "Assessment Operations",
    description: "Run-level lifecycle, answer capture, ownership history, and the core submitted assessment record.",
    icon: Radar,
    entities: [
      {
        name: "Team",
        description: "Organizational unit that owns assessment runs and memberships.",
        role: "Org dimension",
        keys: ["id (PK)", "name"],
        relationships: ["1 team -> many AssessmentRun", "1 team -> many UserTeamMembership"],
        tone: "green"
      },
      {
        name: "AssessmentRun",
        description: "Operational and analytical root for a single assessment instance.",
        role: "Fact header",
        keys: ["id (PK)", "templateId (FK)", "templateVersionId (FK)", "teamId (FK)", "status", "periodSortDate"],
        relationships: ["many runs -> 1 Team", "many runs -> 1 AssessmentTemplate", "many runs -> 1 TemplateVersion", "1 run -> many AssessmentResponse"],
        tone: "green"
      },
      {
        name: "AssessmentResponse",
        description: "Per-question answer rows captured against a specific assessment run.",
        role: "Fact detail",
        keys: ["id (PK)", "assessmentRunId (FK)", "questionId (FK)", "selectedValue"],
        relationships: ["many responses -> 1 AssessmentRun", "many responses -> 1 TemplateQuestion"],
        tone: "green"
      },
      {
        name: "AssessmentRunAssignment",
        description: "Ownership change history for assessment runs.",
        role: "Operational history",
        keys: ["id (PK)", "assessmentRunId (FK)", "assignedByUserId (FK)", "fromUserId", "toUserId"],
        relationships: ["many assignments -> 1 AssessmentRun", "many assignments -> 1 User (assigned by / from / to)"],
        tone: "slate"
      }
    ]
  },
  {
    title: "Sharing And Governance",
    description: "External sharing, notification, and governance records that orbit assessment runs.",
    icon: ShieldCheck,
    entities: [
      {
        name: "ReportShareLink",
        description: "Tokenized read-only access record for submitted results.",
        role: "External share",
        keys: ["id (PK)", "token", "assessmentRunId (FK)", "createdByUserId (FK)"],
        relationships: ["many share links -> 1 AssessmentRun", "many share links -> 1 User"],
        tone: "green"
      },
      {
        name: "AuditLog",
        description: "Immutable governance trail for important system actions.",
        role: "Governance",
        keys: ["id (PK)", "actorUserId (FK)", "assessmentRunId (FK)", "entityType", "action"],
        relationships: ["many audit logs -> 1 User", "many audit logs -> 1 AssessmentRun"],
        tone: "slate"
      },
      {
        name: "Notification",
        description: "In-app notification record scoped to a user and optionally a run.",
        role: "Operational signal",
        keys: ["id (PK)", "userId (FK)", "assessmentRunId (FK)", "type"],
        relationships: ["many notifications -> 1 User", "many notifications -> 1 AssessmentRun"],
        tone: "slate"
      }
    ]
  }
];

const reportingFlows = [
  {
    title: "Run-Level Reporting",
    grain: "One row per assessment run",
    path: ["Team", "AssessmentRun", "AssessmentTemplate", "TemplateVersion"],
    note: "Use for submitted-run lists, current-state snapshots, owner, period, due date, and overall score analysis."
  },
  {
    title: "Question-Level Reporting",
    grain: "One row per response",
    path: ["Team", "AssessmentRun", "AssessmentResponse", "TemplateQuestion", "TemplateDomain", "TemplateVersion"],
    note: "Use for Power BI or other tools when drilling into answered questions, maturity values, and comments."
  },
  {
    title: "Current-State Selection",
    grain: "One row per team or team + assessment",
    path: ["AssessmentRun (SUBMITTED only)", "periodSortDate DESC", "createdAt DESC"],
    note: "This is the rule for latest-per-team and latest-per-team-plus-template current-state reporting."
  }
];

const reportingMapNodes = [
  { title: "Team", note: "Organization dimension", tone: "green" as const },
  { title: "AssessmentRun", note: "Submitted run header", tone: "green" as const },
  { title: "AssessmentResponse", note: "Per-question fact rows", tone: "green" as const },
  { title: "TemplateQuestion", note: "Question snapshot", tone: "slate" as const },
  { title: "TemplateDomain", note: "Domain snapshot", tone: "slate" as const },
  { title: "TemplateVersion", note: "Published template version", tone: "green" as const }
];

type VisualMapNode = {
  id: string;
  title: string;
  note: string;
  lane: "reporting" | "snapshot" | "support";
  tone: EntityCard["tone"];
  desktopClassName: string;
  widthClassName?: string;
};

type VisualMapLink = {
  id: string;
  from: [number, number];
  to: [number, number];
  label?: string;
  labelPosition?: [number, number];
  path?: string;
  tone?: "primary" | "muted";
  dashed?: boolean;
};

const visualMapNodes: VisualMapNode[] = [
  {
    id: "user",
    title: "User",
    note: "Ownership and access anchor",
    lane: "support",
    tone: "amber",
    desktopClassName: "left-[4%] top-[9%]",
    widthClassName: "w-[150px]"
  },
  {
    id: "team",
    title: "Team",
    note: "Organization dimension",
    lane: "reporting",
    tone: "green",
    desktopClassName: "left-[12%] top-[36%]",
    widthClassName: "w-[158px]"
  },
  {
    id: "run",
    title: "AssessmentRun",
    note: "Submitted reporting root",
    lane: "reporting",
    tone: "green",
    desktopClassName: "left-[38%] top-[36%]",
    widthClassName: "w-[172px]"
  },
  {
    id: "response",
    title: "AssessmentResponse",
    note: "Per-question fact row",
    lane: "reporting",
    tone: "green",
    desktopClassName: "left-[69%] top-[36%]",
    widthClassName: "w-[168px]"
  },
  {
    id: "question",
    title: "TemplateQuestion",
    note: "Question snapshot",
    lane: "snapshot",
    tone: "slate",
    desktopClassName: "left-[64%] top-[70%]",
    widthClassName: "w-[164px]"
  },
  {
    id: "domain",
    title: "TemplateDomain",
    note: "Domain snapshot",
    lane: "snapshot",
    tone: "slate",
    desktopClassName: "left-[40%] top-[70%]",
    widthClassName: "w-[164px]"
  },
  {
    id: "version",
    title: "TemplateVersion",
    note: "Historical template truth",
    lane: "snapshot",
    tone: "green",
    desktopClassName: "left-[16%] top-[70%]",
    widthClassName: "w-[168px]"
  },
  {
    id: "assignment",
    title: "Assignment",
    note: "Owner change history",
    lane: "support",
    tone: "amber",
    desktopClassName: "left-[40%] top-[8%]",
    widthClassName: "w-[150px]"
  },
  {
    id: "share",
    title: "ShareLink",
    note: "Read-only report access",
    lane: "support",
    tone: "amber",
    desktopClassName: "left-[78%] top-[11%]",
    widthClassName: "w-[150px]"
  },
  {
    id: "audit",
    title: "AuditLog",
    note: "Governance trail",
    lane: "support",
    tone: "amber",
    desktopClassName: "left-[82%] top-[62%]",
    widthClassName: "w-[140px]"
  }
];

const visualMapLinks: VisualMapLink[] = [
  { id: "user-run", from: [12, 19], to: [44, 40], label: "owns", labelPosition: [27, 27], path: "M 12 19 C 20 19, 28 26, 44 40", tone: "muted", dashed: true },
  { id: "team-run", from: [28, 40], to: [38, 40], label: "1 -> many", labelPosition: [33, 37.2], path: "M 28 40 C 31 40, 34 40, 38 40", tone: "primary" },
  { id: "run-response", from: [55, 40], to: [69, 40], label: "1 -> many", labelPosition: [62, 37.2], path: "M 55 40 C 59 40, 63 40, 69 40", tone: "primary" },
  { id: "response-question", from: [78, 49], to: [78, 70], label: "answers", labelPosition: [82, 58], path: "M 78 49 C 78 55, 78 62, 78 70", tone: "primary" },
  { id: "question-domain", from: [64, 74], to: [56, 74], label: "many -> 1", labelPosition: [60, 71.6], path: "M 64 74 C 61 74, 59 74, 56 74", tone: "muted" },
  { id: "domain-version", from: [40, 74], to: [32, 74], label: "many -> 1", labelPosition: [36, 71.6], path: "M 40 74 C 37 74, 35 74, 32 74", tone: "muted" },
  { id: "version-run", from: [24, 70], to: [43, 52], label: "snapshot used by run", labelPosition: [25, 59], path: "M 24 70 C 28 67, 35 62, 43 52", tone: "primary", dashed: true },
  { id: "assignment-run", from: [48, 19], to: [48, 36], label: "history", labelPosition: [52, 25], path: "M 48 19 C 48 23, 48 29, 48 36", tone: "muted", dashed: true },
  { id: "share-run", from: [84, 19], to: [55, 37], label: "shares results", labelPosition: [74, 20], path: "M 84 19 C 78 19, 67 24, 55 37", tone: "muted", dashed: true },
  { id: "audit-run", from: [86, 69], to: [55, 43], label: "tracks changes", labelPosition: [72, 54], path: "M 86 69 C 80 66, 66 55, 55 43", tone: "muted", dashed: true }
];

function toneClasses(tone: EntityCard["tone"]) {
  if (tone === "green") {
    return "border-primary/25 bg-primary/5";
  }

  if (tone === "amber") {
    return "border-amber-200 bg-amber-50";
  }

  return "border-border/80 bg-muted/20";
}

function visualNodeClasses(tone: EntityCard["tone"], lane: VisualMapNode["lane"]) {
  const toneClass =
    tone === "green"
      ? "border-primary/25 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(238,248,232,0.96))]"
      : tone === "amber"
        ? "border-amber-200 bg-[linear-gradient(180deg,_rgba(255,250,240,0.98),_rgba(255,247,230,0.96))]"
        : "border-border/80 bg-[linear-gradient(180deg,_rgba(255,255,255,0.98),_rgba(244,244,244,0.94))]";
  const laneClass =
    lane === "reporting"
      ? "shadow-[0_22px_50px_-28px_rgba(114,191,68,0.52)]"
      : lane === "snapshot"
        ? "shadow-[0_20px_42px_-30px_rgba(85,85,85,0.24)]"
        : "shadow-[0_20px_42px_-32px_rgba(180,146,73,0.28)]";

  return `${toneClass} ${laneClass}`;
}

function VisualRelationshipMap() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[1rem] border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Highlighted lane:</span> submitted reporting flow from `Team` through template snapshots
        </div>
        <div className="rounded-[1rem] border border-border/70 bg-white p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Muted links:</span> supporting relationships such as ownership, sharing, and audit
        </div>
        <div className="rounded-[1rem] border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Snapshot truth:</span> reporting joins flow into published template version tables, not library entities
        </div>
      </div>

      <div className="hidden items-center justify-between gap-4 lg:flex">
        <div className="flex items-center gap-3">
          <div className="rounded-full border border-primary/20 bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/80 shadow-sm">
            Reporting lane
          </div>
          <div className="rounded-full border border-border/70 bg-white/92 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground shadow-sm">
            Snapshot lane
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border/70 bg-white/92 px-3 py-2 shadow-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-medium text-foreground">Legend</span>
          <span className="h-2.5 w-2.5 rounded-full bg-primary" />
          <span className="text-xs text-muted-foreground">Primary joins</span>
          <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/70" />
          <span className="text-xs text-muted-foreground">Support links</span>
        </div>
      </div>

      <div className="hidden overflow-hidden rounded-[1.75rem] border border-border/80 bg-[linear-gradient(180deg,_rgba(238,248,232,0.62),_rgba(255,255,255,0.98)_24%,_rgba(244,244,244,0.95)_100%)] p-6 lg:block">
        <div className="relative h-[640px]">
          <div className="pointer-events-none absolute inset-x-[7%] top-[27%] h-[144px] rounded-[2rem] border border-primary/20 bg-[linear-gradient(90deg,_rgba(114,191,68,0.09),_rgba(255,255,255,0.22),_rgba(114,191,68,0.08))]" />
          <div className="pointer-events-none absolute inset-x-[12%] top-[66%] h-[132px] rounded-[2rem] border border-border/70 bg-[linear-gradient(90deg,_rgba(255,255,255,0.94),_rgba(244,244,244,0.9),_rgba(255,255,255,0.94))]" />
          <div className="pointer-events-none absolute left-[6%] top-[7%] h-[180px] w-[28%] rounded-[2rem] bg-[radial-gradient(circle,_rgba(255,208,120,0.18),_transparent_72%)]" />
          <div className="pointer-events-none absolute right-[4%] top-[52%] h-[180px] w-[28%] rounded-[2rem] bg-[radial-gradient(circle,_rgba(85,85,85,0.08),_transparent_72%)]" />

          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <marker id="visual-map-arrow-primary" markerWidth="6" markerHeight="6" refX="5.6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="rgba(114,191,68,0.92)" />
              </marker>
              <marker id="visual-map-arrow-muted" markerWidth="6" markerHeight="6" refX="5.6" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 z" fill="rgba(85,85,85,0.72)" />
              </marker>
            </defs>
            {visualMapLinks.map((link) => {
              const primary = link.tone !== "muted";
              const stroke = primary ? "rgba(114,191,68,0.9)" : "rgba(85,85,85,0.56)";
              const marker = primary ? "url(#visual-map-arrow-primary)" : "url(#visual-map-arrow-muted)";
              const labelX = link.labelPosition?.[0] ?? (link.from[0] + link.to[0]) / 2;
              const labelY = link.labelPosition?.[1] ?? (link.from[1] + link.to[1]) / 2;

              return (
                <g key={link.id}>
                  <path
                    d={link.path ?? `M ${link.from[0]} ${link.from[1]} L ${link.to[0]} ${link.to[1]}`}
                    stroke={stroke}
                    strokeDasharray={link.dashed ? "1.5 1.5" : undefined}
                    strokeLinecap="round"
                    strokeWidth={primary ? 0.7 : 0.42}
                    fill="none"
                    markerEnd={marker}
                  />
                  {link.label ? (
                    <g>
                      <rect
                        x={labelX - Math.max(4.8, link.label.length * 0.32)}
                        y={labelY - 2}
                        rx="1.4"
                        width={Math.max(9.6, link.label.length * 0.64)}
                        height="3.2"
                        fill="rgba(255,255,255,0.94)"
                      />
                      <text
                        x={labelX}
                        y={labelY + 0.1}
                        fill={primary ? "rgba(51,51,51,0.94)" : "rgba(85,85,85,0.84)"}
                        fontSize="1.28"
                        fontWeight="600"
                        textAnchor="middle"
                      >
                        {link.label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {visualMapNodes.map((node) => (
            <div
              className={`absolute rounded-[1.35rem] border px-4 py-3 backdrop-blur-sm ${visualNodeClasses(node.tone, node.lane)} ${node.widthClassName ?? "w-[164px]"} ${node.desktopClassName}`}
              key={node.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-semibold text-foreground">{node.title}</div>
                <div className={`rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.16em] ${
                  node.lane === "reporting"
                    ? "bg-primary/10 text-primary"
                    : node.lane === "snapshot"
                      ? "bg-secondary text-muted-foreground"
                      : "bg-amber-100 text-amber-800"
                }`}>
                  {node.lane}
                </div>
              </div>
              <div className="mt-2 text-xs leading-5 text-muted-foreground">{node.note}</div>
              <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {node.lane === "reporting" ? "Reporting" : node.lane === "snapshot" ? "Snapshot" : "Support"}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:hidden">
        <div className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
          <div className="text-sm font-semibold text-foreground">Visual relationship map</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Desktop shows the full connected diagram. On smaller screens the same structure is grouped into lanes.
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Reporting lane</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {["Team", "AssessmentRun", "AssessmentResponse"].map((step, index, steps) => (
              <div className="contents" key={step}>
                <div className="rounded-[1rem] border border-primary/25 bg-white px-4 py-3 text-sm font-medium text-foreground">{step}</div>
                {index < steps.length - 1 ? <div className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{"->"}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-border/70 bg-white p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Snapshot lane</div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {["TemplateQuestion", "TemplateDomain", "TemplateVersion"].map((step, index, steps) => (
              <div className="contents" key={step}>
                <div className="rounded-[1rem] border border-border/70 bg-muted/20 px-4 py-3 text-sm font-medium text-foreground">{step}</div>
                {index < steps.length - 1 ? <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{"->"}</div> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-foreground">Support links</div>
          <div className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">User {"->"} AssessmentRun</span>,{" "}
            <span className="font-medium text-foreground">AssessmentRunAssignment {"->"} AssessmentRun</span>,{" "}
            <span className="font-medium text-foreground">ReportShareLink {"->"} AssessmentRun</span>,{" "}
            <span className="font-medium text-foreground">AuditLog {"->"} AssessmentRun</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DataModelSection() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-white to-accent/30">
            <CardTitle>Operational vs Reporting Model</CardTitle>
            <CardDescription>
              The same database supports day-to-day operations and analytical consumers. Submitted reporting relies on version snapshots, not authoring library rows.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-primary/25 bg-primary/5 p-4">
              <div className="text-sm font-semibold text-foreground">Operational model</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Includes drafts, notifications, assignments, invitations, settings, and active/in-progress runs used by the application shell and workflows.
              </div>
            </div>
            <div className="rounded-[1.25rem] border border-border/80 bg-muted/20 p-4">
              <div className="text-sm font-semibold text-foreground">Reporting model</div>
              <div className="mt-2 text-sm text-muted-foreground">
                Focuses on `SUBMITTED` runs, template version snapshots, teams, and responses. This is the path external analytics tools should follow.
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fast Orientation</CardTitle>
            <CardDescription>Start here when someone needs to connect the schema quickly.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 rounded-[1.1rem] border border-primary/20 bg-primary/5 p-3">
              <Rows3 className="mt-0.5 h-4 w-4 text-primary" />
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Primary reporting root:</span> `AssessmentRun`
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-[1.1rem] border border-primary/20 bg-primary/5 p-3">
              <GitBranch className="mt-0.5 h-4 w-4 text-primary" />
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Detailed answers live in:</span> `AssessmentResponse`
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-[1.1rem] border border-primary/20 bg-primary/5 p-3">
              <FileStack className="mt-0.5 h-4 w-4 text-primary" />
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Historical template truth:</span> `TemplateVersion` {"->"} `TemplateDomain` {"->"} `TemplateQuestion`
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-[1.1rem] border border-primary/20 bg-primary/5 p-3">
              <Link2 className="mt-0.5 h-4 w-4 text-primary" />
              <div className="text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">Current-state rule:</span> `SUBMITTED` only, ordered by `periodSortDate DESC`, then `createdAt DESC`
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compact Reporting Relationship Map</CardTitle>
          <CardDescription>Minimal view of the path most external reporting consumers need for submitted assessment analysis.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {reportingMapNodes.map((node, index) => (
              <div className="contents" key={node.title}>
                <div className={`min-w-[150px] rounded-[1.15rem] border px-4 py-3 ${toneClasses(node.tone)}`}>
                  <div className="text-sm font-semibold text-foreground">{node.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{node.note}</div>
                </div>
                {index < reportingMapNodes.length - 1 ? (
                  <div className="flex items-center px-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {"->"}
                  </div>
                ) : null}
              </div>
            ))}
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[1rem] border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Submitted-only rule:</span> start from `AssessmentRun` where `status = SUBMITTED`
            </div>
            <div className="rounded-[1rem] border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Historical truth:</span> join to template snapshot tables, not library items
            </div>
            <div className="rounded-[1rem] border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">Current-state rule:</span> `periodSortDate DESC`, then `createdAt DESC`
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-white to-secondary/70">
          <CardTitle>Visual Relationship Map</CardTitle>
          <CardDescription>
            Curated view of the reporting path and its surrounding operational relationships. This is meant for fast human orientation, not raw schema exhaustiveness.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5">
          <VisualRelationshipMap />
        </CardContent>
      </Card>

      <ExportDataSection />

      <Card>
        <CardHeader>
          <CardTitle>Reporting Paths</CardTitle>
          <CardDescription>Recommended relationship chains for external reporting and BI-style consumers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-3">
          {reportingFlows.map((flow) => (
            <div className="rounded-[1.25rem] border bg-white p-4" key={flow.title}>
              <div className="flex items-center justify-between gap-3">
                <div className="text-base font-semibold">{flow.title}</div>
                <Badge variant="outline">{flow.grain}</Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {flow.path.map((step, index) => (
                  <div className="contents" key={`${flow.title}-${step}`}>
                    <span className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-foreground">{step}</span>
                    {index < flow.path.length - 1 ? <span className="text-xs text-muted-foreground">{"->"}</span> : null}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-sm text-muted-foreground">{flow.note}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      {entityGroups.map((group) => {
        const Icon = group.icon;
        return (
          <Card key={group.title}>
            <CardHeader>
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>{group.title}</CardTitle>
                  <CardDescription>{group.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 xl:grid-cols-2">
              {group.entities.map((entity) => (
                <div className={`rounded-[1.25rem] border p-4 ${toneClasses(entity.tone)}`} key={entity.name}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{entity.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{entity.description}</div>
                    </div>
                    <Badge variant={entity.tone === "green" ? "success" : entity.tone === "amber" ? "outline" : "secondary"}>
                      {entity.role}
                    </Badge>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Key fields</div>
                      <div className="flex flex-wrap gap-2">
                        {entity.keys.map((key) => (
                          <span className="rounded-full border border-border/80 bg-white px-2.5 py-1 text-xs text-muted-foreground" key={`${entity.name}-${key}`}>
                            {key}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Relationships</div>
                      <div className="space-y-2">
                        {entity.relationships.map((relationship) => (
                          <div className="rounded-[0.9rem] border border-border/70 bg-white px-3 py-2 text-xs text-muted-foreground" key={`${entity.name}-${relationship}`}>
                            {relationship}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

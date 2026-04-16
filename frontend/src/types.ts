export type Team = {
  id: string;
  name: string;
  description?: string;
};

export type UserRole = "ADMIN" | "TEMPLATE_MANAGER" | "TEAM_LEAD" | "TEAM_MEMBER" | "VIEWER";
export type TeamMembershipRole = "LEAD" | "MEMBER";

export type UserSummary = {
  id: string;
  displayName: string;
  username: string;
  email?: string | null;
  role: UserRole;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  teams: Array<{
    id: string;
    name: string;
    description?: string | null;
    membershipRole: TeamMembershipRole;
  }>;
};

export type AssignmentHistoryEntry = {
  id: string;
  createdAt: string;
  assignedByUser: {
    id: string;
    displayName: string;
    username: string;
  };
  fromUser: {
    id: string;
    displayName: string;
    username: string;
  } | null;
  toUser: {
    id: string;
    displayName: string;
    username: string;
  } | null;
  fromOwnerName: string | null;
  toOwnerName: string | null;
};

export type NotificationItem = {
  id: string;
  type: string;
  title: string;
  message: string;
  linkUrl: string | null;
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};

export type NotificationsResponse = {
  unreadCount: number;
  items: NotificationItem[];
};

export type AuditLogEntry = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  metadata: unknown;
  createdAt: string;
  actorUser: {
    id: string;
    displayName: string;
    username: string;
  } | null;
};

export type ReportShareLink = {
  id: string;
  token: string;
  shareUrl: string;
  isRevoked: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdByUser?: {
    id: string;
    displayName: string;
    username: string;
  };
};

export type GuestAssessmentLink = {
  id: string;
  token: string;
  guestUrl: string;
  inviteLabel: string | null;
  guestDisplayName: string | null;
  guestEmail: string | null;
  isRevoked: boolean;
  expiresAt: string | null;
  startedAt: string | null;
  lastAccessedAt: string | null;
  submittedAt: string | null;
  createdAt: string;
};

export type GuestParticipationSettings = {
  guestParticipationEnabled: boolean;
  guestResultsVisible: boolean;
};

export type ReportEmailDeliverySettings = {
  enabled: boolean;
  configured: boolean;
  available: boolean;
  smtp?: {
    host: string;
    port: number;
    from: string;
    hasUser: boolean;
    hasPassword: boolean;
    source?: {
      host: "env" | "admin";
      port: "env" | "admin";
      from: "env" | "admin";
    };
  };
};

export type AiProvider = "ollama" | "openai" | "claude" | "gemini";

export type AiProviderSettingsSummary = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  source: {
    baseUrl: "env" | "admin";
    model: "env" | "admin";
    apiKey: "env" | "admin" | "none";
  };
};

export type AiSettingsSummary = {
  enabled: boolean;
  activeProvider: AiProvider;
  showProviderToUsers: boolean;
  providers: Record<AiProvider, AiProviderSettingsSummary>;
};

export type AiStatus = {
  enabled: boolean;
  activeProvider: AiProvider;
  activeModel: string;
  showProviderToUsers: boolean;
  visibleProviderLabel: string | null;
};

export type AiExecutiveSummary = {
  headline: string;
  summary: string;
  strengths: string[];
  watchouts: string[];
  recommendations: string[];
  leadershipBrief: string;
  providerLabel: string | null;
  cached: boolean;
  cachedAt: string | null;
};

export type AiResultsAnswer = {
  answer: string;
  supportingPoints: string[];
  providerLabel: string | null;
};

export type AdminExportOptions = {
  json: {
    modes: Array<{
      value: "portable" | "full";
      label: string;
      description: string;
    }>;
  };
  postgres: {
    available: boolean;
    executable: string;
    version: string | null;
    checkedAt: string;
    error: string | null;
    formats: Array<{
      value: "plain" | "custom";
      label: string;
      description: string;
    }>;
  };
};

export type SendReportEmailResponse = {
  ok: boolean;
  shareLink: ReportShareLink;
};

export type Category = {
  id: string;
  name: string;
  description?: string;
};

export type Level = {
  id?: string;
  value: number;
  label: string;
  description: string;
};

export type AssessmentPeriodType = "QUARTER" | "CUSTOM_RANGE" | "POINT_IN_TIME";

export type LibraryQuestion = {
  id: string;
  title: string;
  prompt: string;
  guidance?: string;
  levels: Level[];
  usage?: {
    draftCount: number;
    templateCount: number;
    domainCount: number;
  };
};

export type LibraryDomain = {
  id: string;
  title: string;
  description?: string;
  questions: LibraryQuestion[];
  usage?: {
    draftCount: number;
    templateCount: number;
  };
};

export type TemplateAuthoringQuestion = {
  id?: string;
  prompt: string;
  guidance?: string;
  levels: Level[];
  libraryId?: string;
};

export type TemplateAuthoringDomain = {
  id?: string;
  title: string;
  description?: string;
  questions: TemplateAuthoringQuestion[];
  libraryId?: string;
};

export type TemplateDraft = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  status: string;
  scoringLabels: string[];
  domains: TemplateAuthoringDomain[];
  createdAt: string;
  updatedAt: string;
};

export type TemplateQuestion = {
  id?: string;
  prompt: string;
  guidance?: string;
  levels: Level[];
};

export type TemplateDomain = {
  id?: string;
  title: string;
  description?: string;
  questions: TemplateQuestion[];
};

export type TemplateVersion = {
  id: string;
  versionNumber: number;
  name: string;
  description?: string;
  category?: string;
  scoringLabels: string[];
  domains: TemplateDomain[];
};

export type TemplateSummary = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  updatedAt: string;
  usage: {
    totalRuns: number;
    submittedRuns: number;
  };
  latestVersion: {
    id: string;
    versionNumber: number;
    scoringLabels: string[];
  } | null;
};

export type TemplateDetail = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  category?: string;
  usage: {
    totalRuns: number;
    recentRuns: Array<{
      id: string;
      title: string;
      teamName: string;
      periodLabel: string;
      status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
      updatedAt: string;
    }>;
  };
  versions: TemplateVersion[];
};

export type AssessmentRunSummary = {
  id: string;
  title: string;
  ownerUser: {
    id: string;
  } | null;
  ownerName?: string | null;
  dueDate: string | null;
  guestParticipationEnabled: boolean;
  periodType: AssessmentPeriodType;
  periodLabel: string;
  periodBucket: string;
  status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
  overallScore: number | null;
  submissionSummary?: string | null;
  submittedAt: string | null;
  updatedAt: string;
  team: Team;
  templateVersion: {
    id: string;
    name: string;
    versionNumber: number;
  };
};

export type AssessmentQuestionWithResponse = {
  id: string;
  prompt: string;
  guidance?: string;
  levels: Level[];
  response: {
    selectedValue: number;
    selectedLabel: string;
    comment?: string;
  } | null;
};

export type AssessmentDomainWithResponse = {
  id: string;
  title: string;
  description?: string;
  answeredQuestions: number;
  totalQuestions: number;
  averageScore: number | null;
  questions: AssessmentQuestionWithResponse[];
};

export type AssessmentRunDetail = {
  id: string;
  title: string;
  team: Team;
  ownerUser: {
    id: string;
    displayName: string;
    username: string;
    role: UserRole;
  } | null;
  ownerName?: string | null;
  assignmentHistory: AssignmentHistoryEntry[];
  dueDate: string | null;
  guestParticipationEnabled: boolean;
  guestResultsVisible: boolean;
  periodType: AssessmentPeriodType;
  periodLabel: string;
  periodBucket: string;
  periodSortDate: string;
  year: number | null;
  quarter: number | null;
  startDate: string | null;
  endDate: string | null;
  referenceDate: string | null;
  status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
  submittedAt: string | null;
  submissionSummary?: string | null;
  createdAt: string;
  updatedAt: string;
  overallScore: number | null;
  templateVersion: TemplateVersion;
  domains: AssessmentDomainWithResponse[];
};

export type MyAssessmentsSummary = {
  assignedActive: AssessmentRunSummary[];
  teamActive: AssessmentRunSummary[];
  submittedAccessible: AssessmentRunSummary[];
};

export type AssessmentResults = AssessmentRunDetail & {
  trend: Array<{
    assessmentRunId: string;
    periodLabel: string;
    overallScore: number;
  }>;
  domainTrend: Array<{
    assessmentRunId: string;
    periodLabel: string;
    domains: Array<{
      domainId: string;
      title: string;
      score: number | null;
    }>;
  }>;
  comparison: Array<{
    teamName: string;
    overallScore: number;
    status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
  }>;
  comparisonCandidates: Array<{
    assessmentRunId: string;
    title: string;
    periodLabel: string;
    overallScore: number;
    submittedAt: string | null;
    isDefault: boolean;
  }>;
  previousRun: {
    assessmentRunId: string;
    title: string;
    periodLabel: string;
    overallScore: number;
    submittedAt: string | null;
  } | null;
  delta: {
    overallScoreChange: number | null;
    domains: Array<{
      domainId: string;
      title: string;
      currentScore: number | null;
      previousScore: number | null;
      scoreChange: number | null;
    }>;
    questions: Array<{
      domainId: string;
      domainTitle: string;
      questionId: string;
      prompt: string;
      currentValue: number | null;
      previousValue: number | null;
      scoreChange: number | null;
      currentLabel: string | null;
      previousLabel: string | null;
    }>;
  };
  highlights: {
    strongestDomain: {
      domainId: string;
      title: string;
      score: number | null;
    } | null;
    weakestDomain: {
      domainId: string;
      title: string;
      score: number | null;
    } | null;
    strengths: Array<{
      domainTitle: string;
      prompt: string;
      selectedValue: number | null;
      selectedLabel: string | null;
    }>;
    focusAreas: Array<{
      domainTitle: string;
      prompt: string;
      selectedValue: number | null;
      selectedLabel: string | null;
    }>;
  };
  distribution: {
    levels: Array<{
      value: number;
      label: string;
      count: number;
    }>;
  };
};

export type SharedAssessmentResults = AssessmentResults & {
  sharedView: {
    token: string;
    expiresAt: string | null;
    createdAt: string;
  };
};

export type GuestAssessmentRunDetail = AssessmentRunDetail & {
  guestAccess: {
    token: string;
    expiresAt: string | null;
    createdAt: string;
    inviteLabel: string | null;
    guestDisplayName: string | null;
    guestEmail: string | null;
    submittedAt: string | null;
    resultsVisible: boolean;
  };
};

export type GuestSharedAssessmentResults = SharedAssessmentResults & {
  guestAccess: {
    token: string;
    expiresAt: string | null;
    createdAt: string;
    inviteLabel: string | null;
    guestDisplayName: string | null;
    guestEmail: string | null;
    submittedAt: string | null;
    resultsVisible: boolean;
  };
};

export type DashboardSummary = {
  currentUser: {
    id: string;
    username: string;
    displayName: string;
    role: UserRole;
  };
  templates: number;
  runs: number;
  submittedRuns: number;
  draftRuns: number;
  teams: number;
  latestSubmittedByTeam: Array<{
    id: string;
    title: string;
    teamName: string;
    templateName: string;
    periodLabel: string;
    submittedAt: string | null;
    overallScore: number | null;
    guestParticipationEnabled: boolean;
  }>;
  latestRuns: Array<{
    id: string;
    title: string;
    periodLabel: string;
    status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
    teamName: string;
    templateName: string;
    updatedAt: string;
  }>;
  myWork: {
    assignedCount: number;
    teamCount: number;
    overdueCount: number;
    dueSoonCount: number;
    guestEnabledCount: number;
    focusRuns: Array<{
      id: string;
      title: string;
      teamName: string;
      dueDate: string | null;
      status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
      guestParticipationEnabled: boolean;
      ownership: "assigned" | "team";
    }>;
    assignedRuns: Array<{
      id: string;
      title: string;
      teamName: string;
      dueDate: string | null;
      status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
      guestParticipationEnabled: boolean;
    }>;
    teamRuns: Array<{
      id: string;
      title: string;
      teamName: string;
      dueDate: string | null;
      status: "DRAFT" | "IN_PROGRESS" | "SUBMITTED" | "ARCHIVED";
      guestParticipationEnabled: boolean;
    }>;
  };
};

export type LatestByTeamReport = {
  assessmentRunId: string;
  title: string;
  teamId: string;
  teamName: string;
  templateId: string;
  templateName: string;
  templateCategory: string | null;
  periodLabel: string;
  submittedAt: string | null;
  overallScore: number | null;
  strongestDomain: {
    title: string;
    score: number | null;
  } | null;
  weakestDomain: {
    title: string;
    score: number | null;
  } | null;
  domains: Array<{
    title: string;
    averageScore: number | null;
    questions: Array<{
      prompt: string;
      selectedValue: number | null;
      selectedLabel: string | null;
    }>;
  }>;
};

export type LatestByTeamReportsResponse = {
  selectionRule: {
    latestByTeam: string;
    latestByTeamTemplate: string;
  };
  summary: {
    teamsWithSubmittedRuns: number;
    averageLatestScore: number | null;
    highestTeam: {
      teamName: string;
      overallScore: number | null;
    } | null;
    lowestTeam: {
      teamName: string;
      overallScore: number | null;
    } | null;
    mostCommonWeakestDomain: {
      title: string;
      teamCount: number;
    } | null;
  };
  latestByTeam: LatestByTeamReport[];
  latestByTeamTemplate: LatestByTeamReport[];
  domainSnapshot: Array<{
    title: string;
    averageScore: number | null;
    teamCount: number;
  }>;
};

export type ReportsAiBrief = {
  headline: string;
  summary: string;
  patterns: string[];
  risks: string[];
  recommendations: string[];
  leadershipBrief: string;
  providerLabel: string | null;
  cached: boolean;
  cachedAt: string | null;
};

export type TemplateAiQuestionAssist = {
  rewrittenPrompt: string;
  guidance: string;
  levels: Level[];
  notes: string[];
  providerLabel: string | null;
};

export type TemplateAiDomainAssist = {
  suggestedTitle: string;
  rewrittenDescription: string;
  notes: string[];
  providerLabel: string | null;
};

export type TemplateAiConsistencyReview = {
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
  providerLabel: string | null;
};

export type TemplateAiScaffold = {
  name: string;
  slug: string;
  description: string;
  category: string;
  scoringLabels: string[];
  buildNotes: string[];
  providerLabel: string | null;
};

export type TemplateAiDomainSuggestion = {
  title: string;
  description: string;
  rationale: string;
  providerLabel?: string | null;
};

export type TemplateAiDomainSuggestions = {
  domains: TemplateAiDomainSuggestion[];
  notes: string[];
  providerLabel: string | null;
};

export type TemplateAiDomainQuestions = {
  questions: Array<{
    prompt: string;
    guidance: string;
    levels: Level[];
  }>;
  notes: string[];
  providerLabel: string | null;
};

export type TemplateAiFullDraft = {
  name: string;
  slug: string;
  description: string;
  category: string;
  scoringLabels: string[];
  domains: Array<{
    title: string;
    description: string;
    questions: Array<{
      prompt: string;
      guidance: string;
      levels: Level[];
    }>;
  }>;
  buildNotes: string[];
  providerLabel: string | null;
};

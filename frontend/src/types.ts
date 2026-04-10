export type Team = {
  id: string;
  name: string;
  description?: string;
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
  ownerName?: string | null;
  dueDate: string | null;
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
  ownerName?: string | null;
  dueDate: string | null;
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

export type DashboardSummary = {
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

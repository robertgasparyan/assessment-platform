import { generateAssessmentAiJson } from "./ai-client.js";

type AssistantActionOption = {
  id: string;
  label: string;
  description: string;
};

type AssistantItemOption = {
  id: string;
  title: string;
  subtitle: string;
  badge?: string;
};

type AssistantConversationTurn = {
  role: "user" | "assistant";
  content: string;
};

type AssistantPromptContext = {
  currentPath: string;
  user: {
    displayName: string;
    role: string;
  };
  summary: {
    activeAssessments: number;
    overdueAssessments: number;
    dueSoonAssessments: number;
    recentSubmissions: number;
    templates: number;
    reportsTeamCoverage: number;
    averageSubmittedScore: number | null;
    usersManaged?: number | null;
    teamsManaged?: number | null;
  };
  actions: AssistantActionOption[];
  items: AssistantItemOption[];
  conversationHistory: AssistantConversationTurn[];
};

type AssistantPromptOutput = {
  message: string;
  followUp?: string;
  actionIds?: string[];
  itemIds?: string[];
};

type AssistantDeterministicResponse = {
  message: string;
  followUp?: string;
  actionIds?: string[];
  itemIds?: string[];
};

function includesAny(value: string, phrases: string[]) {
  return phrases.some((phrase) => value.includes(phrase));
}

export function buildDeterministicAssistantResponse(input: {
  message: string;
  context: AssistantPromptContext;
}): AssistantDeterministicResponse | null {
  const normalized = input.message.trim().toLowerCase();
  const actionById = new Set(input.context.actions.map((action) => action.id));
  const itemsById = new Set(input.context.items.map((item) => item.id));
  const activeItems = input.context.items.filter((item) => item.id.startsWith("active:"));
  const submittedItems = input.context.items.filter((item) => item.id.startsWith("submitted:"));
  const templateItems = input.context.items.filter((item) => item.id.startsWith("template:"));

  if (includesAny(normalized, ["take me to reports", "open reports", "go to reports", "reports"])) {
    return {
      message: "Reports is the best place for current-state cross-team analysis and latest submitted comparisons.",
      actionIds: actionById.has("reports") ? ["reports"] : []
    };
  }

  if (includesAny(normalized, ["my assessments", "my work", "assigned runs"])) {
    return {
      message:
        input.context.summary.activeAssessments > 0
          ? `You currently have ${input.context.summary.activeAssessments} active visible assessment run${input.context.summary.activeAssessments === 1 ? "" : "s"}.`
          : "You do not have any active visible assessment runs right now.",
      followUp: "Open My Assessments if you want the full assigned and team-visible workspace.",
      actionIds: actionById.has("my-assessments") ? ["my-assessments"] : [],
      itemIds: activeItems.slice(0, 3).map((item) => item.id)
    };
  }

  if (includesAny(normalized, ["submitted assessments", "recent submissions", "what was submitted", "completed assessments"])) {
    return {
      message:
        submittedItems.length > 0
          ? `I found ${submittedItems.length} recent submitted assessment run${submittedItems.length === 1 ? "" : "s"} in your current visible context.`
          : "There are no recent submitted assessment runs in your current visible context yet.",
      actionIds: actionById.has("assessments-submitted") ? ["assessments-submitted"] : [],
      itemIds: submittedItems.slice(0, 5).map((item) => item.id)
    };
  }

  if (includesAny(normalized, ["active assessments", "active runs", "draft runs", "in progress"])) {
    return {
      message:
        activeItems.length > 0
          ? `There are ${input.context.summary.activeAssessments} active assessment run${input.context.summary.activeAssessments === 1 ? "" : "s"} visible to you, including ${input.context.summary.overdueAssessments} overdue and ${input.context.summary.dueSoonAssessments} due soon.`
          : "There are no active assessment runs visible to you right now.",
      actionIds: actionById.has("assessments-active") ? ["assessments-active"] : [],
      itemIds: activeItems.slice(0, 5).map((item) => item.id)
    };
  }

  if (includesAny(normalized, ["overdue", "due soon", "due date"])) {
    return {
      message:
        input.context.summary.activeAssessments > 0
          ? `${input.context.summary.overdueAssessments} active run${input.context.summary.overdueAssessments === 1 ? "" : "s"} are overdue and ${input.context.summary.dueSoonAssessments} are due soon in your visible workload.`
          : "There are no active visible runs with due-date pressure right now.",
      actionIds: actionById.has("assessments-active") ? ["assessments-active"] : [],
      itemIds: activeItems
        .filter((item) => item.badge?.includes("Overdue") || item.badge?.includes("Due soon"))
        .slice(0, 5)
        .map((item) => item.id)
    };
  }

  if (includesAny(normalized, ["templates", "template list", "what templates"])) {
    return {
      message:
        templateItems.length > 0
          ? `I found ${templateItems.length} recent template${templateItems.length === 1 ? "" : "s"} in your visible authoring workspace.`
          : "There are no templates available in your visible authoring workspace.",
      actionIds: actionById.has("templates") ? ["templates"] : [],
      itemIds: templateItems.slice(0, 5).map((item) => item.id)
    };
  }

  if (includesAny(normalized, ["teams", "manage teams"]) && actionById.has("teams")) {
    return {
      message:
        typeof input.context.summary.teamsManaged === "number"
          ? `There are ${input.context.summary.teamsManaged} team records in the administration workspace.`
          : "Open Teams to manage team records.",
      actionIds: ["teams"]
    };
  }

  if (includesAny(normalized, ["users", "user management", "accounts"]) && actionById.has("users")) {
    return {
      message:
        typeof input.context.summary.usersManaged === "number"
          ? `There are ${input.context.summary.usersManaged} user account${input.context.summary.usersManaged === 1 ? "" : "s"} in the administration workspace.`
          : "Open Users to manage accounts and roles.",
      actionIds: ["users"]
    };
  }

  if (includesAny(normalized, ["audit", "audit trail", "logs"]) && actionById.has("audit-trail")) {
    return {
      message: "Audit Trail is the right place to review governance and change history.",
      actionIds: ["audit-trail"]
    };
  }

  return null;
}

export async function generateAiAssistantResponse(input: {
  message: string;
  context: AssistantPromptContext;
}) {
  const output = await generateAssessmentAiJson<AssistantPromptOutput>(`You are Assessment AI Assistant for an assessment management platform.

Your job is to answer the user's question using only the provided platform context and recent conversation history.

Rules:
- Do not invent pages, routes, objects, counts, teams, templates, or assessment runs.
- If the request is outside the provided context or the user likely lacks access, say that clearly.
- Keep the response concise, practical, and operational.
- Prefer mentioning the most relevant items instead of dumping everything.
- Use the conversation history only to preserve continuity; do not invent facts from it.
- If the user appears to want navigation, choose from the provided action ids.
- If the user asks about concrete runs/templates/submitted items, choose from the provided item ids.
- If there are no matching active runs, submitted runs, or templates, say that directly instead of sounding uncertain.
- Choose at most 3 action ids and at most 5 item ids.
- Return only valid JSON with this shape:
{
  "message": string,
  "followUp": string,
  "actionIds": string[],
  "itemIds": string[]
}

User message:
${JSON.stringify(input.message)}

Platform context:
${JSON.stringify(input.context, null, 2)}`);

  return {
    message: output.message?.trim() || "I could not find a reliable answer from the current platform context.",
    followUp: output.followUp?.trim() || "",
    actionIds: Array.isArray(output.actionIds) ? output.actionIds.slice(0, 3) : [],
    itemIds: Array.isArray(output.itemIds) ? output.itemIds.slice(0, 5) : [],
    providerLabel: output.visibleProviderLabel
  };
}

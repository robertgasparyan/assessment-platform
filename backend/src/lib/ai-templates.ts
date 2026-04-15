import { generateAssessmentAiJson } from "./ai-client.js";

type QuestionAssistInput = {
  templateName: string;
  domainTitle: string;
  scoringLabels: string[];
  prompt: string;
  guidance: string;
  levels: Array<{
    value: number;
    label: string;
    description: string;
  }>;
};

type DomainAssistInput = {
  templateName: string;
  domainTitle: string;
  description: string;
  questionPrompts: string[];
};

type ConsistencyReviewInput = {
  templateName: string;
  templateDescription: string;
  category: string;
  scoringLabels: string[];
  domains: Array<{
    title: string;
    description: string;
    questions: Array<{
      prompt: string;
      guidance: string;
      levels: Array<{
        value: number;
        label: string;
        description: string;
      }>;
    }>;
  }>;
};

type TemplateScaffoldInput = {
  brief: string;
  category: string;
  scoringLabels: string[];
};

type DomainSuggestionsInput = {
  templateName: string;
  templateDescription: string;
  category: string;
  scoringLabels: string[];
  brief: string;
};

type SingleDomainSuggestionInput = {
  templateName: string;
  templateDescription: string;
  category: string;
  scoringLabels: string[];
  brief: string;
  existingDomainTitles: string[];
};

type DomainQuestionsInput = {
  templateName: string;
  templateDescription: string;
  scoringLabels: string[];
  domainTitle: string;
  domainDescription: string;
  brief: string;
};

type FullTemplateInput = {
  brief: string;
  category: string;
  scoringLabels: string[];
};

type SingleDomainQuestionInput = {
  templateName: string;
  templateDescription: string;
  scoringLabels: string[];
  domainTitle: string;
  domainDescription: string;
  brief: string;
  existingQuestionPrompts: string[];
};

type QuestionAssistOutput = {
  rewrittenPrompt: string;
  guidance: string;
  levels: Array<{
    value: number;
    label: string;
    description: string;
  }>;
  notes: string[];
};

type DomainAssistOutput = {
  suggestedTitle: string;
  rewrittenDescription: string;
  notes: string[];
};

type ConsistencyReviewOutput = {
  summary: string;
  strengths: string[];
  issues: string[];
  suggestions: string[];
};

type TemplateScaffoldOutput = {
  name: string;
  slug: string;
  description: string;
  category: string;
  scoringLabels: string[];
  buildNotes: string[];
};

type DomainSuggestionsOutput = {
  domains: Array<{
    title: string;
    description: string;
    rationale: string;
  }>;
  notes: string[];
};

type DomainQuestionsOutput = {
  questions: Array<{
    prompt: string;
    guidance: string;
    levels: Array<{
      value: number;
      label: string;
      description: string;
    }>;
  }>;
  notes: string[];
};

type FullTemplateOutput = {
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
      levels: Array<{
        value: number;
        label: string;
        description: string;
      }>;
    }>;
  }>;
  buildNotes: string[];
};

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function generateTemplateScaffold(input: TemplateScaffoldInput) {
  const output = await generateAssessmentAiJson<TemplateScaffoldOutput>(`You are helping an assessment author create a template scaffold from a short brief.

Return only valid JSON with this exact shape:
{
  "name": "string",
  "slug": "string",
  "description": "string",
  "category": "string",
  "scoringLabels": ["string", "string", "string"],
  "buildNotes": ["string", "string", "string"]
}

Rules:
- Create a realistic template name and concise description.
- Keep the scoring labels exactly aligned to the intended maturity progression.
- If category is provided, prefer it unless the brief strongly contradicts it.
- Slug must be URL-friendly lowercase kebab-case.
- Do not create domains yet.
- Build notes should help the author decide how to continue.

Input:
- brief: ${input.brief}
- preferred category: ${input.category || "none"}
- scoring labels: ${input.scoringLabels.join(", ")}`);

  return {
    name: output.name,
    slug: output.slug || slugify(output.name),
    description: output.description,
    category: output.category || input.category,
    scoringLabels: output.scoringLabels?.length ? output.scoringLabels : input.scoringLabels,
    buildNotes: output.buildNotes ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateTemplateDomains(input: DomainSuggestionsInput) {
  const output = await generateAssessmentAiJson<DomainSuggestionsOutput>(`You are helping an assessment author propose domain structure for a template.

Return only valid JSON with this exact shape:
{
  "domains": [
    {
      "title": "string",
      "description": "string",
      "rationale": "string"
    }
  ],
  "notes": ["string", "string", "string"]
}

Rules:
- Return 4 to 7 candidate domains.
- Domains should be distinct, non-overlapping, and suitable for reporting.
- Descriptions should explain what each domain measures.
- Rationale should explain why the domain belongs in this template.
- Do not generate questions yet.

Template context:
- name: ${input.templateName}
- description: ${input.templateDescription}
- category: ${input.category || "none"}
- scoring labels: ${input.scoringLabels.join(", ")}
- brief: ${input.brief}`);

  return {
    domains: output.domains ?? [],
    notes: output.notes ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateSingleTemplateDomain(input: SingleDomainSuggestionInput) {
  const output = await generateAssessmentAiJson<{
    title: string;
    description: string;
    rationale: string;
  }>(`You are helping an assessment author replace or add one domain in a template draft.

Return only valid JSON with this exact shape:
{
  "title": "string",
  "description": "string",
  "rationale": "string"
}

Rules:
- Generate exactly one domain.
- The domain should be distinct from existing domains.
- The title must be suitable for reporting.
- The description should explain what the domain measures.
- The rationale should explain why this domain belongs in the template.

Template context:
- name: ${input.templateName}
- description: ${input.templateDescription}
- category: ${input.category || "none"}
- scoring labels: ${input.scoringLabels.join(", ")}
- brief: ${input.brief}
- existing domains to avoid duplicating: ${input.existingDomainTitles.join(", ") || "none"}`);

  return {
    title: output.title,
    description: output.description,
    rationale: output.rationale,
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateSingleDomainQuestion(input: SingleDomainQuestionInput) {
  const output = await generateAssessmentAiJson<{
    prompt: string;
    guidance: string;
    levels: Array<{
      value: number;
      label: string;
      description: string;
    }>;
  }>(`You are helping an assessment author replace or add one question in a maturity assessment domain.

Return only valid JSON with this exact shape:
{
  "prompt": "string",
  "guidance": "string",
  "levels": [{"value": 1, "label": "string", "description": "string"}]
}

Rules:
- Generate exactly one question.
- The question should fit the provided domain and avoid overlap with existing questions.
- Guidance should help respondents answer consistently.
- Keep the same number of maturity levels and the same level labels.
- Level descriptions should show clear progression from weak to strong maturity.

Template context:
- name: ${input.templateName}
- description: ${input.templateDescription}
- brief: ${input.brief}
- domain: ${input.domainTitle}
- domain description: ${input.domainDescription}
- scoring labels: ${input.scoringLabels.join(", ")}
- existing questions to avoid duplicating: ${input.existingQuestionPrompts.join(" | ") || "none"}`);

  return {
    prompt: output.prompt,
    guidance: output.guidance,
    levels: output.levels ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateDomainQuestions(input: DomainQuestionsInput) {
  const output = await generateAssessmentAiJson<DomainQuestionsOutput>(`You are helping an assessment author generate questions for one domain in a maturity assessment.

Return only valid JSON with this exact shape:
{
  "questions": [
    {
      "prompt": "string",
      "guidance": "string",
      "levels": [{"value": 1, "label": "string", "description": "string"}]
    }
  ],
  "notes": ["string", "string", "string"]
}

Rules:
- Generate 4 to 7 questions.
- Questions should fit the provided domain and avoid overlap.
- Guidance should help respondents answer consistently.
- Keep the same number of maturity levels and the same level labels.
- Level descriptions should show clear progression from weak to strong maturity.
- Questions should be suitable for later reporting and comparison.

Template context:
- name: ${input.templateName}
- description: ${input.templateDescription}
- brief: ${input.brief}
- domain: ${input.domainTitle}
- domain description: ${input.domainDescription}
- scoring labels: ${input.scoringLabels.join(", ")}`);

  return {
    questions: output.questions ?? [],
    notes: output.notes ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateFullTemplateDraft(input: FullTemplateInput) {
  const output = await generateAssessmentAiJson<FullTemplateOutput>(`You are generating a first-pass assessment template draft from one brief.

Return only valid JSON with this exact shape:
{
  "name": "string",
  "slug": "string",
  "description": "string",
  "category": "string",
  "scoringLabels": ["string", "string", "string"],
  "domains": [
    {
      "title": "string",
      "description": "string",
      "questions": [
        {
          "prompt": "string",
          "guidance": "string",
          "levels": [{"value": 1, "label": "string", "description": "string"}]
        }
      ]
    }
  ],
  "buildNotes": ["string", "string", "string"]
}

Rules:
- Generate a realistic draft suitable for manual refinement by a human author.
- Return 4 to 7 domains.
- Each domain should have 4 to 7 questions.
- Questions must be distinct, domain-appropriate, and suitable for reporting.
- Keep the same number of maturity levels and the same level labels.
- Level descriptions should show clear progression.
- Do not invent publishing claims, governance workflows, or fake metadata.
- Build notes should explain what the author should review next.

Input:
- brief: ${input.brief}
- preferred category: ${input.category || "none"}
- scoring labels: ${input.scoringLabels.join(", ")}`);

  return {
    name: output.name,
    slug: output.slug || slugify(output.name),
    description: output.description,
    category: output.category || input.category,
    scoringLabels: output.scoringLabels?.length ? output.scoringLabels : input.scoringLabels,
    domains: output.domains ?? [],
    buildNotes: output.buildNotes ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateQuestionAssist(input: QuestionAssistInput) {
  const output = await generateAssessmentAiJson<QuestionAssistOutput>(`You are assisting an assessment template author.

Return only valid JSON with this exact shape:
{
  "rewrittenPrompt": "string",
  "guidance": "string",
  "levels": [{"value": 1, "label": "string", "description": "string"}],
  "notes": ["string", "string", "string"]
}

Rules:
- Improve wording without changing the underlying intent.
- Guidance should help respondents answer consistently.
- Keep the same number of maturity levels and the same level labels.
- Level descriptions should become clearer, progressively stronger, and non-overlapping.
- Do not invent scoring systems beyond the provided labels.
- Keep notes short and practical for the template author.

Context:
- template: ${input.templateName || "Untitled template"}
- domain: ${input.domainTitle || "Untitled domain"}
- scoring labels: ${input.scoringLabels.join(", ")}
- current prompt: ${input.prompt || "none"}
- current guidance: ${input.guidance || "none"}

Current levels:
${input.levels.map((level) => `- ${level.label} (${level.value}): ${level.description || "none"}`).join("\n")}`);

  return {
    rewrittenPrompt: output.rewrittenPrompt,
    guidance: output.guidance,
    levels: output.levels ?? [],
    notes: output.notes ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateDomainAssist(input: DomainAssistInput) {
  const output = await generateAssessmentAiJson<DomainAssistOutput>(`You are assisting an assessment template author.

Return only valid JSON with this exact shape:
{
  "suggestedTitle": "string",
  "rewrittenDescription": "string",
  "notes": ["string", "string", "string"]
}

Rules:
- Improve clarity and framing without changing the domain's intended scope.
- The description should explain what the domain measures and what good evidence looks like.
- Keep the title concise and suitable for reports.
- Notes should help the author decide whether to apply the suggestion.

Context:
- template: ${input.templateName || "Untitled template"}
- current domain title: ${input.domainTitle || "none"}
- current description: ${input.description || "none"}

Questions in this domain:
${input.questionPrompts.slice(0, 12).map((prompt) => `- ${prompt}`).join("\n") || "- none"}`);

  return {
    suggestedTitle: output.suggestedTitle,
    rewrittenDescription: output.rewrittenDescription,
    notes: output.notes ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

export async function generateTemplateConsistencyReview(input: ConsistencyReviewInput) {
  const domainBlock = input.domains
    .slice(0, 12)
    .map(
      (domain) => `Domain: ${domain.title || "Untitled"}
Description: ${domain.description || "none"}
Questions:
${domain.questions
  .slice(0, 8)
  .map(
    (question) => `- ${question.prompt || "Untitled"} | guidance: ${question.guidance || "none"} | levels: ${question.levels
      .map((level) => `${level.label}: ${level.description || "none"}`)
      .join(" ; ")}`
  )
  .join("\n")}`
    )
    .join("\n\n");

  const output = await generateAssessmentAiJson<ConsistencyReviewOutput>(`You are reviewing an assessment template draft for consistency and authoring quality.

Return only valid JSON with this exact shape:
{
  "summary": "string",
  "strengths": ["string", "string", "string"],
  "issues": ["string", "string", "string"],
  "suggestions": ["string", "string", "string"]
}

Rules:
- Review only the provided draft.
- Focus on structure, clarity, level progression, overlap, and wording consistency.
- Do not invent governance workflows or publishing steps.
- Keep suggestions practical and manual-review oriented.

Template context:
- name: ${input.templateName || "Untitled template"}
- description: ${input.templateDescription || "none"}
- category: ${input.category || "none"}
- scoring labels: ${input.scoringLabels.join(", ")}

Draft structure:
${domainBlock || "- none"}`);

  return {
    summary: output.summary,
    strengths: output.strengths ?? [],
    issues: output.issues ?? [],
    suggestions: output.suggestions ?? [],
    providerLabel: output.visibleProviderLabel
  };
}

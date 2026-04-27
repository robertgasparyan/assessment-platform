import { AssessmentParticipantStatus } from "@prisma/client";
import { generateAssessmentAiJson } from "./ai-client.js";

type AggregationInsightInput = {
  title: string;
  teamName: string;
  periodLabel: string;
  requiredSubmissions: number;
  participants: Array<{
    displayName: string;
    status: string;
    responseCount: number;
  }>;
  questions: Array<{
    domainTitle: string;
    prompt: string;
    responses: Array<{
      participantName: string;
      selectedValue: number;
      selectedLabel: string;
      comment: string | null;
    }>;
  }>;
};

type AggregationInsightOutput = {
  summary: string;
  disagreementLevel: "low" | "medium" | "high";
  highVarianceQuestions: Array<{
    domainTitle: string;
    prompt: string;
    reason: string;
  }>;
  commentThemes: string[];
  facilitatorQuestions: string[];
  aggregationReadiness: string;
};

function scoreStats(values: number[]) {
  if (!values.length) {
    return { min: 0, max: 0, spread: 0, average: 0 };
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return { min, max, spread: max - min, average };
}

export async function generateAggregationInsight(input: AggregationInsightInput) {
  const submittedParticipants = input.participants.filter((participant) => participant.status === AssessmentParticipantStatus.SUBMITTED);
  const questionSignals = input.questions
    .filter((question) => question.responses.length > 0)
    .map((question) => {
      const stats = scoreStats(question.responses.map((response) => response.selectedValue));
      const comments = question.responses
        .filter((response) => response.comment?.trim())
        .map((response) => `${response.participantName}: ${response.comment?.trim()}`)
        .join(" | ");
      return `- ${question.domainTitle}: ${question.prompt} | responses ${question.responses.length} | avg ${stats.average.toFixed(2)} | spread ${stats.spread} | min ${stats.min} | max ${stats.max} | comments: ${comments || "none"}`;
    })
    .join("\n");

  const output = await generateAssessmentAiJson<AggregationInsightOutput>(`You are helping a manager review individual participant assessment responses before aggregation.

Return only valid JSON with this exact shape:
{
  "summary": "string",
  "disagreementLevel": "low" | "medium" | "high",
  "highVarianceQuestions": [{"domainTitle": "string", "prompt": "string", "reason": "string"}],
  "commentThemes": ["string", "string", "string"],
  "facilitatorQuestions": ["string", "string", "string"],
  "aggregationReadiness": "string"
}

Rules:
- Use only the participant response data provided.
- Focus on disagreement, variance, comment themes, and review questions before aggregation.
- Do not invent participant names, owners, or action records.
- Keep facilitator questions practical and suitable for a team lead.
- If there is not enough submitted data, say aggregation insight is limited.

Run context:
- title: ${input.title}
- team: ${input.teamName}
- period: ${input.periodLabel}
- submitted participants: ${submittedParticipants.length}/${input.participants.length}
- required submissions: ${input.requiredSubmissions}

Participants:
${input.participants.map((participant) => `- ${participant.displayName}: ${participant.status}, ${participant.responseCount} responses`).join("\n")}

Question response signals:
${questionSignals || "- none"}`);

  return {
    summary: output.summary,
    disagreementLevel: output.disagreementLevel ?? "medium",
    highVarianceQuestions: output.highVarianceQuestions ?? [],
    commentThemes: output.commentThemes ?? [],
    facilitatorQuestions: output.facilitatorQuestions ?? [],
    aggregationReadiness: output.aggregationReadiness,
    providerLabel: output.visibleProviderLabel
  };
}

import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentRunDetail } from "@/types";

type ResponseState = Record<string, { selectedValue: number; selectedLabel: string; comment?: string }>;

export function AssessmentMatrix({
  run,
  responses,
  onSelect,
  onCommentChange,
  readOnly = false
}: {
  run: AssessmentRunDetail;
  responses: ResponseState;
  onSelect: (questionId: string, value: number, label: string) => void;
  onCommentChange: (questionId: string, comment: string) => void;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-6">
      {run.domains.map((domain) => {
        const completionPercent = domain.totalQuestions ? Math.round((domain.answeredQuestions / domain.totalQuestions) * 100) : 0;

        return (
        <Card key={domain.id}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{domain.title}</CardTitle>
                <CardDescription>
                  {domain.description || (readOnly ? "Submitted responses are read-only." : "Answer each question collaboratively and save as draft.")}
                </CardDescription>
              </div>
              <Badge variant="secondary">
                {domain.answeredQuestions}/{domain.totalQuestions} answered
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                <span>Domain completion</span>
                <span>{completionPercent}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${completionPercent}%` }} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {domain.questions.map((question) => (
              <div className="space-y-4 rounded-[1.25rem] border bg-muted/20 p-4" id={`question-${question.id}`} key={question.id}>
                <div className="space-y-1">
                  <div className="text-lg font-semibold">{question.prompt}</div>
                  {question.guidance ? <p className="text-sm text-muted-foreground">{question.guidance}</p> : null}
                </div>
                <div className="grid gap-3 xl:grid-cols-5">
                  {question.levels.map((level) => {
                    const selected = responses[question.id]?.selectedValue === level.value;
                    return (
                      <Button
                        className="h-auto min-h-28 flex-col items-start justify-between whitespace-normal rounded-[1.25rem] p-4 text-left"
                        disabled={readOnly}
                        key={level.value}
                        onClick={() => onSelect(question.id, level.value, level.label)}
                        type="button"
                        variant={selected ? "default" : "outline"}
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="text-sm font-semibold">
                            {level.label} ({level.value})
                          </span>
                          {selected ? <Check className="h-4 w-4" /> : null}
                        </div>
                        <span className="mt-3 text-sm opacity-90">{level.description}</span>
                      </Button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">Notes</div>
                  <Textarea
                    disabled={readOnly}
                    placeholder="Add context for why this level was selected"
                    value={responses[question.id]?.comment ?? ""}
                    onChange={(event) => onCommentChange(question.id, event.target.value)}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )})}
    </div>
  );
}

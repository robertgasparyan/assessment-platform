import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateDomain } from "@/types";

const createLevels = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    value: index + 1,
    label: ["Initial", "Developing", "Intermediate", "Advanced", "Optimized"][index] ?? `Level ${index + 1}`,
    description: ""
  }));

export function createDefaultTemplate() {
  return {
    name: "",
    slug: "",
    description: "",
    category: "",
    scoringLabels: ["Initial", "Developing", "Intermediate", "Advanced", "Optimized"],
    domains: [
      {
        title: "Business Requirements",
        description: "",
        questions: [
          {
            prompt: "",
            guidance: "",
            levels: createLevels(5)
          }
        ]
      }
    ] as TemplateDomain[]
  };
}

type BuilderState = ReturnType<typeof createDefaultTemplate>;

export function TemplateBuilder({
  value,
  onChange,
  onSubmit,
  submitting
}: {
  value: BuilderState;
  onChange: (value: BuilderState) => void;
  onSubmit: () => void;
  submitting?: boolean;
}) {
  const update = (next: Partial<BuilderState>) => onChange({ ...value, ...next });

  const updateDomain = (domainIndex: number, next: TemplateDomain) => {
    const domains = [...value.domains];
    domains[domainIndex] = next;
    update({ domains });
  };

  const [levelCount, setLevelCount] = useState(5);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Template</CardTitle>
          <CardDescription>Define the template metadata, maturity labels, and question structure.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={value.name} onChange={(event) => update({ name: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={value.slug} onChange={(event) => update({ slug: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Input value={value.category} onChange={(event) => update({ category: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Default level count</Label>
            <Input
              max={7}
              min={2}
              type="number"
              value={levelCount}
              onChange={(event) => setLevelCount(Number(event.target.value))}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={value.description} onChange={(event) => update({ description: event.target.value })} />
          </div>
        </CardContent>
      </Card>

      {value.domains.map((domain, domainIndex) => (
        <Card key={`domain-${domainIndex}`}>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Domain {domainIndex + 1}</CardTitle>
              <CardDescription>Each domain can contain one or more maturity questions.</CardDescription>
            </div>
            <Button
              onClick={() => update({ domains: value.domains.filter((_, index) => index !== domainIndex) })}
              type="button"
              variant="ghost"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Remove domain
            </Button>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Domain title</Label>
                <Input
                  value={domain.title}
                  onChange={(event) => updateDomain(domainIndex, { ...domain, title: event.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Domain description</Label>
                <Input
                  value={domain.description}
                  onChange={(event) => updateDomain(domainIndex, { ...domain, description: event.target.value })}
                />
              </div>
            </div>

            {domain.questions.map((question, questionIndex) => (
              <div className="rounded-[1.25rem] border bg-muted/30 p-4" key={`question-${questionIndex}`}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-semibold">Question {questionIndex + 1}</div>
                  <Button
                    onClick={() =>
                      updateDomain(domainIndex, {
                        ...domain,
                        questions: domain.questions.filter((_, index) => index !== questionIndex)
                      })
                    }
                    type="button"
                    variant="ghost"
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove question
                  </Button>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Question prompt</Label>
                    <Textarea
                      value={question.prompt}
                      onChange={(event) => {
                        const questions = [...domain.questions];
                        questions[questionIndex] = { ...question, prompt: event.target.value };
                        updateDomain(domainIndex, { ...domain, questions });
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Guidance</Label>
                    <Textarea
                      value={question.guidance}
                      onChange={(event) => {
                        const questions = [...domain.questions];
                        questions[questionIndex] = { ...question, guidance: event.target.value };
                        updateDomain(domainIndex, { ...domain, questions });
                      }}
                    />
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {question.levels.map((level, levelIndex) => (
                      <div className="rounded-xl border bg-white p-3" key={`level-${levelIndex}`}>
                        <Label>Level {level.value}</Label>
                        <Input
                          className="mt-2"
                          value={level.label}
                          onChange={(event) => {
                            const questions = [...domain.questions];
                            const levels = [...question.levels];
                            levels[levelIndex] = { ...level, label: event.target.value };
                            questions[questionIndex] = { ...question, levels };
                            updateDomain(domainIndex, { ...domain, questions });
                          }}
                        />
                        <Textarea
                          className="mt-2"
                          value={level.description}
                          onChange={(event) => {
                            const questions = [...domain.questions];
                            const levels = [...question.levels];
                            levels[levelIndex] = { ...level, description: event.target.value };
                            questions[questionIndex] = { ...question, levels };
                            updateDomain(domainIndex, { ...domain, questions });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() =>
                  updateDomain(domainIndex, {
                    ...domain,
                    questions: [...domain.questions, { prompt: "", guidance: "", levels: createLevels(levelCount) }]
                  })
                }
                type="button"
                variant="secondary"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add question
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() =>
            update({
              domains: [...value.domains, { title: "", description: "", questions: [{ prompt: "", guidance: "", levels: createLevels(levelCount) }] }]
            })
          }
          type="button"
          variant="secondary"
        >
          <Plus className="mr-2 h-4 w-4" />
          Add domain
        </Button>
        <Button onClick={onSubmit} type="button" disabled={submitting}>
          Save template version
        </Button>
      </div>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, LoaderCircle, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import { createClientId } from "@/lib/create-id";
import type {
  Category,
  TemplateAiDomainQuestions,
  TemplateAiDomainSuggestions,
  TemplateAiFullDraft,
  TemplateAiScaffold
} from "@/types";
import type { TemplateAuthoringDraft } from "./template-authoring-studio";

type BuilderDomain = {
  id: string;
  title: string;
  description: string;
  rationale: string;
  kept: boolean;
  providerLabel: string | null;
  questions: Array<{
    id: string;
    prompt: string;
    guidance: string;
    levels: Array<{
      value: number;
      label: string;
      description: string;
    }>;
  }>;
};

function createId(prefix: string) {
  return createClientId(prefix);
}

export function AiTemplateBuilder({
  categories,
  onContinueToAuthoring,
  onSaveGeneratedDraft
}: {
  categories: Category[];
  onContinueToAuthoring: (draft: TemplateAuthoringDraft) => void;
  onSaveGeneratedDraft: (draft: TemplateAuthoringDraft) => Promise<void> | void;
}) {
  const [brief, setBrief] = useState("");
  const [category, setCategory] = useState("");
  const [scoringLabels, setScoringLabels] = useState(["Initial", "Developing", "Intermediate", "Advanced", "Optimized"]);
  const [builderDraft, setBuilderDraft] = useState<TemplateAuthoringDraft | null>(null);
  const [builderDomains, setBuilderDomains] = useState<BuilderDomain[]>([]);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Select category" }, ...categories.map((item) => ({ value: item.name, label: item.name }))],
    [categories]
  );

  const selectedDomain = builderDomains.find((domain) => domain.id === selectedDomainId) ?? null;

  const scaffoldMutation = useMutation({
    mutationFn: () =>
      api.post<TemplateAiScaffold>("/templates/ai/scaffold", {
        brief,
        category,
        scoringLabels
      }),
    onSuccess: (data) => {
      setBuilderDraft({
        name: data.name,
        slug: data.slug,
        description: data.description,
        category: data.category,
        scoringLabels: data.scoringLabels,
        domains: []
      });
      setBuilderDomains([]);
      setSelectedDomainId(null);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const domainSuggestionsMutation = useMutation({
    mutationFn: () =>
      api.post<TemplateAiDomainSuggestions>("/templates/ai/domain-suggestions", {
        templateName: builderDraft?.name ?? "",
        templateDescription: builderDraft?.description ?? "",
        category: builderDraft?.category ?? category,
        scoringLabels: builderDraft?.scoringLabels ?? scoringLabels,
        brief
      }),
    onSuccess: (data) => {
      const domains = data.domains.map((domain) => ({
        id: createId("ai-domain"),
        title: domain.title,
        description: domain.description,
        rationale: domain.rationale,
        kept: true,
        providerLabel: data.providerLabel,
        questions: []
      }));
      setBuilderDomains(domains);
      setSelectedDomainId(domains[0]?.id ?? null);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const domainQuestionsMutation = useMutation({
    mutationFn: (domainId: string) => {
      const domain = builderDomains.find((item) => item.id === domainId);
      if (!domain || !builderDraft) {
        throw new Error("Generate a scaffold and select a domain first");
      }

      return api.post<TemplateAiDomainQuestions>("/templates/ai/domain-questions", {
        templateName: builderDraft.name,
        templateDescription: builderDraft.description,
        scoringLabels: builderDraft.scoringLabels,
        domainTitle: domain.title,
        domainDescription: domain.description,
        brief
      });
    },
    onSuccess: (data, domainId) => {
      setBuilderDomains((current) =>
        current.map((domain) =>
          domain.id === domainId
            ? {
                ...domain,
                kept: domain.kept,
                providerLabel: domain.providerLabel,
                questions: data.questions.map((question) => ({
                  id: createId("ai-question"),
                  prompt: question.prompt,
                  guidance: question.guidance,
                  levels: question.levels.map((level) => ({ ...level }))
                }))
              }
            : domain
        )
      );
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const singleDomainMutation = useMutation({
    mutationFn: (domainId: string) =>
      api.post<{ title: string; description: string; rationale: string; providerLabel: string | null }>("/templates/ai/single-domain", {
        templateName: builderDraft?.name ?? "",
        templateDescription: builderDraft?.description ?? "",
        category: builderDraft?.category ?? category,
        scoringLabels: builderDraft?.scoringLabels ?? scoringLabels,
        brief,
        existingDomainTitles: builderDomains.filter((item) => item.id !== domainId).map((item) => item.title)
      }),
    onSuccess: (data, domainId) => {
      setBuilderDomains((current) =>
        current.map((domain) =>
          domain.id === domainId
            ? {
                ...domain,
                title: data.title,
                description: data.description,
                rationale: data.rationale,
                providerLabel: data.providerLabel,
                questions: []
              }
            : domain
        )
      );
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const fullDraftMutation = useMutation({
    mutationFn: () =>
      api.post<TemplateAiFullDraft>("/templates/ai/full-draft", {
        brief,
        category,
        scoringLabels
      }),
    onSuccess: (data) => {
      const nextDomains = data.domains.map((domain) => ({
        id: createId("ai-domain"),
        title: domain.title,
        description: domain.description,
        rationale: "Generated in one-shot draft mode.",
        kept: true,
        providerLabel: data.providerLabel,
        questions: domain.questions.map((question) => ({
          id: createId("ai-question"),
          prompt: question.prompt,
          guidance: question.guidance,
          levels: question.levels.map((level) => ({ ...level }))
        }))
      }));

      const nextDraft: TemplateAuthoringDraft = {
        name: data.name,
        slug: data.slug,
        description: data.description,
        category: data.category,
        scoringLabels: data.scoringLabels,
        domains: nextDomains.map((domain) => ({
          id: domain.id,
          title: domain.title,
          description: domain.description,
          questions: domain.questions.map((question) => ({
            id: question.id,
            prompt: question.prompt,
            guidance: question.guidance,
            levels: question.levels.map((level) => ({ ...level }))
          }))
        }))
      };

      setBuilderDraft(nextDraft);
      setBuilderDomains(nextDomains);
      setSelectedDomainId(nextDomains[0]?.id ?? null);
      onContinueToAuthoring(nextDraft);
      toast.success("Full AI draft sent to authoring studio");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const singleQuestionMutation = useMutation({
    mutationFn: ({ domainId, questionId }: { domainId: string; questionId: string }) => {
      const domain = builderDomains.find((item) => item.id === domainId);
      if (!domain || !builderDraft) {
        throw new Error("Generate a draft and select a domain first");
      }

      return api.post<{ prompt: string; guidance: string; levels: Array<{ value: number; label: string; description: string }>; providerLabel: string | null }>(
        "/templates/ai/single-question",
        {
          templateName: builderDraft.name,
          templateDescription: builderDraft.description,
          scoringLabels: builderDraft.scoringLabels,
          domainTitle: domain.title,
          domainDescription: domain.description,
          brief,
          existingQuestionPrompts: domain.questions.filter((item) => item.id !== questionId).map((item) => item.prompt)
        }
      );
    },
    onSuccess: (data, variables) => {
      setBuilderDomains((current) =>
        current.map((domain) =>
          domain.id === variables.domainId
            ? {
                ...domain,
                providerLabel: data.providerLabel,
                questions: domain.questions.map((question) =>
                  question.id === variables.questionId
                    ? {
                        ...question,
                        prompt: data.prompt,
                        guidance: data.guidance,
                        levels: data.levels.map((level) => ({ ...level }))
                      }
                    : question
                )
              }
            : domain
        )
      );
    },
    onError: (error: Error) => toast.error(error.message)
  });

  function updateScoreLabel(index: number, value: string) {
    setScoringLabels((current) => current.map((label, labelIndex) => (labelIndex === index ? value : label)));
  }

  function continueToAuthoring() {
    if (!builderDraft) {
      toast.error("Generate a scaffold first");
      return;
    }

    const keptDomains = builderDomains.filter((domain) => domain.kept);
    if (!keptDomains.length) {
      toast.error("Keep at least one generated domain before continuing");
      return;
    }

    onContinueToAuthoring({
      ...builderDraft,
      domains: keptDomains.map((domain) => ({
        id: domain.id,
        title: domain.title,
        description: domain.description,
        questions: domain.questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          guidance: question.guidance,
          levels: question.levels.map((level) => ({ ...level }))
        }))
      }))
    });
  }

  function buildDraftFromBuilder(): TemplateAuthoringDraft | null {
    if (!builderDraft) {
      return null;
    }

    const keptDomains = builderDomains.filter((domain) => domain.kept);
    if (!keptDomains.length) {
      return null;
    }

    return {
      ...builderDraft,
      domains: keptDomains.map((domain) => ({
        id: domain.id,
        title: domain.title,
        description: domain.description,
        questions: domain.questions.map((question) => ({
          id: question.id,
          prompt: question.prompt,
          guidance: question.guidance,
          levels: question.levels.map((level) => ({ ...level }))
        }))
      }))
    };
  }

  return (
    <div className="space-y-6">
      {fullDraftMutation.isPending ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-[1.5rem] border border-primary/20 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <LoaderCircle className="h-6 w-6 animate-spin" />
              </div>
              <div>
                <div className="text-lg font-semibold text-foreground">Generating full AI draft</div>
                <div className="text-sm text-muted-foreground">This can take a bit longer than the guided builder flow.</div>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <div className="rounded-xl bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                Building template scaffold, domains, questions, and maturity descriptions.
              </div>
              <div className="rounded-xl bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
                When generation finishes, the draft will open in the normal authoring studio for review.
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Card className="border-border bg-white/90">
        <CardHeader>
          <CardTitle>AI Template Builder</CardTitle>
          <CardDescription>
            Generate a scaffold, propose domains, generate domain questions, and then hand the draft into the normal authoring studio for refinement.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded-[1.15rem] border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            AI-generated drafts are starting points only. Review wording, scope, and maturity progression before publishing.
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Template brief</Label>
              <Textarea
                className="min-h-[128px]"
                placeholder="Describe the kind of assessment you want to build, who will answer it, and what themes it should cover."
                value={brief}
                onChange={(event) => setBrief(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Preferred category</Label>
              <Select options={categoryOptions} value={category} onChange={(event) => setCategory(event.target.value)} />
            </div>
            <div className="rounded-[1.25rem] border bg-muted/20 p-4">
              <div className="text-sm font-medium text-foreground">Builder flow</div>
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">1. Scaffold</Badge>
                <Badge variant="secondary">2. Domains</Badge>
                <Badge variant="secondary">3. Questions</Badge>
                <Badge variant="secondary">4. Refine in authoring</Badge>
                {scaffoldMutation.data?.providerLabel ? <Badge variant="outline">{scaffoldMutation.data.providerLabel}</Badge> : null}
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium text-foreground">Maturity labels</div>
            <div className="rounded-[1rem] border border-border/70 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              AI Builder starts with a standard 5-level maturity scale. After generation, you can still edit the labels and descriptions in the authoring studio.
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {scoringLabels.map((label, index) => (
                <div className="rounded-[1.1rem] border bg-white p-3" key={`builder-score-${index}`}>
                  <Label>Level {index + 1}</Label>
                  <Input className="mt-2" value={label} onChange={(event) => updateScoreLabel(index, event.target.value)} />
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr,0.9fr]">
            <div className="rounded-[1.4rem] border border-border bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-foreground">Guided builder</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Start with a scaffold only, then generate domains and question sets step by step before refining in authoring.
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">Scaffold only first</Badge>
                <Badge variant="outline">You stay in control</Badge>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button disabled={brief.trim().length < 10 || scaffoldMutation.isPending} onClick={() => scaffoldMutation.mutate()} type="button">
                  <Sparkles className="mr-2 h-4 w-4" />
                  {scaffoldMutation.isPending ? "Generating scaffold..." : "Generate scaffold"}
                </Button>
                {builderDraft ? (
                  <Button disabled={domainSuggestionsMutation.isPending} onClick={() => domainSuggestionsMutation.mutate()} type="button" variant="outline">
                    <Wand2 className="mr-2 h-4 w-4" />
                    {domainSuggestionsMutation.isPending ? "Generating domains..." : "Generate domains"}
                  </Button>
                ) : null}
                {builderDraft ? (
                  <Button onClick={continueToAuthoring} type="button" variant="secondary">
                    Continue in authoring studio
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                ) : null}
                {builderDraft ? (
                  <Button
                    onClick={async () => {
                      const draft = buildDraftFromBuilder();
                      if (!draft) {
                        toast.error("Keep at least one generated domain before saving");
                        return;
                      }
                      await onSaveGeneratedDraft(draft);
                    }}
                    type="button"
                    variant="outline"
                  >
                    Save generated draft
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="rounded-[1.4rem] border border-primary/25 bg-gradient-to-br from-primary/10 via-white to-[#EEF8E8] p-4 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-primary p-3 text-primary-foreground shadow-sm">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-base font-semibold text-foreground">Full AI-generated template</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    One click generates the scaffold, domains, questions, and maturity descriptions as a complete starting draft.
                  </div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">Complete first draft</Badge>
                <Badge variant="outline">Best for fast starting point</Badge>
              </div>
              <div className="mt-4 rounded-xl border border-primary/15 bg-white/80 px-3 py-2 text-sm text-muted-foreground">
                After generation, the draft opens in the normal authoring studio so the user can review and refine it before publishing.
              </div>
              <div className="mt-4">
                <Button
                  className="w-full"
                  disabled={brief.trim().length < 10 || fullDraftMutation.isPending}
                  onClick={() => fullDraftMutation.mutate()}
                  type="button"
                >
                  <Wand2 className="mr-2 h-4 w-4" />
                  {fullDraftMutation.isPending ? "Generating full draft..." : "One-shot full draft"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {builderDraft ? (
        <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
          <Card className="border-border bg-white/90">
            <CardHeader>
              <CardTitle>Generated scaffold</CardTitle>
              <CardDescription>Editable template identity before you move it into authoring.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={builderDraft.name} onChange={(event) => setBuilderDraft((current) => current ? { ...current, name: event.target.value } : current)} />
                </div>
                <div className="space-y-2">
                  <Label>Slug</Label>
                  <Input value={builderDraft.slug} onChange={(event) => setBuilderDraft((current) => current ? { ...current, slug: event.target.value } : current)} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Description</Label>
                  <Textarea value={builderDraft.description} onChange={(event) => setBuilderDraft((current) => current ? { ...current, description: event.target.value } : current)} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{builderDraft.category || "No category"}</Badge>
                <Badge variant="secondary">{builderDomains.length} generated domains</Badge>
                {scaffoldMutation.data?.providerLabel ? <Badge variant="outline">{scaffoldMutation.data.providerLabel}</Badge> : null}
              </div>
              {scaffoldMutation.data?.buildNotes?.length ? (
                <div className="space-y-2">
                  {scaffoldMutation.data.buildNotes.map((note, index) => (
                    <div className="rounded-xl bg-muted/20 px-3 py-2 text-sm text-muted-foreground" key={`scaffold-note-${index}`}>
                      {note}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card className="border-border bg-white/90">
            <CardHeader>
              <CardTitle>Generated domains</CardTitle>
              <CardDescription>Generate domains first, then generate questions for each domain you want to keep.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!builderDomains.length ? (
                <div className="rounded-[1.25rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
                  Generate domains after the scaffold to continue the guided builder flow.
                </div>
              ) : (
                builderDomains.map((domain) => (
                  <div
                    className={`rounded-[1.25rem] border p-4 ${selectedDomainId === domain.id ? "border-primary bg-primary/5" : "bg-white"}`}
                    key={domain.id}
                  >
                    <button className="w-full text-left" onClick={() => setSelectedDomainId(domain.id)} type="button">
                      <div className="font-semibold">{domain.title}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{domain.description}</div>
                      <div className="mt-3 rounded-xl bg-muted/30 px-3 py-2 text-sm text-muted-foreground">{domain.rationale}</div>
                    </button>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <Button
                        disabled={singleDomainMutation.isPending}
                        onClick={() => singleDomainMutation.mutate(domain.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Wand2 className="mr-2 h-4 w-4" />
                        {singleDomainMutation.isPending && selectedDomainId === domain.id ? "Regenerating..." : "Regenerate domain"}
                      </Button>
                      <Button
                        disabled={domainQuestionsMutation.isPending}
                        onClick={() => domainQuestionsMutation.mutate(domain.id)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        {domainQuestionsMutation.isPending && selectedDomainId === domain.id
                          ? "Regenerating..."
                          : domain.questions.length
                            ? "Regenerate question set"
                            : "Generate questions"}
                      </Button>
                      <Button
                        onClick={() =>
                          setBuilderDomains((current) =>
                            current.map((item) => (item.id === domain.id ? { ...item, kept: !item.kept } : item))
                          )
                        }
                        size="sm"
                        type="button"
                        variant={domain.kept ? "secondary" : "ghost"}
                      >
                        {domain.kept ? "Keep" : "Discarded"}
                      </Button>
                      <Badge variant="secondary">{domain.questions.length} questions</Badge>
                      {domain.providerLabel ? <Badge variant="outline">{domain.providerLabel}</Badge> : null}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {selectedDomain ? (
        <Card className="border-border bg-white/90">
          <CardHeader>
            <CardTitle>{selectedDomain.title}</CardTitle>
            <CardDescription>Generated question set for the selected domain. This remains editable after you move into authoring.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedDomain.providerLabel ? <Badge variant="outline">{selectedDomain.providerLabel}</Badge> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Domain title</Label>
                <Input
                  value={selectedDomain.title}
                  onChange={(event) =>
                    setBuilderDomains((current) =>
                      current.map((domain) => (domain.id === selectedDomain.id ? { ...domain, title: event.target.value } : domain))
                    )
                  }
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Domain description</Label>
                <Textarea
                  value={selectedDomain.description}
                  onChange={(event) =>
                    setBuilderDomains((current) =>
                      current.map((domain) => (domain.id === selectedDomain.id ? { ...domain, description: event.target.value } : domain))
                    )
                  }
                />
              </div>
            </div>
            {!selectedDomain.questions.length ? (
              <div className="rounded-[1.25rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
                Generate questions for this domain to complete the guided builder flow.
              </div>
            ) : (
              selectedDomain.questions.map((question, index) => (
                <div className="rounded-[1.25rem] border bg-white p-4" key={question.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="font-semibold">Question {index + 1}</div>
                    <Button
                      disabled={singleQuestionMutation.isPending}
                      onClick={() => singleQuestionMutation.mutate({ domainId: selectedDomain.id, questionId: question.id })}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {singleQuestionMutation.isPending ? "Regenerating..." : "Regenerate question"}
                    </Button>
                  </div>
                  <div className="mt-4 space-y-3">
                    <div className="space-y-2">
                      <Label>Prompt</Label>
                      <Textarea
                        value={question.prompt}
                        onChange={(event) =>
                          setBuilderDomains((current) =>
                            current.map((domain) =>
                              domain.id === selectedDomain.id
                                ? {
                                    ...domain,
                                    questions: domain.questions.map((item) =>
                                      item.id === question.id ? { ...item, prompt: event.target.value } : item
                                    )
                                  }
                                : domain
                            )
                          )
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Guidance</Label>
                      <Textarea
                        value={question.guidance}
                        onChange={(event) =>
                          setBuilderDomains((current) =>
                            current.map((domain) =>
                              domain.id === selectedDomain.id
                                ? {
                                    ...domain,
                                    questions: domain.questions.map((item) =>
                                      item.id === question.id ? { ...item, guidance: event.target.value } : item
                                    )
                                  }
                                : domain
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {question.levels.map((level) => (
                      <div className="rounded-xl bg-muted/20 p-3 text-sm" key={`${question.id}-${level.value}`}>
                        <div className="font-medium">{level.label}</div>
                        <Textarea
                          className="mt-2"
                          value={level.description}
                          onChange={(event) =>
                            setBuilderDomains((current) =>
                              current.map((domain) =>
                                domain.id === selectedDomain.id
                                  ? {
                                      ...domain,
                                      questions: domain.questions.map((item) =>
                                        item.id === question.id
                                          ? {
                                              ...item,
                                              levels: item.levels.map((entry) =>
                                                entry.value === level.value ? { ...entry, description: event.target.value } : entry
                                              )
                                            }
                                          : item
                                      )
                                    }
                                  : domain
                              )
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

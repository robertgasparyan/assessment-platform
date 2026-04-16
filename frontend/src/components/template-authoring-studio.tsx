import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BookCopy,
  ChevronDown,
  ChevronUp,
  Copy,
  FileCheck,
  Layers2,
  LibraryBig,
  Search,
  Plus,
  Save,
  Sparkles,
  Trash2
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { createClientId } from "@/lib/create-id";
import type {
  Category,
  Level,
  LibraryDomain,
  LibraryQuestion,
  TemplateAiConsistencyReview,
  TemplateAiDomainAssist,
  TemplateAiQuestionAssist,
} from "@/types";

type StepId = "setup" | "compose" | "review";

type StudioQuestion = {
  id: string;
  prompt: string;
  guidance?: string;
  levels: Level[];
  libraryId?: string;
};

type StudioDomain = {
  id: string;
  title: string;
  description?: string;
  questions: StudioQuestion[];
  libraryId?: string;
};

type QuestionLibraryPayload = Omit<LibraryQuestion, "id">;
type DomainLibraryPayload = Omit<LibraryDomain, "id" | "questions"> & {
  questions: QuestionLibraryPayload[];
};

export type TemplateAuthoringDraft = {
  name: string;
  slug: string;
  description: string;
  category: string;
  scoringLabels: string[];
  domains: StudioDomain[];
};

const defaultLabels = ["Initial", "Developing", "Intermediate", "Advanced", "Optimized"];

function createId(prefix: string) {
  return createClientId(prefix);
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildLevels(labels: string[], descriptions?: string[]): Level[] {
  return labels.map((label, index) => ({
    value: index + 1,
    label,
    description: descriptions?.[index] ?? ""
  }));
}

function normalizeString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeDraft(input: TemplateAuthoringDraft): TemplateAuthoringDraft {
  const scoringLabels = input.scoringLabels.length
    ? input.scoringLabels.map((label, index) => normalizeString(label) || `Level ${index + 1}`)
    : [...defaultLabels];

  return {
    name: normalizeString(input.name),
    slug: normalizeString(input.slug),
    description: normalizeString(input.description),
    category: normalizeString(input.category),
    scoringLabels,
    domains: (input.domains ?? []).map((domain, domainIndex) => ({
      id: domain.id ?? createId("domain"),
      title: normalizeString(domain.title),
      description: normalizeString(domain.description),
      libraryId: domain.libraryId,
      questions: (domain.questions ?? []).map((question, questionIndex) => ({
        id: question.id ?? createId("question"),
        prompt: normalizeString(question.prompt),
        guidance: normalizeString(question.guidance),
        libraryId: question.libraryId,
        levels:
          question.levels?.length === scoringLabels.length
            ? question.levels.map((level, levelIndex) => ({
                value: typeof level.value === "number" ? level.value : levelIndex + 1,
                label: normalizeString(level.label) || scoringLabels[levelIndex] || `Level ${levelIndex + 1}`,
                description: normalizeString(level.description)
              }))
            : buildLevels(
                scoringLabels,
                scoringLabels.map((_label, levelIndex) => normalizeString(question.levels?.[levelIndex]?.description))
              )
      }))
    }))
  };
}

function createQuestion(labels: string[]): StudioQuestion {
  return {
    id: createId("question"),
    prompt: "",
    guidance: "",
    levels: buildLevels(labels)
  };
}

function createDomain(labels: string[]): StudioDomain {
  return {
    id: createId("domain"),
    title: "",
    description: "",
    questions: [createQuestion(labels)]
  };
}

export function createTemplateDraft(): TemplateAuthoringDraft {
  return {
    name: "",
    slug: "",
    description: "",
    category: "",
    scoringLabels: [...defaultLabels],
    domains: [createDomain(defaultLabels)]
  };
}

function moveItem<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [removed] = next.splice(from, 1);
  next.splice(to, 0, removed);
  return next;
}

function cloneQuestion(question: LibraryQuestion | StudioQuestion): StudioQuestion {
  return {
    id: createId("question"),
    prompt: question.prompt,
    guidance: question.guidance,
    levels: question.levels.map((level) => ({ ...level })),
    libraryId: question.id
  };
}

function cloneDomain(domain: LibraryDomain | StudioDomain): StudioDomain {
  return {
    id: createId("domain"),
    title: domain.title,
    description: domain.description,
    libraryId: domain.id,
    questions: domain.questions.map((question) => cloneQuestion(question))
  };
}

function validateDraft(draft: TemplateAuthoringDraft) {
  const issues: string[] = [];

  if (!normalizeString(draft.name).trim()) issues.push("Template name is required.");
  if (!normalizeString(draft.slug).trim()) issues.push("Template slug is required.");
  if (draft.domains.length === 0) issues.push("Add at least one domain.");

  draft.scoringLabels.forEach((label, index) => {
    if (!normalizeString(label).trim()) issues.push(`Level ${index + 1} label is empty.`);
  });

  draft.domains.forEach((domain, domainIndex) => {
    if (!normalizeString(domain.title).trim()) issues.push(`Domain ${domainIndex + 1} needs a title.`);
    if (domain.questions.length === 0) issues.push(`Domain "${domain.title || domainIndex + 1}" has no questions.`);

    domain.questions.forEach((question, questionIndex) => {
      if (!normalizeString(question.prompt).trim()) {
        issues.push(`Question ${questionIndex + 1} in "${domain.title || `Domain ${domainIndex + 1}`}" is empty.`);
      }

      if (question.levels.length !== draft.scoringLabels.length) {
        issues.push(`Question "${question.prompt || `#${questionIndex + 1}`}" has a mismatched number of levels.`);
      }

      question.levels.forEach((level) => {
        if (!normalizeString(level.description).trim()) {
          issues.push(`Question "${question.prompt || `#${questionIndex + 1}`}" is missing description for ${level.label}.`);
        }
      });
    });
  });

  return issues;
}

function isQuestionReadyForLibrary(question: StudioQuestion) {
  return Boolean(
    normalizeString(question.prompt).trim() &&
      question.levels.length >= 2 &&
      question.levels.every((level) => normalizeString(level.label).trim() && normalizeString(level.description).trim())
  );
}

function isDomainReadyForLibrary(domain: StudioDomain) {
  return Boolean(normalizeString(domain.title).trim() && domain.questions.length > 0 && domain.questions.every(isQuestionReadyForLibrary));
}

export function TemplateAuthoringStudio({
  initialDraft,
  initialDraftId,
  categories,
  questionLibrary,
  domainLibrary,
  onSaveDraft,
  onDeleteDraft,
  onSaveQuestionLibrary,
  onUpdateQuestionLibrary,
  onDeleteQuestionLibrary,
  onSaveDomainLibrary,
  onUpdateDomainLibrary,
  onDeleteDomainLibrary,
  onSubmit,
  onStartBlank,
  submitLabel,
  title,
  description,
  submitting,
  aiEnabled
}: {
  initialDraft?: TemplateAuthoringDraft;
  initialDraftId?: string | null;
  categories?: Category[];
  questionLibrary: LibraryQuestion[];
  domainLibrary: LibraryDomain[];
  onSaveDraft: (draft: TemplateAuthoringDraft, draftId?: string | null) => void;
  onDeleteDraft?: (draftId: string) => void;
  onSaveQuestionLibrary: (question: QuestionLibraryPayload) => void;
  onUpdateQuestionLibrary: (questionId: string, question: QuestionLibraryPayload) => void;
  onDeleteQuestionLibrary: (questionId: string) => void;
  onSaveDomainLibrary: (domain: DomainLibraryPayload) => void;
  onUpdateDomainLibrary: (domainId: string, domain: DomainLibraryPayload) => void;
  onDeleteDomainLibrary: (domainId: string) => void;
  onSubmit: (draft: TemplateAuthoringDraft) => void;
  onStartBlank?: () => void;
  submitLabel?: string;
  title?: string;
  description?: string;
  submitting?: boolean;
  aiEnabled?: boolean;
}) {
  const [step, setStep] = useState<StepId>("setup");
  const [draft, setDraft] = useState<TemplateAuthoringDraft>(initialDraft ? normalizeDraft(initialDraft) : createTemplateDraft());
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(Boolean(initialDraft?.slug));
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(draft.domains[0]?.id ?? null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(draft.domains[0]?.questions[0]?.id ?? null);
  const [draggedDomainId, setDraggedDomainId] = useState<string | null>(null);
  const [draggedQuestionId, setDraggedQuestionId] = useState<string | null>(null);
  const [domainSearch, setDomainSearch] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const [composePanelTab, setComposePanelTab] = useState("editor");
  const [lastQuestionAssist, setLastQuestionAssist] = useState<TemplateAiQuestionAssist | null>(null);
  const [lastDomainAssist, setLastDomainAssist] = useState<TemplateAiDomainAssist | null>(null);
  const [lastConsistencyReview, setLastConsistencyReview] = useState<TemplateAiConsistencyReview | null>(null);

  useEffect(() => {
    if (initialDraft) {
      const normalized = normalizeDraft(initialDraft);
      setDraft(normalized);
      setSlugManuallyEdited(Boolean(normalized.slug));
      setSelectedDomainId(normalized.domains[0]?.id ?? null);
      setEditingQuestionId(normalized.domains[0]?.questions[0]?.id ?? null);
    }
  }, [initialDraft, initialDraftId]);

  useEffect(() => {
    if (slugManuallyEdited) {
      return;
    }

    setDraft((current) => {
      const nextSlug = slugify(current.name);
      if (current.slug === nextSlug) {
        return current;
      }

      return {
        ...current,
        slug: nextSlug
      };
    });
  }, [draft.name, slugManuallyEdited]);

  useEffect(() => {
    if (!selectedDomainId && draft.domains[0]) {
      setSelectedDomainId(draft.domains[0].id);
    }
  }, [draft.domains, selectedDomainId]);

  useEffect(() => {
    setLastDomainAssist(null);
  }, [selectedDomainId]);

  useEffect(() => {
    setLastQuestionAssist(null);
  }, [editingQuestionId]);

  const selectedDomain = draft.domains.find((domain) => domain.id === selectedDomainId) ?? null;
  const editingQuestion = selectedDomain?.questions.find((question) => question.id === editingQuestionId) ?? null;
  const editingQuestionHasContent = Boolean(
    editingQuestion &&
      (normalizeString(editingQuestion.prompt).trim() ||
        normalizeString(editingQuestion.guidance).trim() ||
        editingQuestion.levels.some((level) => normalizeString(level.description).trim()))
  );
  const issues = useMemo(() => validateDraft(draft), [draft]);
  const canSaveSelectedDomainToLibrary = selectedDomain ? isDomainReadyForLibrary(selectedDomain) : false;
  const canSaveEditingQuestionToLibrary = editingQuestion ? isQuestionReadyForLibrary(editingQuestion) : false;
  const filteredDomainLibrary = domainLibrary.filter((domain) =>
    `${domain.title} ${domain.description ?? ""}`.toLowerCase().includes(domainSearch.toLowerCase())
  );
  const filteredQuestionLibrary = questionLibrary.filter((question) =>
    `${question.title} ${question.prompt}`.toLowerCase().includes(questionSearch.toLowerCase())
  );
  const categoryOptions = [
    { value: "", label: "Select category" },
    ...(categories ?? []).map((category) => ({ value: category.name, label: category.name }))
  ];

  const updateDraft = (next: Partial<TemplateAuthoringDraft>) => setDraft((current) => ({ ...current, ...next }));

  const updateSelectedDomain = (updater: (domain: StudioDomain) => StudioDomain) => {
    if (!selectedDomain) return;

    setDraft((current) => ({
      ...current,
      domains: current.domains.map((domain) => (domain.id === selectedDomain.id ? updater(domain) : domain))
    }));
  };

  const updateEditingQuestion = (updater: (question: StudioQuestion) => StudioQuestion) => {
    if (!selectedDomain || !editingQuestion) return;

    updateSelectedDomain((domain) => ({
      ...domain,
      questions: domain.questions.map((question) => (question.id === editingQuestion.id ? updater(question) : question))
    }));
  };

  const totalQuestions = draft.domains.reduce((sum, domain) => sum + domain.questions.length, 0);
  const questionAssistMutation = useMutation({
    mutationFn: ({
      questionId,
      prompt,
      guidance,
      levels,
      autoApply
    }: {
      questionId: string;
      prompt: string;
      guidance?: string;
      levels: Level[];
      autoApply?: boolean;
    }) =>
      api.post<TemplateAiQuestionAssist>("/templates/ai/question-assist", {
        templateName: draft.name,
        domainTitle: selectedDomain?.title ?? "",
        scoringLabels: draft.scoringLabels,
        prompt,
        guidance: guidance ?? "",
        levels
      }),
    onSuccess: (data, variables) => {
      setEditingQuestionId(variables.questionId);
      setLastQuestionAssist(data);

      if (!variables.autoApply) {
        return;
      }

      setDraft((current) => ({
        ...current,
        domains: current.domains.map((domain) => ({
          ...domain,
          questions: domain.questions.map((question) =>
            question.id === variables.questionId
              ? {
                  ...question,
                  prompt: data.rewrittenPrompt,
                  guidance: data.guidance,
                  levels: data.levels.map((level) => ({ ...level }))
                }
              : question
          )
        }))
      }));
      toast.success("AI question draft generated");
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const domainAssistMutation = useMutation({
    mutationFn: () =>
      api.post<TemplateAiDomainAssist>("/templates/ai/domain-assist", {
        templateName: draft.name,
        domainTitle: selectedDomain?.title ?? "",
        description: selectedDomain?.description ?? "",
        questionPrompts: selectedDomain?.questions.map((question) => question.prompt) ?? []
      }),
    onSuccess: (data) => setLastDomainAssist(data),
    onError: (error: Error) => toast.error(error.message)
  });
  const consistencyReviewMutation = useMutation({
    mutationFn: () =>
      api.post<TemplateAiConsistencyReview>("/templates/ai/consistency-review", {
        templateName: draft.name,
        templateDescription: draft.description,
        category: draft.category,
        scoringLabels: draft.scoringLabels,
        domains: draft.domains.map((domain) => ({
          title: domain.title,
          description: domain.description ?? "",
          questions: domain.questions.map((question) => ({
            prompt: question.prompt,
            guidance: question.guidance ?? "",
            levels: question.levels
          }))
        }))
      }),
    onSuccess: (data) => setLastConsistencyReview(data),
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
              <CardTitle>{title ?? "Template authoring studio"}</CardTitle>
              <CardDescription>
                {description ??
                  "Build templates in stages: define the assessment, compose reusable content, then review and publish."}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  onStartBlank?.();
                  setDraft(createTemplateDraft());
                  setSlugManuallyEdited(false);
                  setSelectedDomainId(null);
                  setEditingQuestionId(null);
                }}
                type="button"
                variant="outline"
              >
                New blank draft
              </Button>
              <Button onClick={() => onSaveDraft(draft, initialDraftId)} type="button" variant="secondary">
                <Save className="mr-2 h-4 w-4" />
                Save draft
              </Button>
              {initialDraftId && onDeleteDraft ? (
                <Button onClick={() => onDeleteDraft(initialDraftId)} type="button" variant="ghost">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete draft
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3">
            {[
              { id: "setup", title: "Setup", description: "Template identity and scoring model", icon: FileCheck },
              { id: "compose", title: "Compose", description: "Domains, reusable questions, and ordering", icon: Layers2 },
              { id: "review", title: "Review", description: "Validation and publish readiness", icon: BookCopy }
            ].map((item, index) => {
              const Icon = item.icon;
              const active = step === item.id;
              return (
                <button
                  className={`rounded-[1.35rem] border p-4 text-left transition ${
                    active ? "border-primary bg-primary/8" : "bg-white hover:bg-muted/30"
                  }`}
                  key={item.id}
                  onClick={() => setStep(item.id as StepId)}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <div className={`rounded-2xl p-3 ${active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Step {index + 1}</div>
                      <div className="text-lg font-semibold">{item.title}</div>
                    </div>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {step === "setup" ? (
        <Card>
          <CardHeader>
            <CardTitle>Template setup</CardTitle>
            <CardDescription>
              Define the assessment identity and shared answer scale. Questions will inherit this level structure.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Template name</Label>
                <Input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={draft.slug}
                  onChange={(event) => {
                    setSlugManuallyEdited(true);
                    updateDraft({ slug: slugify(event.target.value) });
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select options={categoryOptions} value={draft.category} onChange={(event) => updateDraft({ category: event.target.value })} />
              </div>
              <div className="rounded-[1.25rem] border bg-muted/20 p-4">
                <div className="text-sm font-medium">Authoring stats</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="secondary">{draft.domains.length} domains</Badge>
                  <Badge variant="secondary">{totalQuestions} questions</Badge>
                  <Badge variant="secondary">{draft.scoringLabels.length} maturity levels</Badge>
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Description</Label>
                <Textarea value={draft.description} onChange={(event) => updateDraft({ description: event.target.value })} />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-lg font-semibold">Shared maturity scale</div>
                <p className="text-sm text-muted-foreground">
                  Keep one consistent answer structure across the template. This simplifies reporting and comparison.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={draft.scoringLabels.length <= 2}
                  onClick={() =>
                    updateDraft({
                      scoringLabels: draft.scoringLabels.slice(0, -1),
                      domains: draft.domains.map((domain) => ({
                        ...domain,
                        questions: domain.questions.map((question) => ({
                          ...question,
                          levels: question.levels.slice(0, -1)
                        }))
                      }))
                    })
                  }
                  type="button"
                  variant="outline"
                >
                  Decrease levels
                </Button>
                <Button
                  disabled={draft.scoringLabels.length >= 7}
                  onClick={() => {
                    const nextValue = draft.scoringLabels.length + 1;
                    const nextLabel = `Level ${nextValue}`;
                    updateDraft({
                      scoringLabels: [...draft.scoringLabels, nextLabel],
                      domains: draft.domains.map((domain) => ({
                        ...domain,
                        questions: domain.questions.map((question) => ({
                          ...question,
                          levels: [
                            ...question.levels,
                            {
                              value: nextValue,
                              label: nextLabel,
                              description: ""
                            }
                          ]
                        }))
                      }))
                    });
                  }}
                  type="button"
                  variant="outline"
                >
                  Increase levels
                </Button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                {draft.scoringLabels.map((label, index) => (
                  <div className="rounded-[1.25rem] border bg-white p-4" key={`score-label-${index}`}>
                    <Label>Level {index + 1}</Label>
                    <Input
                      className="mt-2"
                      value={label}
                      onChange={(event) =>
                        updateDraft({
                          scoringLabels: draft.scoringLabels.map((item, itemIndex) =>
                            itemIndex === index ? event.target.value : item
                          ),
                          domains: draft.domains.map((domain) => ({
                            ...domain,
                            questions: domain.questions.map((question) => ({
                              ...question,
                              levels: question.levels.map((level) =>
                                level.value === index + 1 ? { ...level, label: event.target.value } : level
                              )
                            }))
                          }))
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep("compose")} type="button">
                Continue to compose
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === "compose" ? (
        <div className="grid gap-6 xl:grid-cols-[320px,1fr,360px]">
          <Card className="xl:sticky xl:top-6 xl:h-fit">
            <CardHeader>
              <CardTitle>Template outline</CardTitle>
                <CardDescription>Select and order domains for this template draft.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-[1.1rem] border bg-muted/20 p-4 text-sm text-muted-foreground">
                  Drag domains to reorder. Select one to focus the workspace and question library on that slice.
                </div>
                {draft.domains.map((domain, index) => (
                <div
                  className={`rounded-[1.25rem] border p-4 ${selectedDomainId === domain.id ? "border-primary bg-primary/8" : "bg-white"}`}
                  key={domain.id}
                  draggable
                  onDragStart={() => setDraggedDomainId(domain.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (!draggedDomainId || draggedDomainId === domain.id) return;
                    const from = draft.domains.findIndex((item) => item.id === draggedDomainId);
                    const to = draft.domains.findIndex((item) => item.id === domain.id);
                    if (from < 0 || to < 0) return;
                    setDraft((current) => ({ ...current, domains: moveItem(current.domains, from, to) }));
                    setDraggedDomainId(null);
                  }}
                  onDragEnd={() => setDraggedDomainId(null)}
                >
                  <button className="w-full text-left" onClick={() => setSelectedDomainId(domain.id)} type="button">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{domain.title || `Untitled domain ${index + 1}`}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{domain.questions.length} questions</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Drag</Badge>
                        {domain.libraryId ? <Badge variant="outline">Library copy</Badge> : null}
                      </div>
                    </div>
                  </button>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      disabled={index === 0}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          domains: moveItem(current.domains, index, index - 1)
                        }))
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </Button>
                    <Button
                      disabled={index === draft.domains.length - 1}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          domains: moveItem(current.domains, index, index + 1)
                        }))
                      }
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => {
                        setDraft((current) => ({
                          ...current,
                          domains: current.domains.filter((item) => item.id !== domain.id)
                        }));
                        if (selectedDomainId === domain.id) {
                          setSelectedDomainId(draft.domains.find((item) => item.id !== domain.id)?.id ?? null);
                        }
                      }}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </div>
              ))}

              <Separator />

              <div className="flex flex-col gap-2">
                <Button
                  onClick={() => {
                    const nextDomain = createDomain(draft.scoringLabels);
                    setDraft((current) => ({ ...current, domains: [...current.domains, nextDomain] }));
                    setSelectedDomainId(nextDomain.id);
                  }}
                  type="button"
                  variant="secondary"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New blank domain
                </Button>
                <Button onClick={() => setStep("review")} type="button">
                  Continue to review
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {selectedDomain ? (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Domain workspace</CardTitle>
                    <CardDescription>
                      Edit one domain at a time. Questions are ordered top-to-bottom and the selected question opens in the editor panel.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Domain title</Label>
                        <Input
                          value={selectedDomain.title}
                          onChange={(event) => updateSelectedDomain((domain) => ({ ...domain, title: event.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Short description</Label>
                        <Input
                          value={selectedDomain.description}
                          onChange={(event) =>
                            updateSelectedDomain((domain) => ({ ...domain, description: event.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-[1rem] border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Selected domain</div>
                        <div className="mt-2 font-semibold">{selectedDomain.title || "Untitled domain"}</div>
                      </div>
                      <div className="rounded-[1rem] border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Questions</div>
                        <div className="mt-2 font-semibold">{selectedDomain.questions.length}</div>
                      </div>
                      <div className="rounded-[1rem] border bg-muted/20 p-4">
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Library status</div>
                        <div className="mt-2 font-semibold">{selectedDomain.libraryId ? "Linked copy" : "Template only"}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        onClick={() => {
                          const question = createQuestion(draft.scoringLabels);
                          updateSelectedDomain((domain) => ({ ...domain, questions: [...domain.questions, question] }));
                          setEditingQuestionId(question.id);
                          setComposePanelTab("editor");
                        }}
                        type="button"
                        variant="secondary"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        New question
                      </Button>
                      {aiEnabled ? (
                        <Button
                          disabled={questionAssistMutation.isPending}
                          onClick={() => {
                            const question = createQuestion(draft.scoringLabels);
                            updateSelectedDomain((domain) => ({ ...domain, questions: [...domain.questions, question] }));
                            setEditingQuestionId(question.id);
                            setComposePanelTab("editor");
                            questionAssistMutation.mutate({
                              questionId: question.id,
                              prompt: "",
                              guidance: "",
                              levels: question.levels.map((level) => ({ ...level })),
                              autoApply: true
                            });
                          }}
                          type="button"
                          variant="outline"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {questionAssistMutation.isPending ? "Generating..." : "AI generate question"}
                        </Button>
                      ) : null}
                      {aiEnabled ? (
                        <Button
                          disabled={domainAssistMutation.isPending}
                          onClick={() => domainAssistMutation.mutate()}
                          type="button"
                          variant="outline"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {domainAssistMutation.isPending ? "Refining..." : "AI refine domain"}
                        </Button>
                      ) : null}
                      <Button
                        disabled={!canSaveSelectedDomainToLibrary}
                        onClick={() => {
                          if (!selectedDomain || !isDomainReadyForLibrary(selectedDomain)) {
                            toast.error("Complete all question prompts and level descriptions before saving the domain to the library.");
                            return;
                          }

                          const libraryDomain = {
                            title: selectedDomain.title || "Untitled domain",
                            description: selectedDomain.description,
                            questions: selectedDomain.questions.map((question) => ({
                              title: question.prompt || "Untitled question",
                              prompt: question.prompt,
                              guidance: question.guidance,
                              levels: question.levels.map((level) => ({ ...level }))
                            }))
                          };

                          onSaveDomainLibrary(libraryDomain);
                        }}
                        type="button"
                        variant="outline"
                      >
                        <LibraryBig className="mr-2 h-4 w-4" />
                        Save domain to library
                      </Button>
                      {selectedDomain.libraryId ? (
                        <Button
                          disabled={!canSaveSelectedDomainToLibrary}
                          onClick={() =>
                            selectedDomain && isDomainReadyForLibrary(selectedDomain)
                              ? onUpdateDomainLibrary(selectedDomain.libraryId!, {
                                  title: selectedDomain.title || "Untitled domain",
                                  description: selectedDomain.description,
                                  questions: selectedDomain.questions.map((question) => ({
                                    title: question.prompt || "Untitled question",
                                    prompt: question.prompt,
                                    guidance: question.guidance,
                                    levels: question.levels.map((level) => ({ ...level }))
                                  }))
                                })
                              : toast.error("Complete all question prompts and level descriptions before updating the library domain.")
                          }
                          type="button"
                          variant="outline"
                        >
                          Update library domain
                        </Button>
                      ) : null}
                    </div>
                    {lastDomainAssist ? (
                      <div className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="text-sm font-semibold text-foreground">AI domain suggestion</div>
                          {lastDomainAssist.providerLabel ? <Badge variant="outline">{lastDomainAssist.providerLabel}</Badge> : null}
                          <Badge variant="outline">Manual apply</Badge>
                        </div>
                        <div className="mt-3 grid gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Suggested title</div>
                            <div className="mt-1 font-medium">{lastDomainAssist.suggestedTitle}</div>
                          </div>
                          <div>
                            <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Suggested description</div>
                            <div className="mt-1 text-sm text-foreground">{lastDomainAssist.rewrittenDescription}</div>
                          </div>
                          <div className="space-y-2">
                            {lastDomainAssist.notes.map((note, index) => (
                              <div className="rounded-xl bg-white/80 px-3 py-2 text-sm text-muted-foreground" key={`domain-note-${index}`}>
                                {note}
                              </div>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-3">
                            <Button
                              onClick={() =>
                                updateSelectedDomain((domain) => ({
                                  ...domain,
                                  title: lastDomainAssist.suggestedTitle,
                                  description: lastDomainAssist.rewrittenDescription
                                }))
                              }
                              type="button"
                            >
                              Apply suggestion
                            </Button>
                            <Button onClick={() => setLastDomainAssist(null)} type="button" variant="ghost">
                              Dismiss
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Questions in {selectedDomain.title || "selected domain"}</CardTitle>
                    <CardDescription>
                      Drag to reorder. Open one item at a time to keep editing focused.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {selectedDomain.questions.map((question, index) => (
                      <div
                        className={`rounded-[1.25rem] border p-4 ${
                          editingQuestionId === question.id ? "border-primary bg-primary/5" : "bg-white"
                        }`}
                        key={question.id}
                        draggable
                        onDragStart={() => setDraggedQuestionId(question.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!draggedQuestionId || draggedQuestionId === question.id) return;
                          updateSelectedDomain((domain) => {
                            const from = domain.questions.findIndex((item) => item.id === draggedQuestionId);
                            const to = domain.questions.findIndex((item) => item.id === question.id);
                            if (from < 0 || to < 0) return domain;
                            return { ...domain, questions: moveItem(domain.questions, from, to) };
                          });
                          setDraggedQuestionId(null);
                        }}
                        onDragEnd={() => setDraggedQuestionId(null)}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => {
                              setEditingQuestionId(question.id);
                              setComposePanelTab("editor");
                            }}
                            type="button"
                          >
                            <div className="font-semibold">{question.prompt || `Untitled question ${index + 1}`}</div>
                            <div className="mt-1 text-sm text-muted-foreground">
                              {question.guidance || "Add optional guidance and detailed level descriptions."}
                            </div>
                          </button>
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">Drag</Badge>
                            {question.libraryId ? <Badge variant="outline">Copied from library</Badge> : null}
                          </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button
                            disabled={index === 0}
                            onClick={() =>
                              updateSelectedDomain((domain) => ({
                                ...domain,
                                questions: moveItem(domain.questions, index, index - 1)
                              }))
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            disabled={index === selectedDomain.questions.length - 1}
                            onClick={() =>
                              updateSelectedDomain((domain) => ({
                                ...domain,
                                questions: moveItem(domain.questions, index, index + 1)
                              }))
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() =>
                              updateSelectedDomain((domain) => ({
                                ...domain,
                                questions: [
                                  ...domain.questions.slice(0, index + 1),
                                  {
                                    ...cloneQuestion(question),
                                    prompt: `${question.prompt} (Copy)`
                                  },
                                  ...domain.questions.slice(index + 1)
                                ]
                              }))
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Duplicate
                          </Button>
                          <Button
                            onClick={() =>
                              updateSelectedDomain((domain) => ({
                                ...domain,
                                questions: domain.questions.filter((item) => item.id !== question.id)
                              }))
                            }
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card>
                <CardContent className="p-8 text-sm text-muted-foreground">
                  Select a domain from the outline to start composing questions.
                </CardContent>
              </Card>
            )}
          </div>

          <div className="xl:sticky xl:top-6 xl:h-fit">
            <Card className="overflow-hidden">
              <CardHeader className="border-b bg-white/70">
                <CardTitle>Utility panel</CardTitle>
                <CardDescription>
                  Switch deliberately between the current question editor and reusable libraries.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <Tabs value={composePanelTab} onValueChange={setComposePanelTab}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="questions">Questions</TabsTrigger>
                    <TabsTrigger value="domains">Domains</TabsTrigger>
                  </TabsList>

                  <TabsContent className="mt-4" value="editor">
                    {editingQuestion ? (
                      <div className="space-y-4">
                        <div className="rounded-[1rem] border bg-muted/20 p-4">
                          <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Editing</div>
                          <div className="mt-2 font-semibold">{editingQuestion.prompt || "Untitled question"}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {selectedDomain?.title || "No domain selected"}
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Question prompt</Label>
                          <Textarea value={editingQuestion.prompt} onChange={(event) => updateEditingQuestion((question) => ({ ...question, prompt: event.target.value }))} />
                        </div>
                        <div className="space-y-2">
                          <Label>Guidance</Label>
                          <Textarea value={editingQuestion.guidance} onChange={(event) => updateEditingQuestion((question) => ({ ...question, guidance: event.target.value }))} />
                        </div>
                        <div className="space-y-3">
                          <div className="text-sm font-medium">Maturity descriptions</div>
                          <div className="grid gap-3">
                            {editingQuestion.levels.map((level, index) => (
                              <div className="rounded-[1.15rem] border bg-muted/20 p-4" key={`${editingQuestion.id}-${level.value}`}>
                                <div className="flex items-center justify-between gap-3">
                                  <div className="font-semibold">
                                    {level.label} ({level.value})
                                  </div>
                                  <Badge variant="secondary">Level {index + 1}</Badge>
                                </div>
                                <Textarea
                                  className="mt-3"
                                  value={level.description}
                                  onChange={(event) =>
                                    updateEditingQuestion((question) => ({
                                      ...question,
                                      levels: question.levels.map((item) =>
                                        item.value === level.value ? { ...item, description: event.target.value } : item
                                      )
                                    }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          {aiEnabled ? (
                            <Button
                              disabled={questionAssistMutation.isPending}
                              onClick={() =>
                                questionAssistMutation.mutate({
                                  questionId: editingQuestion.id,
                                  prompt: editingQuestion.prompt,
                                  guidance: editingQuestion.guidance,
                                  levels: editingQuestion.levels.map((level) => ({ ...level }))
                                })
                              }
                              type="button"
                              variant="outline"
                            >
                              <Sparkles className="mr-2 h-4 w-4" />
                              {questionAssistMutation.isPending
                                ? editingQuestionHasContent
                                  ? "Improving..."
                                  : "Generating..."
                                : editingQuestionHasContent
                                  ? "AI improve question"
                                  : "AI generate question"}
                            </Button>
                          ) : null}
                          <Button
                            disabled={!canSaveEditingQuestionToLibrary}
                            onClick={() => {
                              if (!editingQuestion || !isQuestionReadyForLibrary(editingQuestion)) {
                                toast.error("Add the question prompt and all level descriptions before saving this question to the library.");
                                return;
                              }

                              const libraryQuestion: LibraryQuestion = {
                                id: createId("library-question"),
                                title: editingQuestion.prompt || "Untitled question",
                                prompt: editingQuestion.prompt,
                                guidance: editingQuestion.guidance,
                                levels: editingQuestion.levels.map((level) => ({ ...level }))
                              };

                              onSaveQuestionLibrary(libraryQuestion);
                            }}
                            type="button"
                            variant="outline"
                          >
                            <LibraryBig className="mr-2 h-4 w-4" />
                            Save to library
                          </Button>
                          {editingQuestion.libraryId ? (
                            <Button
                              disabled={!canSaveEditingQuestionToLibrary}
                              onClick={() =>
                                editingQuestion && isQuestionReadyForLibrary(editingQuestion)
                                  ? onUpdateQuestionLibrary(editingQuestion.libraryId!, {
                                      title: editingQuestion.prompt || "Untitled question",
                                      prompt: editingQuestion.prompt,
                                      guidance: editingQuestion.guidance,
                                      levels: editingQuestion.levels.map((level) => ({ ...level }))
                                    })
                                  : toast.error("Add the question prompt and all level descriptions before updating the library question.")
                              }
                              type="button"
                              variant="outline"
                            >
                              Update library question
                            </Button>
                          ) : null}
                        </div>
                        {lastQuestionAssist ? (
                          <div className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-foreground">AI question suggestion</div>
                              {lastQuestionAssist.providerLabel ? <Badge variant="outline">{lastQuestionAssist.providerLabel}</Badge> : null}
                              <Badge variant="outline">Manual apply</Badge>
                            </div>
                            <div className="mt-3 space-y-3">
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Improved prompt</div>
                                <div className="mt-1 font-medium text-foreground">{lastQuestionAssist.rewrittenPrompt}</div>
                              </div>
                              <div>
                                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Draft guidance</div>
                                <div className="mt-1 text-sm text-foreground">{lastQuestionAssist.guidance}</div>
                              </div>
                              <div className="grid gap-2">
                                {lastQuestionAssist.levels.map((level) => (
                                  <div className="rounded-xl bg-white/80 px-3 py-3 text-sm" key={`ai-level-${level.value}`}>
                                    <div className="font-medium">{level.label}</div>
                                    <div className="mt-1 text-muted-foreground">{level.description}</div>
                                  </div>
                                ))}
                              </div>
                              <div className="space-y-2">
                                {lastQuestionAssist.notes.map((note, index) => (
                                  <div className="rounded-xl bg-white/80 px-3 py-2 text-sm text-muted-foreground" key={`question-note-${index}`}>
                                    {note}
                                  </div>
                                ))}
                              </div>
                              <div className="flex flex-wrap gap-3">
                                <Button
                                  onClick={() =>
                                    updateEditingQuestion((question) => ({
                                      ...question,
                                      prompt: lastQuestionAssist.rewrittenPrompt,
                                      guidance: lastQuestionAssist.guidance,
                                      levels: lastQuestionAssist.levels.map((level) => ({ ...level }))
                                    }))
                                  }
                                  type="button"
                                >
                                  Apply suggestion
                                </Button>
                                <Button onClick={() => setLastQuestionAssist(null)} type="button" variant="ghost">
                                  Dismiss
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-[1.25rem] border bg-muted/20 p-8 text-sm text-muted-foreground">
                        Select a question from the center panel to open the editor here.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent className="mt-4 space-y-4" value="questions">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Search questions" value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} />
                    </div>
                    <div className="space-y-3">
                      {filteredQuestionLibrary.map((question) => (
                        <div className="rounded-[1.25rem] border bg-white p-4" key={question.id}>
                          <div className="font-semibold">{question.title}</div>
                          <div className="mt-1 line-clamp-3 text-sm text-muted-foreground">{question.prompt}</div>
                          <div className="mt-3 flex gap-2">
                            <Button
                              className="flex-1"
                              disabled={!selectedDomain}
                              onClick={() => {
                                if (!selectedDomain) return;
                                const nextQuestion = cloneQuestion(question);
                                updateSelectedDomain((domain) => ({
                                  ...domain,
                                  questions: [...domain.questions, nextQuestion]
                                }));
                                setEditingQuestionId(nextQuestion.id);
                                setComposePanelTab("editor");
                              }}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Add to selected domain
                            </Button>
                            <Button onClick={() => onDeleteQuestionLibrary(question.id)} size="sm" type="button" variant="ghost">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent className="mt-4 space-y-4" value="domains">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
                      <Input className="pl-9" placeholder="Search domains" value={domainSearch} onChange={(event) => setDomainSearch(event.target.value)} />
                    </div>
                    <div className="space-y-3">
                      {filteredDomainLibrary.map((domain) => (
                        <div className="rounded-[1.25rem] border bg-white p-4" key={domain.id}>
                          <div className="font-semibold">{domain.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{domain.questions.length} reusable questions</div>
                          <div className="mt-3 flex gap-2">
                            <Button
                              className="flex-1"
                              onClick={() => {
                                const nextDomain = cloneDomain(domain);
                                setDraft((current) => ({ ...current, domains: [...current.domains, nextDomain] }));
                                setSelectedDomainId(nextDomain.id);
                              }}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              Add to template
                            </Button>
                            <Button onClick={() => onDeleteDomainLibrary(domain.id)} size="sm" type="button" variant="ghost">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="grid gap-6 xl:grid-cols-[1fr,380px]">
          <Card>
            <CardHeader>
              <CardTitle>Review template</CardTitle>
              <CardDescription>Validate the structure before publishing a new version.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-[1.25rem] border bg-white p-4">
                  <div className="text-sm text-muted-foreground">Domains</div>
                  <div className="mt-2 text-2xl font-semibold">{draft.domains.length}</div>
                </div>
                <div className="rounded-[1.25rem] border bg-white p-4">
                  <div className="text-sm text-muted-foreground">Questions</div>
                  <div className="mt-2 text-2xl font-semibold">{totalQuestions}</div>
                </div>
                <div className="rounded-[1.25rem] border bg-white p-4">
                  <div className="text-sm text-muted-foreground">Maturity levels</div>
                  <div className="mt-2 text-2xl font-semibold">{draft.scoringLabels.length}</div>
                </div>
                <div className="rounded-[1.25rem] border bg-white p-4">
                  <div className="text-sm text-muted-foreground">Estimated length</div>
                  <div className="mt-2 text-2xl font-semibold">{Math.max(5, totalQuestions * 2)} min</div>
                </div>
              </div>

              {draft.domains.map((domain) => (
                <div className="rounded-[1.35rem] border bg-white p-5" key={domain.id}>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{domain.title || "Untitled domain"}</div>
                      <div className="text-sm text-muted-foreground">{domain.description || "No description added yet."}</div>
                    </div>
                    <Badge variant="secondary">{domain.questions.length} questions</Badge>
                  </div>
                  <div className="mt-4 space-y-4">
                    {domain.questions.map((question) => (
                      <div className="rounded-[1rem] border bg-muted/20 p-4" key={question.id}>
                        <div className="font-medium">{question.prompt || "Untitled question"}</div>
                        <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                          {question.levels.map((level) => (
                            <div className="rounded-xl bg-white p-3 text-sm" key={`${question.id}-${level.value}`}>
                              <div className="font-semibold">
                                {level.label} ({level.value})
                              </div>
                              <div className="mt-1 text-muted-foreground">{level.description || "Missing description"}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="xl:sticky xl:top-6 xl:h-fit">
            <CardHeader>
              <CardTitle>Publish readiness</CardTitle>
              <CardDescription>Resolve the issues below before saving a new version.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {aiEnabled ? (
                <div className="rounded-[1.25rem] border border-primary/20 bg-primary/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-foreground">AI consistency review</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Optional review for wording consistency, level progression, and overlap across the draft.
                      </div>
                    </div>
                    <Button disabled={consistencyReviewMutation.isPending} onClick={() => consistencyReviewMutation.mutate()} type="button" variant="outline">
                      <Sparkles className="mr-2 h-4 w-4" />
                      {consistencyReviewMutation.isPending ? "Reviewing..." : "Run AI review"}
                    </Button>
                  </div>
                  {lastConsistencyReview ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {lastConsistencyReview.providerLabel ? <Badge variant="outline">{lastConsistencyReview.providerLabel}</Badge> : null}
                        <Badge variant="outline">Draft-only review</Badge>
                      </div>
                      <div className="rounded-xl bg-white/85 p-3 text-sm text-foreground">{lastConsistencyReview.summary}</div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Strengths</div>
                        <div className="mt-2 space-y-2">
                          {lastConsistencyReview.strengths.map((item, index) => (
                            <div className="rounded-xl bg-accent/70 px-3 py-2 text-sm text-foreground" key={`consistency-strength-${index}`}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Issues</div>
                        <div className="mt-2 space-y-2">
                          {lastConsistencyReview.issues.map((item, index) => (
                            <div className="rounded-xl bg-secondary px-3 py-2 text-sm text-foreground" key={`consistency-issue-${index}`}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Suggestions</div>
                        <div className="mt-2 space-y-2">
                          {lastConsistencyReview.suggestions.map((item, index) => (
                            <div className="rounded-xl border border-primary/15 bg-white/85 px-3 py-2 text-sm text-foreground" key={`consistency-suggestion-${index}`}>
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {issues.length === 0 ? (
                <div className="rounded-[1.25rem] border border-primary/20 bg-accent p-4 text-sm text-foreground">
                  No blocking issues found. This template is ready to publish.
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-border bg-secondary p-4">
                  <div className="text-sm font-semibold text-foreground">{issues.length} issues to fix</div>
                  <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                    {issues.slice(0, 10).map((issue) => (
                      <li key={issue}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex flex-col gap-3">
                <Button onClick={() => setStep("compose")} type="button" variant="outline">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to compose
                </Button>
                <Button disabled={issues.length > 0 || submitting} onClick={() => onSubmit(draft)} type="button">
                  {submitLabel ?? "Publish template version"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

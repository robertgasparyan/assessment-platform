import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  TemplateAuthoringStudio,
  type TemplateAuthoringDraft
} from "@/components/template-authoring-studio";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import type { Category, LibraryDomain, LibraryQuestion, TemplateDetail, TemplateDraft, TemplateSummary } from "@/types";

function toPayload(input: TemplateAuthoringDraft) {
  return {
    ...input,
    domains: input.domains.map((domain) => ({
      ...domain,
      questions: domain.questions.map((question) => ({
        ...question,
        levels: question.levels.filter((level) => level.label.trim() || level.description.trim())
      }))
    }))
  };
}

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateTab, setTemplateTab] = useState("author");
  const [pendingTemplateDeleteId, setPendingTemplateDeleteId] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ["templates"],
    queryFn: () => api.get<TemplateSummary[]>("/templates")
  });
  const draftsQuery = useQuery({
    queryKey: ["template-drafts"],
    queryFn: () => api.get<TemplateDraft[]>("/template-drafts")
  });
  const questionLibraryQuery = useQuery({
    queryKey: ["question-library"],
    queryFn: () => api.get<LibraryQuestion[]>("/question-library")
  });
  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories")
  });
  const domainLibraryQuery = useQuery({
    queryKey: ["domain-library"],
    queryFn: () => api.get<LibraryDomain[]>("/domain-library")
  });

  const templateDetailQuery = useQuery({
    queryKey: ["template-detail", activeTemplateId],
    queryFn: () => api.get<TemplateDetail>(`/templates/${activeTemplateId}`),
    enabled: Boolean(activeTemplateId)
  });
  const editingTemplateDetailQuery = useQuery({
    queryKey: ["template-detail-edit", editingTemplateId],
    queryFn: () => api.get<TemplateDetail>(`/templates/${editingTemplateId}`),
    enabled: Boolean(editingTemplateId)
  });

  const createMutation = useMutation({
    mutationFn: (draft: TemplateAuthoringDraft) => api.post("/templates", toPayload(draft)),
    onSuccess: () => {
      toast.success("Template version saved");
      setTemplateTab("existing");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template-drafts"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateTemplateMutation = useMutation({
    mutationFn: ({ templateId, draft }: { templateId: string; draft: TemplateAuthoringDraft }) =>
      api.put(`/templates/${templateId}`, toPayload(draft)),
    onSuccess: () => {
      toast.success("Template updated as a new version");
      setEditingTemplateId(null);
      setTemplateTab("existing");
      queryClient.invalidateQueries({ queryKey: ["templates"] });
      queryClient.invalidateQueries({ queryKey: ["template-detail", activeTemplateId] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const deleteTemplateMutation = useMutation({
    mutationFn: (templateId: string) => api.delete(`/templates/${templateId}`),
    onSuccess: () => {
      toast.success("Template removed");
      setActiveTemplateId(null);
      setEditingTemplateId(null);
      setPendingTemplateDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["templates"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const saveDraftMutation = useMutation({
    mutationFn: ({ draft, draftId }: { draft: TemplateAuthoringDraft; draftId?: string | null }) =>
      draftId ? api.put<TemplateDraft>(`/template-drafts/${draftId}`, draft) : api.post<TemplateDraft>("/template-drafts", draft),
    onSuccess: (savedDraft) => {
      toast.success("Template draft saved");
      setActiveDraftId(savedDraft.id);
      queryClient.invalidateQueries({ queryKey: ["template-drafts"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const deleteDraftMutation = useMutation({
    mutationFn: (draftId: string) => api.delete(`/template-drafts/${draftId}`),
    onSuccess: () => {
      toast.success("Template draft deleted");
      setActiveDraftId(null);
      queryClient.invalidateQueries({ queryKey: ["template-drafts"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const saveQuestionLibraryMutation = useMutation({
    mutationFn: (question: Omit<LibraryQuestion, "id">) => api.post("/question-library", question),
    onSuccess: () => {
      toast.success("Question saved to library");
      queryClient.invalidateQueries({ queryKey: ["question-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const saveDomainLibraryMutation = useMutation({
    mutationFn: (domain: { title: string; description?: string; questions: Array<Omit<LibraryQuestion, "id">> }) =>
      api.post("/domain-library", domain),
    onSuccess: () => {
      toast.success("Domain saved to library");
      queryClient.invalidateQueries({ queryKey: ["domain-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateQuestionLibraryMutation = useMutation({
    mutationFn: ({ id, question }: { id: string; question: Omit<LibraryQuestion, "id"> }) =>
      api.put(`/question-library/${id}`, question),
    onSuccess: () => {
      toast.success("Question library item updated");
      queryClient.invalidateQueries({ queryKey: ["question-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const deleteQuestionLibraryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/question-library/${id}`),
    onSuccess: () => {
      toast.success("Question library item deleted");
      queryClient.invalidateQueries({ queryKey: ["question-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const updateDomainLibraryMutation = useMutation({
    mutationFn: ({
      id,
      domain
    }: {
      id: string;
      domain: { title: string; description?: string; questions: Array<Omit<LibraryQuestion, "id">> };
    }) =>
      api.put(`/domain-library/${id}`, domain),
    onSuccess: () => {
      toast.success("Domain library item updated");
      queryClient.invalidateQueries({ queryKey: ["domain-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const deleteDomainLibraryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/domain-library/${id}`),
    onSuccess: () => {
      toast.success("Domain library item deleted");
      queryClient.invalidateQueries({ queryKey: ["domain-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const activeDraft = draftsQuery.data?.find((draft) => draft.id === activeDraftId) ?? null;
  const editingTemplateDraft =
    editingTemplateDetailQuery.data?.versions[0]
      ? {
          name: editingTemplateDetailQuery.data.name,
          slug: editingTemplateDetailQuery.data.slug,
          description: editingTemplateDetailQuery.data.description ?? "",
          category: editingTemplateDetailQuery.data.category ?? "",
          scoringLabels: editingTemplateDetailQuery.data.versions[0].scoringLabels,
          domains: editingTemplateDetailQuery.data.versions[0].domains.map((domain, domainIndex) => ({
            id: domain.id ?? `edit-domain-${domainIndex}`,
            title: domain.title,
            description: domain.description ?? "",
            questions: domain.questions.map((question, questionIndex) => ({
              id: question.id ?? `edit-question-${domainIndex}-${questionIndex}`,
              prompt: question.prompt,
              guidance: question.guidance ?? "",
              levels: question.levels.map((level) => ({
                value: level.value,
                label: level.label,
                description: level.description
              }))
            }))
          }))
        }
      : undefined;

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Template library</div>
        <h1 className="mt-2 text-4xl font-semibold">Assessment template design</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Create reusable assessment frameworks with versioned domains, questions, and maturity scales.
        </p>
        {editingTemplateId ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
              Editing template version flow
            </div>
            <button
              className="text-sm font-medium text-muted-foreground"
              onClick={() => setEditingTemplateId(null)}
              type="button"
            >
              Exit edit mode
            </button>
          </div>
        ) : null}
      </div>

      <Tabs value={templateTab} onValueChange={setTemplateTab}>
        <TabsList>
          <TabsTrigger value="author">Author</TabsTrigger>
          <TabsTrigger value="drafts">Drafts</TabsTrigger>
          <TabsTrigger value="existing">Existing Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="author">
          <TemplateAuthoringStudio
            categories={categoriesQuery.data ?? []}
            domainLibrary={domainLibraryQuery.data ?? []}
            initialDraft={
              editingTemplateDraft ??
              (activeDraft
                ? {
                    name: activeDraft.name,
                    slug: activeDraft.slug,
                    description: activeDraft.description ?? "",
                    category: activeDraft.category ?? "",
                    scoringLabels: activeDraft.scoringLabels,
                    domains: activeDraft.domains.map((domain, domainIndex) => ({
                      ...domain,
                      id: domain.id ?? `draft-domain-${domainIndex}`,
                      questions: domain.questions.map((question, questionIndex) => ({
                        ...question,
                        id: question.id ?? `draft-question-${domainIndex}-${questionIndex}`
                      }))
                    }))
                  }
                : undefined)
            }
            initialDraftId={editingTemplateId ?? activeDraft?.id ?? null}
            onDeleteDomainLibrary={(domainId) => deleteDomainLibraryMutation.mutate(domainId)}
            onDeleteDraft={(draftId) => deleteDraftMutation.mutate(draftId)}
            onDeleteQuestionLibrary={(questionId) => deleteQuestionLibraryMutation.mutate(questionId)}
            onSaveDomainLibrary={(domain) => saveDomainLibraryMutation.mutate(domain)}
            onSaveDraft={(draft, draftId) => saveDraftMutation.mutate({ draft, draftId })}
            onSaveQuestionLibrary={(question) => saveQuestionLibraryMutation.mutate(question)}
            onStartBlank={() => {
              setEditingTemplateId(null);
              setActiveDraftId(null);
            }}
            onUpdateDomainLibrary={(domainId, domain) => updateDomainLibraryMutation.mutate({ id: domainId, domain })}
            onUpdateQuestionLibrary={(questionId, question) =>
              updateQuestionLibraryMutation.mutate({ id: questionId, question })
            }
            onSubmit={(draft) =>
              editingTemplateId
                ? updateTemplateMutation.mutate({ templateId: editingTemplateId, draft })
                : createMutation.mutate(draft)
            }
            questionLibrary={questionLibraryQuery.data ?? []}
            submitLabel={editingTemplateId ? "Save as new template version" : "Publish template version"}
            title={editingTemplateId ? "Edit template" : "Template authoring studio"}
            description={
              editingTemplateId
                ? "Update the selected template. Saving will create a new template version while preserving existing assessment snapshots."
                : undefined
            }
            submitting={
              createMutation.isPending ||
              updateTemplateMutation.isPending ||
              saveDraftMutation.isPending ||
              updateQuestionLibraryMutation.isPending ||
              updateDomainLibraryMutation.isPending
            }
          />
        </TabsContent>

        <TabsContent value="drafts">
          <div className="grid gap-6 xl:grid-cols-[0.8fr,1.2fr]">
            <Card>
              <CardHeader>
                <CardTitle>Saved draft templates</CardTitle>
                <CardDescription>Start a new draft or resume one from the database.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <button
                  className={`w-full rounded-[1.25rem] border p-4 text-left transition ${
                    activeDraftId === null ? "border-primary bg-primary/8" : "bg-white hover:bg-muted/30"
                  }`}
                  onClick={() => {
                    setActiveDraftId(null);
                    setEditingTemplateId(null);
                    setTemplateTab("author");
                  }}
                  type="button"
                >
                  <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
                      <Plus className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-semibold">New blank draft</div>
                      <div className="mt-1 text-sm text-muted-foreground">Start from scratch with an empty authoring canvas.</div>
                    </div>
                  </div>
                </button>
                {(draftsQuery.data ?? []).map((draft) => (
                  <div
                    className={`rounded-[1.25rem] border p-4 transition ${
                      activeDraftId === draft.id ? "border-primary bg-primary/8" : "bg-white"
                    }`}
                    key={draft.id}
                  >
                    <button
                      className="w-full text-left"
                      onClick={() => {
                        setActiveDraftId(draft.id);
                        setEditingTemplateId(null);
                      }}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{draft.name || "Untitled draft"}</div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {draft.domains.length} domains · {draft.scoringLabels.length} levels
                          </div>
                        </div>
                        <Badge variant="outline">{draft.status}</Badge>
                      </div>
                    </button>
                    <div className="mt-3 flex gap-2">
                      <button
                        className="text-sm font-medium text-primary"
                        onClick={() => {
                          setActiveDraftId(draft.id);
                          setEditingTemplateId(null);
                          setTemplateTab("author");
                        }}
                        type="button"
                      >
                        Resume
                      </button>
                      <button
                        className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground"
                        onClick={() => deleteDraftMutation.mutate(draft.id)}
                        type="button"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="existing">
          <div className="grid gap-6 xl:grid-cols-[0.9fr,1.1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Existing templates</CardTitle>
                <CardDescription>Select a template to inspect its latest versions and structure.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingTemplateDeleteId ? (
                  <div className="rounded-[1.25rem] border border-primary/30 bg-primary/5 p-4">
                    <div className="font-semibold">Remove template?</div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      This removes the template and all of its versions. Templates that are already used by assessment runs cannot be removed.
                    </div>
                    <div className="mt-4 flex gap-2">
                      <button
                        className="rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground"
                        onClick={() => deleteTemplateMutation.mutate(pendingTemplateDeleteId)}
                        type="button"
                      >
                        Remove template
                      </button>
                      <button
                        className="rounded-xl border px-4 py-2 text-sm font-medium"
                        onClick={() => setPendingTemplateDeleteId(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                {(templatesQuery.data ?? []).map((template) => (
                  <div className="rounded-[1.25rem] border bg-white p-4" key={template.id}>
                    <button
                      className="w-full text-left transition hover:bg-muted/0"
                      onClick={() => setActiveTemplateId(template.id)}
                      type="button"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{template.name}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{template.description}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="secondary">{template.usage.totalRuns} runs</Badge>
                            <Badge variant="outline">{template.usage.submittedRuns} submitted</Badge>
                          </div>
                        </div>
                        <Badge variant="outline">v{template.latestVersion?.versionNumber ?? 0}</Badge>
                      </div>
                    </button>
                    <div className="mt-3 flex gap-3 text-sm">
                      <button
                        className="font-medium text-primary"
                        onClick={() => {
                          setEditingTemplateId(template.id);
                          setActiveTemplateId(template.id);
                          setActiveDraftId(null);
                          setTemplateTab("author");
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="font-medium text-muted-foreground"
                        disabled={template.usage.totalRuns > 0}
                        onClick={() => setPendingTemplateDeleteId(template.id)}
                        type="button"
                      >
                        {template.usage.totalRuns > 0 ? "In use" : "Remove"}
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Template preview</CardTitle>
                <CardDescription>Latest saved version details.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {templateDetailQuery.data?.versions[0] ? (
                  <>
                    <div>
                      <div className="text-sm text-muted-foreground">Version</div>
                      <div className="text-xl font-semibold">
                        {templateDetailQuery.data.name} v{templateDetailQuery.data.versions[0].versionNumber}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant="secondary">{templateDetailQuery.data.usage.totalRuns} runs use this template</Badge>
                      </div>
                    </div>
                    {templateDetailQuery.data.usage.recentRuns.length ? (
                      <div className="rounded-[1.25rem] border bg-white p-4">
                        <div className="font-semibold">Recent usage</div>
                        <div className="mt-3 space-y-2">
                          {templateDetailQuery.data.usage.recentRuns.map((run) => (
                            <div className="flex items-center justify-between gap-3 text-sm" key={run.id}>
                              <div>
                                <div className="font-medium">{run.title}</div>
                                <div className="text-muted-foreground">
                                  {run.teamName} · {run.periodLabel}
                                </div>
                              </div>
                              <Badge variant={run.status === "SUBMITTED" ? "success" : "secondary"}>{run.status}</Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {templateDetailQuery.data.versions[0].domains.map((domain) => (
                      <div className="rounded-[1.25rem] border bg-muted/20 p-4" key={domain.id}>
                        <div className="font-semibold">{domain.title}</div>
                        <div className="mt-3 space-y-3">
                          {domain.questions.map((question) => (
                            <div key={question.id}>
                              <div className="font-medium">{question.prompt}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {question.levels.map((level) => (
                                  <Badge key={`${question.id}-${level.value}`} variant="secondary">
                                    {level.label} ({level.value})
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">Select a template to preview its latest version.</div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

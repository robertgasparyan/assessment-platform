import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { Category, Level, LibraryDomain, LibraryQuestion } from "@/types";

const defaultLevelLabels = ["Initial", "Developing", "Intermediate", "Advanced", "Optimized", "Leading", "Transformative"];

function buildLevels(count: number, previous: Level[] = []): Level[] {
  return Array.from({ length: count }, (_, index) => {
    const existing = previous[index];
    return {
      value: index + 1,
      label: existing?.label || defaultLevelLabels[index] || `Level ${index + 1}`,
      description: existing?.description || ""
    };
  });
}

function createEmptyQuestion(levelCount = 5) {
  return {
    title: "",
    prompt: "",
    guidance: "",
    levels: buildLevels(levelCount)
  };
}

function createEmptyDomain() {
  return {
    title: "",
    description: "",
    questions: [] as Array<Omit<LibraryQuestion, "id">>
  };
}

function isQuestionComplete(question: { title: string; prompt: string; levels: Level[] }) {
  return Boolean(
    question.title.trim()
      && question.prompt.trim()
      && question.levels.length >= 2
      && question.levels.every((level) => level.label.trim() && level.description.trim())
  );
}

function isDomainComplete(domain: { title: string; questions: Array<Omit<LibraryQuestion, "id">> }) {
  return Boolean(domain.title.trim() && domain.questions.length > 0 && domain.questions.every(isQuestionComplete));
}

export function LibrariesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("categories");
  const [pendingDelete, setPendingDelete] = useState<null | { kind: "category" | "question" | "domain"; id: string; name: string }>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });
  const [categoryEditId, setCategoryEditId] = useState<string | null>(null);
  const [questionForm, setQuestionForm] = useState(createEmptyQuestion());
  const [questionEditId, setQuestionEditId] = useState<string | null>(null);
  const [questionSearch, setQuestionSearch] = useState("");
  const [domainQuestionSearch, setDomainQuestionSearch] = useState("");
  const [domainSearch, setDomainSearch] = useState("");
  const [domainForm, setDomainForm] = useState(createEmptyDomain());
  const [domainEditId, setDomainEditId] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<Category[]>("/categories")
  });
  const questionsQuery = useQuery({
    queryKey: ["question-library"],
    queryFn: () => api.get<LibraryQuestion[]>("/question-library")
  });
  const domainsQuery = useQuery({
    queryKey: ["domain-library"],
    queryFn: () => api.get<LibraryDomain[]>("/domain-library")
  });

  const filteredQuestions = useMemo(() => {
    const query = questionSearch.trim().toLowerCase();
    return (questionsQuery.data ?? []).filter((question) =>
      !query
      || question.title.toLowerCase().includes(query)
      || question.prompt.toLowerCase().includes(query)
      || (question.guidance ?? "").toLowerCase().includes(query)
    );
  }, [questionSearch, questionsQuery.data]);

  const filteredDomains = useMemo(() => {
    const query = domainSearch.trim().toLowerCase();
    return (domainsQuery.data ?? []).filter((domain) =>
      !query
      || domain.title.toLowerCase().includes(query)
      || (domain.description ?? "").toLowerCase().includes(query)
    );
  }, [domainSearch, domainsQuery.data]);

  const availableDomainQuestions = useMemo(() => {
    const query = domainQuestionSearch.trim().toLowerCase();
    return (questionsQuery.data ?? []).filter((question) => {
      if (domainForm.questions.some((item) => item.prompt === question.prompt && item.title === question.title)) {
        return false;
      }

      return (
        !query
        || question.title.toLowerCase().includes(query)
        || question.prompt.toLowerCase().includes(query)
        || (question.guidance ?? "").toLowerCase().includes(query)
      );
    });
  }, [domainForm.questions, domainQuestionSearch, questionsQuery.data]);

  const saveCategoryMutation = useMutation({
    mutationFn: () =>
      categoryEditId
        ? api.put(`/categories/${categoryEditId}`, categoryForm)
        : api.post("/categories", categoryForm),
    onSuccess: () => {
      toast.success(categoryEditId ? "Category updated" : "Category created");
      setCategoryForm({ name: "", description: "" });
      setCategoryEditId(null);
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/categories/${id}`),
    onSuccess: () => {
      toast.success("Category removed");
      queryClient.invalidateQueries({ queryKey: ["categories"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const saveQuestionMutation = useMutation({
    mutationFn: () =>
      questionEditId
        ? api.put(`/question-library/${questionEditId}`, questionForm)
        : api.post("/question-library", questionForm),
    onSuccess: () => {
      toast.success(questionEditId ? "Question updated" : "Question created");
      setQuestionEditId(null);
      setQuestionForm(createEmptyQuestion());
      queryClient.invalidateQueries({ queryKey: ["question-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/question-library/${id}`),
    onSuccess: () => {
      toast.success("Question removed");
      if (questionEditId) {
        setQuestionEditId(null);
        setQuestionForm(createEmptyQuestion());
      }
      queryClient.invalidateQueries({ queryKey: ["question-library"] });
      queryClient.invalidateQueries({ queryKey: ["domain-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const duplicateQuestionMutation = useMutation({
    mutationFn: (question: LibraryQuestion) =>
      api.post("/question-library", {
        title: `${question.title} Copy`,
        prompt: question.prompt,
        guidance: question.guidance,
        levels: question.levels.map((level) => ({ ...level }))
      }),
    onSuccess: () => {
      toast.success("Question duplicated");
      queryClient.invalidateQueries({ queryKey: ["question-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const saveDomainMutation = useMutation({
    mutationFn: () =>
      domainEditId
        ? api.put(`/domain-library/${domainEditId}`, domainForm)
        : api.post("/domain-library", domainForm),
    onSuccess: () => {
      toast.success(domainEditId ? "Domain updated" : "Domain created");
      setDomainEditId(null);
      setDomainForm(createEmptyDomain());
      setDomainQuestionSearch("");
      queryClient.invalidateQueries({ queryKey: ["domain-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const deleteDomainMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/domain-library/${id}`),
    onSuccess: () => {
      toast.success("Domain removed");
      if (domainEditId) {
        setDomainEditId(null);
        setDomainForm(createEmptyDomain());
      }
      queryClient.invalidateQueries({ queryKey: ["domain-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const duplicateDomainMutation = useMutation({
    mutationFn: (domain: LibraryDomain) =>
      api.post("/domain-library", {
        title: `${domain.title} Copy`,
        description: domain.description,
        questions: domain.questions.map((question) => ({
          title: question.title,
          prompt: question.prompt,
          guidance: question.guidance,
          levels: question.levels.map((level) => ({ ...level }))
        }))
      }),
    onSuccess: () => {
      toast.success("Domain duplicated");
      queryClient.invalidateQueries({ queryKey: ["domain-library"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const questionLevelCount = questionForm.levels.length;
  const questionComplete = isQuestionComplete(questionForm);
  const domainComplete = isDomainComplete(domainForm);

  function confirmDelete() {
    if (!pendingDelete) {
      return;
    }

    if (pendingDelete.kind === "category") {
      deleteCategoryMutation.mutate(pendingDelete.id);
    }

    if (pendingDelete.kind === "question") {
      deleteQuestionMutation.mutate(pendingDelete.id);
    }

    if (pendingDelete.kind === "domain") {
      deleteDomainMutation.mutate(pendingDelete.id);
    }

    setPendingDelete(null);
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Managed libraries</div>
        <h1 className="mt-2 text-4xl font-semibold">Reusable assessment content</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Manage the shared building blocks that template authors compose into assessment frameworks.
        </p>
      </div>

      {pendingDelete ? (
        <Card className="border-border bg-secondary/90">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="font-semibold">Confirm removal</div>
              <div className="text-sm text-muted-foreground">
                Remove {pendingDelete.kind} "{pendingDelete.name}" from the shared library?
              </div>
            </div>
            <div className="flex gap-3">
              <Button onClick={confirmDelete} type="button">
                Confirm remove
              </Button>
              <Button onClick={() => setPendingDelete(null)} type="button" variant="outline">
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="categories">
          <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
            <Card>
              <CardHeader>
                <CardTitle>{categoryEditId ? "Edit category" : "Add category"}</CardTitle>
                <CardDescription>Use managed categories instead of free-text template labels.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={categoryForm.name} onChange={(event) => setCategoryForm((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea value={categoryForm.description} onChange={(event) => setCategoryForm((current) => ({ ...current, description: event.target.value }))} />
                </div>
                <div className="flex gap-3">
                  <Button onClick={() => saveCategoryMutation.mutate()} type="button">
                    {categoryEditId ? "Update category" : "Create category"}
                  </Button>
                  {categoryEditId ? (
                    <Button
                      onClick={() => {
                        setCategoryEditId(null);
                        setCategoryForm({ name: "", description: "" });
                      }}
                      type="button"
                      variant="outline"
                    >
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Category library</CardTitle>
                <CardDescription>These categories can be assigned during template setup.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {(categoriesQuery.data ?? []).map((category) => (
                  <div className="rounded-[1.25rem] border bg-white p-4" key={category.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{category.name}</div>
                        <div className="mt-1 text-sm text-muted-foreground">{category.description || "No description"}</div>
                      </div>
                      <Badge variant="outline">Category</Badge>
                    </div>
                    <div className="mt-3 flex gap-3 text-sm">
                      <button
                        className="font-medium text-primary"
                        onClick={() => {
                          setCategoryEditId(category.id);
                          setCategoryForm({ name: category.name, description: category.description ?? "" });
                        }}
                        type="button"
                      >
                        Edit
                      </button>
                      <button
                        className="font-medium text-muted-foreground"
                        onClick={() => setPendingDelete({ kind: "category", id: category.id, name: category.name })}
                        type="button"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="domains">
          <div className="grid gap-6 xl:grid-cols-[320px,1.2fr,1fr]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Domain library</CardTitle>
                <CardDescription>Browse reusable domain blocks or start a new one.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Search domains" value={domainSearch} onChange={(event) => setDomainSearch(event.target.value)} />
                <Button
                  className="w-full"
                  onClick={() => {
                    setDomainEditId(null);
                    setDomainForm(createEmptyDomain());
                    setDomainQuestionSearch("");
                  }}
                  type="button"
                  variant="outline"
                >
                  New domain
                </Button>
                <div className="space-y-3">
                  {filteredDomains.length ? (
                    filteredDomains.map((domain) => {
                      const selected = domain.id === domainEditId;
                      return (
                        <div
                          className={`w-full rounded-[1.25rem] border p-4 text-left transition ${selected ? "border-primary bg-primary/5" : "bg-white hover:border-primary/40"}`}
                          key={domain.id}
                        >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-semibold">{domain.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{domain.description || "No description"}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="secondary">{domain.usage?.templateCount ?? 0} templates</Badge>
                            <Badge variant="outline">{domain.usage?.draftCount ?? 0} drafts</Badge>
                          </div>
                        </div>
                        <Badge variant="secondary">{domain.questions.length}</Badge>
                      </div>
                          <div className="mt-3 flex gap-3 text-sm">
                            <button
                              className="font-medium text-primary"
                              onClick={() => {
                                setDomainEditId(domain.id);
                                setDomainForm({
                                  title: domain.title,
                                  description: domain.description ?? "",
                                  questions: domain.questions.map((question) => ({
                                    title: question.title,
                                    prompt: question.prompt,
                                    guidance: question.guidance,
                                    levels: question.levels.map((level) => ({ ...level }))
                                  }))
                                });
                              }}
                              type="button"
                            >
                              Open
                            </button>
                            <button
                              className="font-medium text-muted-foreground"
                              onClick={() => duplicateDomainMutation.mutate(domain)}
                              type="button"
                            >
                              Duplicate
                            </button>
                            <button
                              className="font-medium text-muted-foreground"
                              onClick={() => setPendingDelete({ kind: "domain", id: domain.id, name: domain.title })}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed bg-white p-4 text-sm text-muted-foreground">
                      No domains yet. Create one here, or save a completed domain from template authoring.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{domainEditId ? "Edit domain" : "Create domain"}</CardTitle>
                      <CardDescription>Define the domain and curate the questions it should contain.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {domainEditId ? (
                        <>
                          <Badge variant="secondary">
                            {(domainsQuery.data ?? []).find((domain) => domain.id === domainEditId)?.usage?.templateCount ?? 0} templates
                          </Badge>
                          <Badge variant="outline">
                            {(domainsQuery.data ?? []).find((domain) => domain.id === domainEditId)?.usage?.draftCount ?? 0} drafts
                          </Badge>
                        </>
                      ) : null}
                      <Badge variant={domainComplete ? "default" : "outline"}>
                        {domainComplete ? "Library-ready" : "Needs content"}
                      </Badge>
                    <Badge variant="secondary">{domainForm.questions.length} questions</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={domainForm.title} onChange={(event) => setDomainForm((current) => ({ ...current, title: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={domainForm.description} onChange={(event) => setDomainForm((current) => ({ ...current, description: event.target.value }))} />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Selected questions</div>
                      <div className="text-sm text-muted-foreground">Build the domain sequence shown to template authors.</div>
                    </div>
                    {!domainForm.questions.length ? <Badge variant="outline">Empty</Badge> : null}
                  </div>
                  {domainForm.questions.length ? (
                    <div className="space-y-3">
                      {domainForm.questions.map((question, index) => (
                        <div className="rounded-[1.25rem] border bg-white p-4" key={`${question.title}-${question.prompt}-${index}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="font-semibold">{question.title}</div>
                              <div className="mt-1 text-sm text-muted-foreground">{question.prompt}</div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                disabled={index === 0}
                                onClick={() =>
                                  setDomainForm((current) => {
                                    const questions = [...current.questions];
                                    [questions[index - 1], questions[index]] = [questions[index], questions[index - 1]];
                                    return { ...current, questions };
                                  })
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Up
                              </Button>
                              <Button
                                disabled={index === domainForm.questions.length - 1}
                                onClick={() =>
                                  setDomainForm((current) => {
                                    const questions = [...current.questions];
                                    [questions[index + 1], questions[index]] = [questions[index], questions[index + 1]];
                                    return { ...current, questions };
                                  })
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Down
                              </Button>
                              <Button
                                onClick={() =>
                                  setDomainForm((current) => ({
                                    ...current,
                                    questions: current.questions.filter((_, questionIndex) => questionIndex !== index)
                                  }))
                                }
                                size="sm"
                                type="button"
                                variant="outline"
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {question.levels.map((level) => (
                              <Badge key={`${question.title}-${level.value}`} variant="outline">
                                {level.label}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed bg-white p-5 text-sm text-muted-foreground">
                      Add questions from the right panel first. Domains are only saved when they contain complete reusable questions.
                    </div>
                  )}
                </div>

                <div className="flex gap-3">
                  <Button disabled={!domainComplete} onClick={() => saveDomainMutation.mutate()} type="button">
                    {domainEditId ? "Update domain" : "Save domain to library"}
                  </Button>
                  <Button
                    onClick={() => {
                      setDomainEditId(null);
                      setDomainForm(createEmptyDomain());
                      setDomainQuestionSearch("");
                    }}
                    type="button"
                    variant="outline"
                  >
                    {domainEditId ? "Exit edit" : "Clear"}
                  </Button>
                  {domainEditId ? (
                    <Button
                      onClick={() => {
                        const activeDomain = (domainsQuery.data ?? []).find((domain) => domain.id === domainEditId);
                        if (activeDomain) {
                          duplicateDomainMutation.mutate(activeDomain);
                        }
                      }}
                      type="button"
                      variant="outline"
                    >
                      Duplicate
                    </Button>
                  ) : null}
                  {domainEditId ? (
                    <Button
                      onClick={() => setPendingDelete({ kind: "domain", id: domainEditId, name: domainForm.title || "Untitled domain" })}
                      type="button"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Question picker</CardTitle>
                <CardDescription>Add existing reusable questions into the selected domain.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input
                  placeholder="Search questions to add"
                  value={domainQuestionSearch}
                  onChange={(event) => setDomainQuestionSearch(event.target.value)}
                />
                <div className="space-y-3">
                  {availableDomainQuestions.length ? (
                    availableDomainQuestions.map((question) => (
                      <div className="rounded-[1.25rem] border bg-white p-4" key={question.id}>
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">{question.title}</div>
                            <div className="mt-1 text-sm text-muted-foreground">{question.prompt}</div>
                          </div>
                          <Button
                            onClick={() =>
                              setDomainForm((current) => ({
                                ...current,
                                questions: [
                                  ...current.questions,
                                  {
                                    title: question.title,
                                    prompt: question.prompt,
                                    guidance: question.guidance,
                                    levels: question.levels.map((level) => ({ ...level }))
                                  }
                                ]
                              }))
                            }
                            size="sm"
                            type="button"
                            variant="outline"
                          >
                            Add
                          </Button>
                        </div>
                        {question.guidance ? <div className="mt-2 text-sm text-muted-foreground">{question.guidance}</div> : null}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed bg-white p-5 text-sm text-muted-foreground">
                      No available questions match this search. Create questions in the Questions tab, then come back here to compose domains.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="questions">
          <div className="grid gap-6 xl:grid-cols-[320px,1fr]">
            <Card className="h-fit">
              <CardHeader>
                <CardTitle>Question library</CardTitle>
                <CardDescription>Browse reusable questions or start a new one.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Input placeholder="Search questions" value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} />
                <Button
                  className="w-full"
                  onClick={() => {
                    setQuestionEditId(null);
                    setQuestionForm(createEmptyQuestion());
                  }}
                  type="button"
                  variant="outline"
                >
                  New question
                </Button>
                <div className="space-y-3">
                  {filteredQuestions.length ? (
                    filteredQuestions.map((question) => {
                      const selected = question.id === questionEditId;
                      return (
                        <div
                          className={`w-full rounded-[1.25rem] border p-4 text-left transition ${selected ? "border-primary bg-primary/5" : "bg-white hover:border-primary/40"}`}
                          key={question.id}
                        >
                          <div className="font-semibold">{question.title}</div>
                          <div className="mt-1 text-sm text-muted-foreground">{question.prompt}</div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Badge variant="secondary">{question.usage?.templateCount ?? 0} templates</Badge>
                            <Badge variant="outline">{question.usage?.draftCount ?? 0} drafts</Badge>
                            <Badge variant="outline">{question.usage?.domainCount ?? 0} domains</Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {question.levels.map((level) => (
                              <Badge key={`${question.id}-${level.value}`} variant="outline">
                                {level.label}
                              </Badge>
                            ))}
                          </div>
                          <div className="mt-3 flex gap-3 text-sm">
                            <button
                              className="font-medium text-primary"
                              onClick={() => {
                                setQuestionEditId(question.id);
                                setQuestionForm({
                                  title: question.title,
                                  prompt: question.prompt,
                                  guidance: question.guidance ?? "",
                                  levels: question.levels.map((level) => ({ ...level }))
                                });
                              }}
                              type="button"
                            >
                              Open
                            </button>
                            <button
                              className="font-medium text-muted-foreground"
                              onClick={() => duplicateQuestionMutation.mutate(question)}
                              type="button"
                            >
                              Duplicate
                            </button>
                            <button
                              className="font-medium text-muted-foreground"
                              onClick={() => setPendingDelete({ kind: "question", id: question.id, name: question.title })}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[1.25rem] border border-dashed bg-white p-4 text-sm text-muted-foreground">
                      No questions yet. Start here so domains have reusable content to pull from.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle>{questionEditId ? "Edit question" : "Create question"}</CardTitle>
                      <CardDescription>Author a reusable question with a configurable maturity scale.</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {questionEditId ? (
                        <>
                          <Badge variant="secondary">
                            {(questionsQuery.data ?? []).find((question) => question.id === questionEditId)?.usage?.templateCount ?? 0} templates
                          </Badge>
                          <Badge variant="outline">
                            {(questionsQuery.data ?? []).find((question) => question.id === questionEditId)?.usage?.draftCount ?? 0} drafts
                          </Badge>
                          <Badge variant="outline">
                            {(questionsQuery.data ?? []).find((question) => question.id === questionEditId)?.usage?.domainCount ?? 0} domains
                          </Badge>
                        </>
                      ) : null}
                      <Badge variant={questionComplete ? "default" : "outline"}>
                        {questionComplete ? "Library-ready" : "Needs content"}
                      </Badge>
                    <Badge variant="secondary">{questionLevelCount} levels</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={questionForm.title} onChange={(event) => setQuestionForm((current) => ({ ...current, title: event.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Prompt</Label>
                    <Textarea value={questionForm.prompt} onChange={(event) => setQuestionForm((current) => ({ ...current, prompt: event.target.value }))} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Guidance</Label>
                  <Textarea value={questionForm.guidance} onChange={(event) => setQuestionForm((current) => ({ ...current, guidance: event.target.value }))} />
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">Maturity scale</div>
                      <div className="text-sm text-muted-foreground">Adjust the number of selectable levels for this reusable question.</div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        disabled={questionLevelCount <= 2}
                        onClick={() =>
                          setQuestionForm((current) => ({
                            ...current,
                            levels: buildLevels(current.levels.length - 1, current.levels)
                          }))
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Remove level
                      </Button>
                      <Button
                        disabled={questionLevelCount >= 7}
                        onClick={() =>
                          setQuestionForm((current) => ({
                            ...current,
                            levels: buildLevels(current.levels.length + 1, current.levels)
                          }))
                        }
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        Add level
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    {questionForm.levels.map((level) => (
                      <div className="rounded-[1.25rem] border bg-white p-4" key={`question-form-level-${level.value}`}>
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label>Level {level.value} label</Label>
                            <Input
                              value={level.label}
                              onChange={(event) =>
                                setQuestionForm((current) => ({
                                  ...current,
                                  levels: current.levels.map((item) =>
                                    item.value === level.value ? { ...item, label: event.target.value } : item
                                  )
                                }))
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              value={level.description}
                              onChange={(event) =>
                                setQuestionForm((current) => ({
                                  ...current,
                                  levels: current.levels.map((item) =>
                                    item.value === level.value ? { ...item, description: event.target.value } : item
                                  )
                                }))
                              }
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-3">
                  <Button disabled={!questionComplete} onClick={() => saveQuestionMutation.mutate()} type="button">
                    {questionEditId ? "Update question" : "Save question to library"}
                  </Button>
                  <Button
                    onClick={() => {
                      setQuestionEditId(null);
                      setQuestionForm(createEmptyQuestion());
                    }}
                    type="button"
                    variant="outline"
                  >
                    {questionEditId ? "Exit edit" : "Clear"}
                  </Button>
                  {questionEditId ? (
                    <Button
                      onClick={() => {
                        const activeQuestion = (questionsQuery.data ?? []).find((question) => question.id === questionEditId);
                        if (activeQuestion) {
                          duplicateQuestionMutation.mutate(activeQuestion);
                        }
                      }}
                      type="button"
                      variant="outline"
                    >
                      Duplicate
                    </Button>
                  ) : null}
                  {questionEditId ? (
                    <Button
                      onClick={() => setPendingDelete({ kind: "question", id: questionEditId, name: questionForm.title || "Untitled question" })}
                      type="button"
                      variant="outline"
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

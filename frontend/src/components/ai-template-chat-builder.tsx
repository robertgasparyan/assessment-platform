import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, LoaderCircle, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { createClientId } from "@/lib/create-id";
import type { Category, TemplateAiChatDraft, TemplateAiFullDraft } from "@/types";
import type { TemplateAuthoringDraft } from "./template-authoring-studio";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

function templateAiDraftToAuthoringDraft(draft: TemplateAiFullDraft): TemplateAuthoringDraft {
  return {
    name: draft.name,
    slug: draft.slug,
    description: draft.description,
    category: draft.category,
    scoringLabels: draft.scoringLabels,
    domains: draft.domains.map((domain) => ({
      id: createClientId("chat-domain"),
      title: domain.title,
      description: domain.description,
      questions: domain.questions.map((question) => ({
        id: createClientId("chat-question"),
        prompt: question.prompt,
        guidance: question.guidance,
        levels: question.levels.map((level) => ({ ...level }))
      }))
    }))
  };
}

export function AiTemplateChatBuilder({
  categories,
  onContinueToAuthoring,
  onSaveGeneratedDraft
}: {
  categories: Category[];
  onContinueToAuthoring: (draft: TemplateAuthoringDraft) => void;
  onSaveGeneratedDraft: (draft: TemplateAuthoringDraft) => Promise<void> | void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content:
        "Describe the assessment you want to create. I can ask clarifying questions, then generate a normal editable draft for the authoring studio."
    }
  ]);
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("");
  const [scoringLabels, setScoringLabels] = useState(["Initial", "Developing", "Intermediate", "Advanced", "Optimized"]);
  const [generatedDraft, setGeneratedDraft] = useState<TemplateAuthoringDraft | null>(null);
  const [buildNotes, setBuildNotes] = useState<string[]>([]);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const categoryOptions = useMemo(
    () => [{ value: "", label: "Select category" }, ...categories.map((item) => ({ value: item.name, label: item.name }))],
    [categories]
  );

  const chatMutation = useMutation({
    mutationFn: (nextMessages: ChatMessage[]) =>
      api.post<TemplateAiChatDraft>("/templates/ai/chat-draft", {
        messages: nextMessages,
        category,
        scoringLabels
      }),
    onSuccess: (data) => {
      setProviderLabel(data.providerLabel);
      const assistantContent = data.assistantMessage || data.clarifyingQuestions.join("\n");
      setMessages((current) => [...current, { role: "assistant", content: assistantContent }]);

      if (data.status === "draft_ready" && data.draft) {
        const draft = templateAiDraftToAuthoringDraft(data.draft);
        setGeneratedDraft(draft);
        setBuildNotes(data.draft.buildNotes ?? []);
        toast.success("Chat-generated template draft is ready");
      }
    },
    onError: (error: Error) => toast.error(error.message)
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatMutation.isPending, messages]);

  function updateScoreLabel(index: number, value: string) {
    setScoringLabels((current) => current.map((label, labelIndex) => (labelIndex === index ? value : label)));
  }

  function sendMessage(message = input) {
    const content = message.trim();
    if (content.length < 3) {
      return;
    }

    const nextMessages = [...messages, { role: "user" as const, content }];
    setMessages(nextMessages);
    setInput("");
    chatMutation.mutate(nextMessages);
  }

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-[linear-gradient(135deg,_rgba(238,248,232,0.9),_rgba(255,255,255,0.98))]">
        <CardHeader>
          <CardTitle>Chat-Based Template Creation</CardTitle>
          <CardDescription>
            Build a template through conversation. The output is always a normal draft that must be reviewed before publishing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr),320px]">
            <div className="space-y-4">
              <div className="h-[420px] overflow-y-auto rounded-[1.25rem] border bg-white p-4">
                <div className="space-y-3">
                  {messages.map((message, index) => (
                    <div
                      className={`max-w-[88%] rounded-[1.1rem] px-4 py-3 text-sm leading-6 ${
                        message.role === "user"
                          ? "ml-auto bg-primary text-primary-foreground"
                          : "border bg-muted/30 text-foreground"
                      }`}
                      key={`${message.role}-${index}`}
                    >
                      {message.content}
                    </div>
                  ))}
                  {chatMutation.isPending ? (
                    <div className="inline-flex items-center gap-2 rounded-[1.1rem] border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Thinking through the template...
                    </div>
                  ) : null}
                  <div ref={chatEndRef} />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
                <Textarea
                  className="min-h-[84px]"
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                      event.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="Example: Create a vendor risk assessment for procurement teams, focused on security, delivery reliability, and compliance."
                  value={input}
                />
                <Button className="self-end" disabled={chatMutation.isPending || input.trim().length < 3} onClick={() => sendMessage()} type="button">
                  <Send className="mr-2 h-4 w-4" />
                  Send
                </Button>
              </div>

              <div className="flex flex-wrap gap-2">
                {[
                  "Create a cybersecurity maturity assessment for engineering teams.",
                  "Create a vendor onboarding risk assessment for procurement.",
                  "Create a delivery excellence health check for product teams."
                ].map((prompt) => (
                  <Button disabled={chatMutation.isPending} key={prompt} onClick={() => sendMessage(prompt)} size="sm" type="button" variant="outline">
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.25rem] border bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Bot className="h-4 w-4 text-primary" />
                  Generation settings
                </div>
                <div className="mt-4 space-y-3">
                  <div className="space-y-2">
                    <Label>Preferred category</Label>
                    <Select options={categoryOptions} value={category} onChange={(event) => setCategory(event.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Maturity labels</Label>
                    <div className="grid gap-2">
                      {scoringLabels.map((label, index) => (
                        <Input key={`chat-score-${index}`} value={label} onChange={(event) => updateScoreLabel(index, event.target.value)} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[1.25rem] border bg-white p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-semibold text-foreground">Draft output</div>
                  {providerLabel ? <Badge variant="outline">{providerLabel}</Badge> : null}
                </div>
                {generatedDraft ? (
                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="font-semibold text-foreground">{generatedDraft.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {generatedDraft.domains.length} domains ·{" "}
                        {generatedDraft.domains.reduce((sum, domain) => sum + domain.questions.length, 0)} questions
                      </div>
                    </div>
                    {buildNotes.length ? (
                      <div className="space-y-2">
                        {buildNotes.map((note, index) => (
                          <div className="rounded-xl bg-muted/30 px-3 py-2 text-sm text-muted-foreground" key={`chat-build-note-${index}`}>
                            {note}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button onClick={() => onContinueToAuthoring(generatedDraft)} type="button">
                        <Sparkles className="mr-2 h-4 w-4" />
                        Continue in authoring
                      </Button>
                      <Button
                        onClick={async () => {
                          await onSaveGeneratedDraft(generatedDraft);
                        }}
                        type="button"
                        variant="outline"
                      >
                        Save draft
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    The draft will appear here after AI has enough detail to generate it.
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

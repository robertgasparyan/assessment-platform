import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, CornerDownLeft, Loader2, Sparkles, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "@/features/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { AiAssistantHistoryTurn, AiAssistantResponse } from "@/types";

type ChatMessage =
  | {
      role: "user";
      content: string;
    }
  | ({
      role: "assistant";
      content: string;
      followUp?: string;
      providerLabel?: string | null;
      actions?: AiAssistantResponse["actions"];
      items?: AiAssistantResponse["items"];
      error?: boolean;
    });

const starterPrompts = [
  "What assessments are active right now?",
  "What was submitted recently?",
  "What templates do we have?",
  "What is due or overdue?",
  "Take me to reports"
];

export function AiAssistantPanel({
  enabled,
  available
}: {
  enabled: boolean;
  available: boolean;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Ask about active assessments, due work, recent submissions, reports, or templates${user?.role === "ADMIN" || user?.role === "TEMPLATE_MANAGER" ? "" : " that are visible to you"}. I can also take you to the right page.`
    }
  ]);

  const responseMutation = useMutation({
    mutationFn: (payload: { message: string; history: AiAssistantHistoryTurn[] }) =>
      api.post<AiAssistantResponse>("/assistant/respond", {
        message: payload.message,
        currentPath: `${location.pathname}${location.search}`,
        history: payload.history
      }),
    onSuccess: (result) => {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: result.message,
          followUp: result.followUp,
          providerLabel: result.providerLabel,
          actions: result.actions,
          items: result.items
        }
      ]);
    },
    onError: (error: Error) => {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: error.message || "The assistant could not answer right now.",
          error: true
        }
      ]);
      toast.error(error.message || "The assistant could not answer right now.");
    }
  });

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [isOpen, messages, responseMutation.isPending]);

  function buildHistory(nextMessage: string): AiAssistantHistoryTurn[] {
    const priorTurns = messages.map<AiAssistantHistoryTurn>((message) => ({
      role: message.role,
      content: message.content
    }));
    const nextTurn: AiAssistantHistoryTurn = {
      role: "user",
      content: nextMessage
    };

    return [...priorTurns, nextTurn].slice(-8);
  }

  function submitMessage(message: string) {
    const trimmed = message.trim();
    if (!trimmed || responseMutation.isPending || !available) {
      return;
    }

    setMessages((current) => [...current, { role: "user", content: trimmed }]);
    setInput("");
    responseMutation.mutate({
      message: trimmed,
      history: buildHistory(trimmed)
    });
  }

  if (!enabled) {
    return null;
  }

  return (
    <>
      <button
        className={cn(
          "flex items-center gap-3 rounded-[1.25rem] border border-border/80 bg-white/92 px-3 py-2 text-left shadow-sm transition",
          available ? "hover:border-primary/35 hover:bg-white" : "cursor-not-allowed opacity-70"
        )}
        disabled={!available}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <div className="rounded-full bg-primary/10 p-2 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="hidden sm:block">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">AI assistant</div>
          <div className="text-sm font-semibold text-foreground">{available ? "Ask the platform" : "Unavailable"}</div>
        </div>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 bg-slate-950/30 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
          <div
            className="absolute right-0 top-0 flex h-full w-full max-w-[460px] flex-col border-l border-border/80 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-b border-border/80 px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-2xl bg-primary p-3 text-primary-foreground">
                    <Bot className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Assessment AI Assistant</div>
                    <div className="mt-1 text-base font-semibold text-foreground">Read-only platform guidance</div>
                    <div className="text-sm text-muted-foreground">Ask about runs, due work, templates, submissions, reports, and admin areas.</div>
                  </div>
                </div>
                <Button className="h-10 w-10 p-0" onClick={() => setIsOpen(false)} type="button" variant="ghost">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="flex flex-wrap gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    className="rounded-full border border-border/80 bg-muted/25 px-3 py-1.5 text-xs font-medium text-foreground transition hover:border-primary/30 hover:bg-primary/5"
                    key={prompt}
                    onClick={() => submitMessage(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {messages.map((message, index) => (
                <div
                  className={cn("rounded-[1.3rem] border px-4 py-3", message.role === "user" ? "ml-8 bg-primary text-primary-foreground" : "mr-4 bg-white")}
                  key={`${message.role}-${index}`}
                >
                  <div className="text-sm leading-6">{message.content}</div>
                  {message.role === "assistant" && message.followUp ? (
                    <div className="mt-2 text-sm text-muted-foreground">{message.followUp}</div>
                  ) : null}
                  {message.role === "assistant" && message.actions?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.actions.map((action) => (
                        <Button
                          key={action.id}
                          onClick={() => {
                            navigate(action.to);
                            setIsOpen(false);
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {action.label}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                  {message.role === "assistant" && message.items?.length ? (
                    <div className="mt-3 space-y-2">
                      {message.items.map((item) => (
                        <button
                          className="flex w-full items-center justify-between gap-3 rounded-[1rem] border border-border/80 bg-muted/20 px-3 py-3 text-left transition hover:border-primary/25 hover:bg-primary/5"
                          key={item.id}
                          onClick={() => {
                            navigate(item.to);
                            setIsOpen(false);
                          }}
                          type="button"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-foreground">{item.title}</div>
                            <div className="truncate text-sm text-muted-foreground">{item.subtitle}</div>
                          </div>
                          {item.badge ? (
                            <div className="shrink-0 rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                              {item.badge}
                            </div>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {message.role === "assistant" && message.providerLabel ? (
                    <div className="mt-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {message.providerLabel}
                    </div>
                  ) : null}
                </div>
              ))}

              {responseMutation.isPending ? (
                <div className="mr-4 rounded-[1.3rem] border bg-white px-4 py-3 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Thinking through the current platform state...
                  </div>
                </div>
              ) : null}
              <div ref={messagesEndRef} />
            </div>

            <form
              className="border-t border-border/80 px-5 py-4"
              onSubmit={(event) => {
                event.preventDefault();
                submitMessage(input);
              }}
            >
              <div className="flex items-center gap-2">
                <Input
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about active assessments, due work, templates, reports, users, or teams"
                  value={input}
                />
                <Button disabled={!available || responseMutation.isPending || !input.trim()} type="submit">
                  <CornerDownLeft className="mr-2 h-4 w-4" />
                  Ask
                </Button>
              </div>
              {!available ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  The assistant is enabled, but AI configuration is not currently available.
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

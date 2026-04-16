import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Expand, Minimize, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { AssessmentRunDetail } from "@/types";

type ResponseState = Record<string, { selectedValue: number; selectedLabel: string; comment?: string }>;

type FlatQuestion = {
  domainId: string;
  domainTitle: string;
  domainDescription?: string;
  answeredQuestions: number;
  totalQuestions: number;
  question: AssessmentRunDetail["domains"][number]["questions"][number];
};

function getDefaultLevel(question: FlatQuestion["question"]) {
  return question.levels[0] ?? { value: 1, label: "Level 1", description: "" };
}

export function AssessmentPresentationMode({
  run,
  responses,
  activeIndex,
  onActiveIndexChange,
  onClose,
  onSelect,
  onCommentChange,
  readOnly = false
}: {
  run: AssessmentRunDetail;
  responses: ResponseState;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onClose: () => void;
  onSelect: (questionId: string, value: number, label: string) => void;
  onCommentChange: (questionId: string, comment: string) => void;
  readOnly?: boolean;
}) {
  const [isBrowserFullscreen, setIsBrowserFullscreen] = useState(false);
  const flattenedQuestions: FlatQuestion[] = useMemo(
    () =>
      run.domains.flatMap((domain) =>
        domain.questions.map((question) => ({
          domainId: domain.id,
          domainTitle: domain.title,
          domainDescription: domain.description,
          answeredQuestions: domain.answeredQuestions,
          totalQuestions: domain.totalQuestions,
          question
        }))
      ),
    [run.domains]
  );

  const safeIndex = Math.min(Math.max(activeIndex, 0), Math.max(flattenedQuestions.length - 1, 0));
  const current = flattenedQuestions[safeIndex];
  const currentResponse = current ? responses[current.question.id] : undefined;
  const answeredCount = flattenedQuestions.filter((item) => responses[item.question.id]?.selectedValue).length;
  const unansweredCount = Math.max(flattenedQuestions.length - answeredCount, 0);
  const progressPercent = flattenedQuestions.length ? Math.round((answeredCount / flattenedQuestions.length) * 100) : 0;
  const nextUnansweredIndex = flattenedQuestions.findIndex((item) => !responses[item.question.id]?.selectedValue);
  const currentDomainQuestions = useMemo(
    () => flattenedQuestions.filter((item) => item.domainId === current?.domainId),
    [current?.domainId, flattenedQuestions]
  );
  const currentDomainAnsweredCount = currentDomainQuestions.filter((item) => responses[item.question.id]?.selectedValue).length;
  const currentDomainProgressPercent = currentDomainQuestions.length
    ? Math.round((currentDomainAnsweredCount / currentDomainQuestions.length) * 100)
    : 0;
  const nextUnansweredInDomain = currentDomainQuestions.find((item) => !responses[item.question.id]?.selectedValue) ?? null;
  const nextUnansweredInDomainIndex = nextUnansweredInDomain
    ? flattenedQuestions.findIndex((item) => item.question.id === nextUnansweredInDomain.question.id)
    : -1;
  const domainAgenda = useMemo(
    () =>
      run.domains.map((domain) => {
        const domainQuestions = flattenedQuestions.filter((item) => item.domainId === domain.id);
        const answered = domainQuestions.filter((item) => responses[item.question.id]?.selectedValue).length;
        const firstQuestionIndex = flattenedQuestions.findIndex((item) => item.domainId === domain.id);
        const firstUnansweredIndex = flattenedQuestions.findIndex(
          (item) => item.domainId === domain.id && !responses[item.question.id]?.selectedValue
        );

        return {
          id: domain.id,
          title: domain.title,
          answered,
          total: domainQuestions.length,
          progressPercent: domainQuestions.length ? Math.round((answered / domainQuestions.length) * 100) : 0,
          isCurrent: domain.id === current?.domainId,
          firstQuestionIndex,
          firstUnansweredIndex
        };
      }),
    [current?.domainId, flattenedQuestions, responses, run.domains]
  );

  useEffect(() => {
    function handleFullscreenChange() {
      setIsBrowserFullscreen(Boolean(document.fullscreenElement));
    }

    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "ArrowRight" && safeIndex < flattenedQuestions.length - 1) {
        onActiveIndexChange(safeIndex + 1);
      }

      if (event.key === "ArrowLeft" && safeIndex > 0) {
        onActiveIndexChange(safeIndex - 1);
      }

      if (event.key === "Escape" && document.fullscreenElement) {
        void document.exitFullscreen();
      }
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    window.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [flattenedQuestions.length, onActiveIndexChange, safeIndex]);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await document.documentElement.requestFullscreen();
  }

  async function handleClose() {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
    onClose();
  }

  if (!current) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#f4f4f4]">
      <div className="flex h-full flex-col">
        <div className="border-b border-border/80 bg-white/95 px-6 py-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span className="rounded-full bg-primary/10 px-3 py-1 font-medium text-primary">Presentation mode</span>
                <span>{run.team.name}</span>
                <span>{run.periodLabel}</span>
                <span>
                  Question {safeIndex + 1} of {flattenedQuestions.length}
                </span>
                <Badge variant={unansweredCount ? "secondary" : "success"}>
                  {unansweredCount ? `${unansweredCount} unanswered` : "All answered"}
                </Badge>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{current.domainTitle}</div>
                <h2 className="mt-2 text-3xl font-semibold text-foreground">{current.question.prompt}</h2>
                {current.question.guidance ? (
                  <p className="mt-3 max-w-5xl text-base leading-7 text-muted-foreground">{current.question.guidance}</p>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {nextUnansweredIndex >= 0 ? (
                <Button onClick={() => onActiveIndexChange(nextUnansweredIndex)} type="button" variant="outline">
                  <SkipForward className="mr-2 h-4 w-4" />
                  Next unanswered
                </Button>
              ) : null}
              <Button onClick={() => void toggleFullscreen()} type="button" variant="outline">
                {isBrowserFullscreen ? <Minimize className="mr-2 h-4 w-4" /> : <Expand className="mr-2 h-4 w-4" />}
                {isBrowserFullscreen ? "Exit fullscreen" : "Fullscreen"}
              </Button>
              <Button onClick={() => void handleClose()} type="button" variant="outline">
                <X className="mr-2 h-4 w-4" />
                Exit mode
              </Button>
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
              <span>Overall progress</span>
              <span>
                {answeredCount}/{flattenedQuestions.length} answered · {unansweredCount} remaining · {progressPercent}%
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted">
              <div className="h-2.5 rounded-full bg-primary transition-all" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 gap-6 overflow-hidden px-6 py-6 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
          <div className="min-h-0 overflow-auto rounded-[2rem] border border-border/80 bg-white p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Domain agenda</div>
                <div className="mt-2 text-lg font-semibold text-foreground">Facilitator view</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Stay oriented across domains and jump directly to the next topic gap.
                </div>
              </div>

              <div className="space-y-3">
                {domainAgenda.map((domain) => (
                  <button
                    className={`w-full rounded-[1.35rem] border p-4 text-left transition ${
                      domain.isCurrent
                        ? "border-primary bg-primary/8 shadow-sm"
                        : "border-border/80 bg-white hover:border-primary/30 hover:bg-primary/5"
                    }`}
                    key={domain.id}
                    onClick={() =>
                      onActiveIndexChange(
                        domain.firstUnansweredIndex >= 0
                          ? domain.firstUnansweredIndex
                          : Math.max(domain.firstQuestionIndex, 0)
                      )
                    }
                    type="button"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground">{domain.title}</div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {domain.answered}/{domain.total} answered
                        </div>
                      </div>
                      <Badge variant={domain.answered === domain.total ? "success" : domain.isCurrent ? "default" : "secondary"}>
                        {domain.answered === domain.total ? "Done" : domain.isCurrent ? "Current" : "Open"}
                      </Badge>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-muted">
                      <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${domain.progressPercent}%` }} />
                    </div>
                    <div className="mt-3 text-xs text-muted-foreground">
                      {domain.firstUnansweredIndex >= 0 ? "Jump to next unanswered in this domain" : "All questions in this domain are answered"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto rounded-[2rem] border border-border/80 bg-white p-6 shadow-sm">
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {current.question.levels.map((level) => {
                const selected = currentResponse?.selectedValue === level.value;
                return (
                  <button
                    className={`flex min-h-[220px] flex-col rounded-[1.5rem] border p-6 text-left transition ${
                      selected
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : "border-border/80 bg-[#f4f4f4] hover:border-primary/40 hover:bg-primary/5"
                    } ${readOnly ? "cursor-default" : ""}`}
                    disabled={readOnly}
                    key={level.value}
                    onClick={() => onSelect(current.question.id, level.value, level.label)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-lg font-semibold">
                        {level.label} ({level.value})
                      </div>
                      {selected ? <Check className="h-5 w-5" /> : null}
                    </div>
                    <div className={`mt-4 text-base leading-7 ${selected ? "text-primary-foreground/95" : "text-foreground/85"}`}>
                      {level.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-h-0 overflow-auto rounded-[2rem] border border-border/80 bg-white p-6 shadow-sm">
            <div className="space-y-6">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Domain progress</div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {current.domainTitle} · {currentDomainAnsweredCount}/{currentDomainQuestions.length} answered
                </div>
                {current.domainDescription ? (
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{current.domainDescription}</p>
                ) : null}
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    <span>Current domain</span>
                    <span>{currentDomainProgressPercent}% complete</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted">
                    <div className="h-2.5 rounded-full bg-primary transition-all" style={{ width: `${currentDomainProgressPercent}%` }} />
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge variant="outline">{currentDomainQuestions.length} questions in domain</Badge>
                  <Badge variant={nextUnansweredInDomain ? "secondary" : "success"}>
                    {nextUnansweredInDomain ? "Domain still has gaps" : "Domain complete"}
                  </Badge>
                </div>
              </div>

              {nextUnansweredInDomainIndex >= 0 ? (
                <div className="rounded-[1.5rem] border border-primary/20 bg-primary/5 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Recommended next step</div>
                  <div className="mt-2 text-sm text-foreground">
                    Jump to the next unanswered question in this domain to keep the discussion moving in one topic area.
                  </div>
                  <Button className="mt-4 w-full" onClick={() => onActiveIndexChange(nextUnansweredInDomainIndex)} type="button" variant="outline">
                    <SkipForward className="mr-2 h-4 w-4" />
                    Next unanswered in domain
                  </Button>
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-sm font-medium text-foreground">Collaborative note</div>
                <Textarea
                  className="min-h-[180px]"
                  disabled={readOnly}
                  onChange={(event) => onCommentChange(current.question.id, event.target.value)}
                  placeholder="Capture context, disagreements, follow-up notes, or rationale for the selected answer."
                  value={currentResponse?.comment ?? ""}
                />
              </div>

              <div className="rounded-[1.5rem] border border-border/80 bg-muted/35 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Selected answer</div>
                <div className="mt-2 text-lg font-semibold text-foreground">
                  {currentResponse ? `${currentResponse.selectedLabel} (${currentResponse.selectedValue})` : "Nothing selected yet"}
                </div>
                <div className="mt-2 text-sm text-muted-foreground">
                  {currentResponse ? "This selection is already part of the live run draft." : "Pick a maturity level to move this question into the answered set."}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={safeIndex === 0}
                  onClick={() => onActiveIndexChange(safeIndex - 1)}
                  type="button"
                  variant="outline"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  disabled={safeIndex === flattenedQuestions.length - 1}
                  onClick={() => onActiveIndexChange(safeIndex + 1)}
                  type="button"
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>

              <div className="rounded-[1.5rem] border border-border/80 bg-muted/35 p-4 text-sm text-muted-foreground">
                Keyboard shortcuts: <span className="font-semibold text-foreground">Left</span> and <span className="font-semibold text-foreground">Right</span> arrows move between questions.
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Question navigator</div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-primary">Answered</span>
                  <span className="rounded-full border border-border/80 bg-white px-2.5 py-1">Unanswered</span>
                  <span className="rounded-full bg-primary px-2.5 py-1 text-primary-foreground">Current</span>
                </div>
                <div className="grid grid-cols-5 gap-2">
                  {flattenedQuestions.map((item, index) => {
                    const selected = index === safeIndex;
                    const answered = Boolean(responses[item.question.id]?.selectedValue);

                    return (
                      <button
                        className={`rounded-xl border px-3 py-2 text-sm font-medium transition ${
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : answered
                              ? "border-primary/20 bg-primary/5 text-primary"
                              : "border-border/80 bg-white text-muted-foreground hover:border-primary/35"
                        }`}
                        key={item.question.id}
                        onClick={() => onActiveIndexChange(index)}
                        type="button"
                      >
                        {index + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

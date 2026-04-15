import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, PlugZap, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AiProvider, AiSettingsSummary } from "@/types";

type EditableProviderConfig = {
  enabled: boolean;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
  hasApiKey: boolean;
};

type EditableAiConfig = {
  enabled: boolean;
  activeProvider: AiProvider;
  showProviderToUsers: boolean;
  providers: Record<AiProvider, EditableProviderConfig>;
};

const providerLabels: Record<AiProvider, string> = {
  ollama: "Ollama",
  openai: "OpenAI",
  claude: "Claude",
  gemini: "Gemini"
};

function buildEditableConfig(settings: AiSettingsSummary): EditableAiConfig {
  return {
    enabled: settings.enabled,
    activeProvider: settings.activeProvider,
    showProviderToUsers: settings.showProviderToUsers,
    providers: {
      ollama: {
        enabled: settings.providers.ollama.enabled,
        baseUrl: settings.providers.ollama.baseUrl,
        model: settings.providers.ollama.model,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: settings.providers.ollama.hasApiKey
      },
      openai: {
        enabled: settings.providers.openai.enabled,
        baseUrl: settings.providers.openai.baseUrl,
        model: settings.providers.openai.model,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: settings.providers.openai.hasApiKey
      },
      claude: {
        enabled: settings.providers.claude.enabled,
        baseUrl: settings.providers.claude.baseUrl,
        model: settings.providers.claude.model,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: settings.providers.claude.hasApiKey
      },
      gemini: {
        enabled: settings.providers.gemini.enabled,
        baseUrl: settings.providers.gemini.baseUrl,
        model: settings.providers.gemini.model,
        apiKey: "",
        clearApiKey: false,
        hasApiKey: settings.providers.gemini.hasApiKey
      }
    }
  };
}

export function AiConfigurationSection() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<EditableAiConfig | null>(null);

  const aiSettingsQuery = useQuery({
    queryKey: ["ai-configuration"],
    queryFn: () => api.get<AiSettingsSummary>("/settings/ai-configuration")
  });

  useEffect(() => {
    if (aiSettingsQuery.data) {
      setDraft(buildEditableConfig(aiSettingsQuery.data));
    }
  }, [aiSettingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<AiSettingsSummary>("/settings/ai-configuration", {
        enabled: draft?.enabled ?? false,
        activeProvider: draft?.activeProvider ?? "ollama",
        showProviderToUsers: draft?.showProviderToUsers ?? false,
        providers: draft?.providers
      }),
    onSuccess: async (data) => {
      setDraft(buildEditableConfig(data));
      await queryClient.invalidateQueries({ queryKey: ["ai-configuration"] });
      await queryClient.invalidateQueries({ queryKey: ["ai-status"] });
      toast.success("AI settings updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const testMutation = useMutation({
    mutationFn: async (provider: AiProvider) =>
      api.post<{ ok: boolean; message: string }>("/settings/ai-configuration/test", {
        provider,
        config: draft?.providers[provider]
      }),
    onSuccess: (data) => toast.success(data.message),
    onError: (error: Error) => toast.error(error.message)
  });

  const activeProviderEnabled = useMemo(
    () => (draft ? draft.providers[draft.activeProvider].enabled : false),
    [draft]
  );

  if (!draft) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>AI Configuration</CardTitle>
          <CardDescription>Loading AI settings...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-white to-accent/40">
        <CardTitle>AI Configuration</CardTitle>
        <CardDescription>
          Control the global AI switch, the active provider, and future provider readiness. When AI is disabled here, all AI-related features must remain unavailable.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-4 xl:grid-cols-[1.05fr,0.95fr]">
          <div className="space-y-4 rounded-[1.35rem] border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white p-3 text-primary shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">Global AI controls</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Keep AI off until the provider configuration is ready. Turning AI off here should hide every AI feature path in the product.
                </div>
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-white px-4 py-3 text-sm text-muted-foreground">
              <input
                checked={draft?.enabled ?? false}
                onChange={(event) => setDraft((current) => current ? { ...current, enabled: event.target.checked } : current)}
                type="checkbox"
              />
              <span>
                <span className="font-semibold text-foreground">Enable AI globally</span>
                <span className="mt-1 block text-xs">When disabled, all AI features should be hidden across the product.</span>
              </span>
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Active provider</Label>
                <Select
                  options={(Object.keys(providerLabels) as AiProvider[]).map((provider) => ({
                    value: provider,
                    label: providerLabels[provider]
                  }))}
                  value={draft?.activeProvider ?? "ollama"}
                  onChange={(event) =>
                    setDraft((current) => current ? { ...current, activeProvider: event.target.value as AiProvider } : current)
                  }
                />
                {!activeProviderEnabled ? <div className="text-xs text-amber-700">The selected active provider is currently disabled.</div> : null}
              </div>

              <label className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-white px-4 py-3 text-sm text-muted-foreground">
                <input
                  checked={draft?.showProviderToUsers ?? false}
                  onChange={(event) => setDraft((current) => current ? { ...current, showProviderToUsers: event.target.checked } : current)}
                  type="checkbox"
                />
                <span>
                  <span className="font-semibold text-foreground">Show active provider to users</span>
                  <span className="mt-1 block text-xs">When enabled, the current AI provider can be shown in the app shell/profile area.</span>
                </span>
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button disabled={!draft || saveMutation.isPending} onClick={() => saveMutation.mutate()} type="button">
                {saveMutation.isPending ? "Saving..." : "Save AI settings"}
              </Button>
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white p-3 text-amber-700 shadow-sm">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Guardrails for this first AI release</div>
                <div>The admin master switch is the source of truth. If it is off, AI functionality should not be reachable anywhere else.</div>
                <div>Provider API keys are intended to be stored encrypted in the database, with optional `.env` defaults available for bootstrap.</div>
                <div>Connection tests only validate connectivity and model access. They do not run full feature workflows yet.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {(Object.keys(draft.providers) as AiProvider[]).map((provider) => {
            const providerDraft = draft.providers[provider];
            const storedProvider = aiSettingsQuery.data?.providers[provider];
            const requiresApiKey = provider !== "ollama";

            return (
              <div className="rounded-[1.35rem] border border-border/80 bg-white p-4" key={provider}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className={`rounded-2xl p-3 shadow-sm ${draft.activeProvider === provider ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                      <Bot className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-base font-semibold text-foreground">{providerLabels[provider]}</div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {provider === "ollama"
                          ? "Default local-network inference provider."
                          : "Optional hosted provider kept ready for future switching."}
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-sm text-muted-foreground">
                    <input
                      checked={providerDraft.enabled}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                providers: {
                                  ...current.providers,
                                  [provider]: { ...current.providers[provider], enabled: event.target.checked }
                                }
                              }
                            : current
                        )
                      }
                      type="checkbox"
                    />
                    Enabled
                  </label>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <Label>Base URL</Label>
                    <Input
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                providers: {
                                  ...current.providers,
                                  [provider]: { ...current.providers[provider], baseUrl: event.target.value }
                                }
                              }
                            : current
                        )
                      }
                      value={providerDraft.baseUrl}
                    />
                    <div className="text-xs text-muted-foreground">Source: {storedProvider?.source.baseUrl === "admin" ? "Admin override" : "Environment default"}</div>
                  </div>

                  <div className="space-y-2">
                    <Label>Model</Label>
                    <Input
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                providers: {
                                  ...current.providers,
                                  [provider]: { ...current.providers[provider], model: event.target.value }
                                }
                              }
                            : current
                        )
                      }
                      value={providerDraft.model}
                    />
                    <div className="text-xs text-muted-foreground">Source: {storedProvider?.source.model === "admin" ? "Admin override" : "Environment default"}</div>
                  </div>

                  {requiresApiKey ? (
                    <div className="space-y-2">
                      <Label>API key</Label>
                      <Input
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  providers: {
                                    ...current.providers,
                                    [provider]: {
                                      ...current.providers[provider],
                                      apiKey: event.target.value,
                                      clearApiKey: false
                                    }
                                  }
                                }
                              : current
                          )
                        }
                        placeholder={providerDraft.hasApiKey ? "Stored key present. Enter a new key only to replace it." : "Enter API key"}
                        type="password"
                        value={providerDraft.apiKey}
                      />
                      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
                        <span>Stored key: {providerDraft.hasApiKey ? "present" : "not set"}</span>
                        <label className="flex items-center gap-2">
                          <input
                            checked={providerDraft.clearApiKey}
                            onChange={(event) =>
                              setDraft((current) =>
                                current
                                  ? {
                                      ...current,
                                      providers: {
                                        ...current.providers,
                                        [provider]: {
                                          ...current.providers[provider],
                                          clearApiKey: event.target.checked,
                                          apiKey: event.target.checked ? "" : current.providers[provider].apiKey
                                        }
                                      }
                                    }
                                  : current
                              )
                            }
                            type="checkbox"
                          />
                          Clear stored key
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[1rem] border border-border/70 bg-muted/20 p-3 text-sm text-muted-foreground">
                      Ollama does not require an API key in this configuration model.
                    </div>
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button
                    disabled={testMutation.isPending}
                    onClick={() => testMutation.mutate(provider)}
                    type="button"
                    variant="outline"
                  >
                    <PlugZap className="mr-2 h-4 w-4" />
                    {testMutation.isPending ? "Testing..." : "Test connection"}
                  </Button>
                  {draft.activeProvider === provider ? (
                    <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">Active provider</span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

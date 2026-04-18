import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useAiAssistantSettings } from "@/hooks/use-ai-assistant-settings";
import type { AiAssistantSettings } from "@/types";

export function AiAssistantSection() {
  const queryClient = useQueryClient();
  const assistantSettingsQuery = useAiAssistantSettings();

  const saveMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<AiAssistantSettings>("/settings/ai-assistant", {
        enabled
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ai-assistant-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["ai-status"] })
      ]);
      toast.success("AI assistant settings updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const enabled = assistantSettingsQuery.data?.enabled ?? false;
  const available = assistantSettingsQuery.data?.available ?? false;

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI assistant</CardTitle>
        <CardDescription>
          Control whether the shell-level Assessment AI Assistant is available to signed-in users. It requires AI features to be configured and enabled.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-white px-4 py-3 text-sm text-muted-foreground">
          <input
            checked={enabled}
            disabled={assistantSettingsQuery.isLoading || saveMutation.isPending}
            onChange={(event) => saveMutation.mutate(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="font-semibold text-foreground">Enable Assessment AI Assistant</span>
            <span className="mt-1 block text-xs">
              Adds a read-only assistant in the app shell for questions about active assessments, recent submissions, templates, and reports.
            </span>
          </span>
        </label>
        <div className="text-xs text-muted-foreground">
          Status:{" "}
          <span className="font-semibold text-foreground">
            {enabled ? (available ? "Ready for users" : "Enabled, but AI is not currently available") : "Disabled"}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

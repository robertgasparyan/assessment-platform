import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { AiAssistantSettings } from "@/types";

export function useAiAssistantSettings() {
  return useQuery({
    queryKey: ["ai-assistant-settings"],
    queryFn: () => api.get<AiAssistantSettings>("/settings/ai-assistant"),
    staleTime: 60_000
  });
}

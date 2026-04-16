import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { useNavigationSearchSettings } from "@/hooks/use-navigation-search-settings";
import type { NavigationSearchSettings } from "@/types";

export function NavigationSearchSection() {
  const queryClient = useQueryClient();
  const navigationSearchQuery = useNavigationSearchSettings();

  const saveMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      api.put<NavigationSearchSettings>("/settings/navigation-search", {
        enabled
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["navigation-search-settings"] });
      toast.success("Spotlight search settings updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Spotlight search</CardTitle>
        <CardDescription>
          Control whether the global command palette is available in the app shell. When enabled, users can open it with `Ctrl+K` or `Cmd+K`.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <label className="flex items-center gap-3 rounded-[1rem] border border-border/70 bg-white px-4 py-3 text-sm text-muted-foreground">
          <input
            checked={navigationSearchQuery.data?.enabled ?? true}
            disabled={navigationSearchQuery.isLoading || saveMutation.isPending}
            onChange={(event) => saveMutation.mutate(event.target.checked)}
            type="checkbox"
          />
          <span>
            <span className="font-semibold text-foreground">Enable spotlight search</span>
            <span className="mt-1 block text-xs">Shows a keyboard-driven quick search for key pages and actions across the platform.</span>
          </span>
        </label>
      </CardContent>
    </Card>
  );
}

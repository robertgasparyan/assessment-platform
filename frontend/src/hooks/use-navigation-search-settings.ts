import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { NavigationSearchSettings } from "@/types";

export function useNavigationSearchSettings() {
  return useQuery({
    queryKey: ["navigation-search-settings"],
    queryFn: () => api.get<NavigationSearchSettings>("/settings/navigation-search"),
    staleTime: 60_000
  });
}

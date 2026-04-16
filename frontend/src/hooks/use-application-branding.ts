import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ApplicationBrandingSettings } from "@/types";

const DEFAULT_APPLICATION_TITLE = "Assessment Platform";

export function useApplicationBranding() {
  const brandingQuery = useQuery({
    queryKey: ["application-branding"],
    queryFn: () => api.get<ApplicationBrandingSettings>("/settings/application-branding"),
    staleTime: 60_000
  });

  const applicationTitle = brandingQuery.data?.applicationTitle?.trim() || DEFAULT_APPLICATION_TITLE;

  useEffect(() => {
    document.title = applicationTitle;
  }, [applicationTitle]);

  return {
    ...brandingQuery,
    applicationTitle,
    defaultApplicationTitle: DEFAULT_APPLICATION_TITLE
  };
}

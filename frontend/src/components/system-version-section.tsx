import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import { frontendBuildInfo } from "@/lib/build-info";
import type { BuildMetadata, HealthStatus } from "@/types";

function formatTimestamp(value: string | null) {
  if (!value) {
    return "Unknown";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function BuildColumn({ label, data }: { label: string; data: BuildMetadata }) {
  return (
    <div className="rounded-[1rem] border bg-white p-4">
      <div className="text-sm font-semibold text-foreground">{label}</div>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        <div><span className="font-medium text-foreground">Version:</span> {data.version}</div>
        <div><span className="font-medium text-foreground">Commit:</span> {data.commit ?? "Unknown"}</div>
        <div><span className="font-medium text-foreground">Built:</span> {formatTimestamp(data.builtAt)}</div>
        <div><span className="font-medium text-foreground">Environment:</span> {data.environment}</div>
      </div>
    </div>
  );
}

export function SystemVersionSection() {
  const healthQuery = useQuery({
    queryKey: ["health-status"],
    queryFn: () => api.get<HealthStatus>("/health")
  });

  const backend = healthQuery.data?.backend ?? null;
  const backendMetadataMissing = Boolean(healthQuery.data && !backend);
  const mismatch = useMemo(() => {
    if (!backend) {
      return false;
    }

    return frontendBuildInfo.version !== backend.version || frontendBuildInfo.commit !== backend.commit;
  }, [backend]);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>System version</CardTitle>
            <CardDescription>Compare frontend and backend build metadata to spot deployment mismatches quickly.</CardDescription>
          </div>
          <Badge variant={healthQuery.isError || backendMetadataMissing || mismatch ? "secondary" : "success"}>
            {healthQuery.isError ? "Health unavailable" : backendMetadataMissing ? "Backend metadata missing" : mismatch ? "Version mismatch" : "Versions aligned"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {healthQuery.isError ? (
          <div className="rounded-[1rem] border border-dashed bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
            Unable to load backend build metadata right now.
          </div>
        ) : null}
        {backendMetadataMissing ? (
          <div className="rounded-[1rem] border border-dashed bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
            The backend health endpoint is responding, but it does not expose build metadata yet.
          </div>
        ) : null}
        <div className="grid gap-4 lg:grid-cols-2">
          <BuildColumn data={frontendBuildInfo} label="Frontend" />
          <BuildColumn
            data={
              backend ?? {
                version: "Unknown",
                commit: null,
                builtAt: null,
                environment: "Unknown"
              }
            }
            label="Backend"
          />
        </div>
        <div className="rounded-[1rem] border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          {backendMetadataMissing
            ? "Backend health is reachable, but the running server is likely older than the version-aware health response."
            : mismatch
            ? "Frontend and backend are not on the same build metadata. This often explains live-only route or feature mismatches."
            : "Matching version and commit values usually mean both layers were deployed from the same build lineage."}
        </div>
      </CardContent>
    </Card>
  );
}

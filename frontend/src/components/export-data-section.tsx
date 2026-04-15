import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileArchive, FileJson, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { api } from "@/lib/api";
import type { AdminExportOptions } from "@/types";

function triggerFileDownload(blob: Blob, filename: string) {
  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(blobUrl);
}

export function ExportDataSection() {
  const [jsonMode, setJsonMode] = useState<"portable" | "full">("portable");
  const [dumpFormat, setDumpFormat] = useState<"custom" | "plain">("custom");

  const exportOptionsQuery = useQuery({
    queryKey: ["admin-export-options"],
    queryFn: () => api.get<AdminExportOptions>("/admin/export-options")
  });

  const downloadJsonMutation = useMutation({
    mutationFn: async () => api.download("/admin/exports/json", { mode: jsonMode }),
    onSuccess: ({ blob, filename }) => {
      triggerFileDownload(blob, filename);
      toast.success(`Downloaded ${filename}`);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const downloadPostgresDumpMutation = useMutation({
    mutationFn: async () => api.download("/admin/exports/postgres-dump", { format: dumpFormat }),
    onSuccess: ({ blob, filename }) => {
      triggerFileDownload(blob, filename);
      toast.success(`Downloaded ${filename}`);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const options = exportOptionsQuery.data;
  const selectedJsonMode = options?.json.modes.find((mode) => mode.value === jsonMode);
  const selectedDumpFormat = options?.postgres.formats.find((format) => format.value === dumpFormat);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-br from-primary/10 via-white to-accent/40">
        <CardTitle>Export And Backup</CardTitle>
        <CardDescription>
          Download a portable JSON export for application-aware data transfer, or a true PostgreSQL dump for full backup and restore workflows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-[1.35rem] border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-white p-3 text-primary shadow-sm">
                <FileJson className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">JSON export</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Application-aware snapshot of the platform data. Portable mode redacts sensitive auth and access tokens. Full mode keeps privileged fields intact.
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <Label>Export mode</Label>
              <Select
                options={(options?.json.modes ?? []).map((mode) => ({ value: mode.value, label: mode.label }))}
                value={jsonMode}
                onChange={(event) => setJsonMode(event.target.value as "portable" | "full")}
              />
              <div className="text-xs text-muted-foreground">{selectedJsonMode?.description ?? "Loading export mode details..."}</div>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Button
                disabled={exportOptionsQuery.isLoading || downloadJsonMutation.isPending}
                onClick={() => downloadJsonMutation.mutate()}
                type="button"
              >
                <Download className="mr-2 h-4 w-4" />
                {downloadJsonMutation.isPending ? "Preparing JSON..." : "Download JSON export"}
              </Button>
            </div>
          </div>

          <div className="rounded-[1.35rem] border border-border/80 bg-white p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-secondary p-3 text-foreground shadow-sm">
                <FileArchive className="h-5 w-5" />
              </div>
              <div>
                <div className="text-base font-semibold text-foreground">PostgreSQL dump</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  True database-level backup generated through `pg_dump`. Use this for full PostgreSQL restore or migration workflows.
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-[1fr,auto]">
              <div className="space-y-2">
                <Label>Dump format</Label>
                <Select
                  options={(options?.postgres.formats ?? []).map((format) => ({ value: format.value, label: format.label }))}
                  value={dumpFormat}
                  onChange={(event) => setDumpFormat(event.target.value as "custom" | "plain")}
                />
                <div className="text-xs text-muted-foreground">{selectedDumpFormat?.description ?? "Loading dump format details..."}</div>
              </div>
              <div className="flex items-end">
                <Button
                  disabled={exportOptionsQuery.isLoading || !options?.postgres.available || downloadPostgresDumpMutation.isPending}
                  onClick={() => downloadPostgresDumpMutation.mutate()}
                  type="button"
                  variant="outline"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {downloadPostgresDumpMutation.isPending ? "Preparing dump..." : "Download PostgreSQL dump"}
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="rounded-[1rem] border border-border/70 bg-muted/20 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">pg_dump status</div>
                <div className="mt-2 text-sm font-medium text-foreground">
                  {options?.postgres.available ? "Available on server" : "Unavailable on server"}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {options?.postgres.version ?? options?.postgres.error ?? "Checking pg_dump availability..."}
                </div>
              </div>
              <div className="rounded-[1rem] border border-border/70 bg-muted/20 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Executable</div>
                <div className="mt-2 break-all text-sm font-medium text-foreground">{options?.postgres.executable ?? "pg_dump"}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Checked {options?.postgres.checkedAt ? new Date(options.postgres.checkedAt).toLocaleString() : "-"}
                </div>
              </div>
            </div>

            {!options?.postgres.available ? (
              <div className="mt-4 rounded-[1rem] border border-amber-200 bg-amber-50 p-3 text-sm text-muted-foreground">
                <div className="font-semibold text-foreground">Why the dump button is disabled</div>
                <div className="mt-2">
                  The backend could not execute <code>pg_dump</code>. The exact server check result is shown below.
                </div>
                <div className="mt-3 rounded-xl border border-amber-200 bg-white px-3 py-2 font-mono text-xs text-foreground">
                  {options?.postgres.error ?? "pg_dump availability check has not returned yet."}
                </div>
                <div className="mt-3">
                  Fix it by installing PostgreSQL client tools or by setting <code>PG_DUMP_PATH</code> in the root <code>.env</code> to the full executable path, then restart the backend.
                </div>
                <div className="mt-2 rounded-xl border border-border/70 bg-white px-3 py-2 font-mono text-xs text-foreground">
                  PG_DUMP_PATH=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-700" />
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="font-semibold text-foreground">Operational notes</div>
              <div>Full JSON and PostgreSQL dump exports contain privileged data. Treat downloads as backup artifacts, not general-purpose attachments.</div>
              <div>Portable JSON is safer for data portability between systems because it redacts password hashes and live tokens.</div>
              <div>PostgreSQL dump generation depends on `pg_dump` being installed and executable in the backend runtime environment.</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

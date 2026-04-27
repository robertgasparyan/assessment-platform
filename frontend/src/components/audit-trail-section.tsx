import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { AuditLogEntry } from "@/types";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function AuditTrailSection() {
  const [search, setSearch] = useState("");
  const [entityFilter, setEntityFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("all");
  const auditQuery = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => api.get<AuditLogEntry[]>("/audit-logs")
  });

  const filteredLogs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (auditQuery.data ?? []).filter((entry) => {
      const matchesSearch = !query || (
        entry.summary.toLowerCase().includes(query)
        || entry.action.toLowerCase().includes(query)
        || entry.entityType.toLowerCase().includes(query)
        || (entry.actorUser?.displayName ?? "").toLowerCase().includes(query)
      );
      const matchesEntity = entityFilter === "all" || entry.entityType === entityFilter;
      const matchesActor = actorFilter === "all" || (actorFilter === "system" ? !entry.actorUser : entry.actorUser?.id === actorFilter);
      return matchesSearch && matchesEntity && matchesActor;
    });
  }, [actorFilter, auditQuery.data, entityFilter, search]);
  const entityOptions = useMemo(
    () => [
      { value: "all", label: "All entities" },
      ...Array.from(new Set((auditQuery.data ?? []).map((entry) => entry.entityType)))
        .sort()
        .map((entityType) => ({ value: entityType, label: entityType }))
    ],
    [auditQuery.data]
  );
  const actorOptions = useMemo(() => {
    const actors = new Map<string, string>();
    let hasSystem = false;
    for (const entry of auditQuery.data ?? []) {
      if (entry.actorUser) {
        actors.set(entry.actorUser.id, entry.actorUser.displayName);
      } else {
        hasSystem = true;
      }
    }

    return [
      { value: "all", label: "All actors" },
      ...(hasSystem ? [{ value: "system", label: "System" }] : []),
      ...Array.from(actors.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, label]) => ({ value: id, label }))
    ];
  }, [auditQuery.data]);

  function exportFilteredLogs() {
    const escapeCell = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const rows = [
      ["createdAt", "actor", "action", "entityType", "entityId", "summary"],
      ...filteredLogs.map((entry) => [
        entry.createdAt,
        entry.actorUser?.displayName ?? "System",
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.summary
      ])
    ];
    const csv = rows.map((row) => row.map(escapeCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "audit-trail.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const aiLogs = useMemo(
    () => (auditQuery.data ?? []).filter((entry) => entry.entityType === "ai_summary" || entry.action.includes(".ai_")),
    [auditQuery.data]
  );
  const guestLogs = useMemo(
    () =>
      (auditQuery.data ?? []).filter(
        (entry) => entry.entityType === "guest_assessment_link" || entry.action.includes(".guest_")
      ),
    [auditQuery.data]
  );

  const aiSummary = useMemo(() => {
    const byAction = new Map<string, number>();
    for (const entry of aiLogs) {
      byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1);
    }

    return {
      total: aiLogs.length,
      uniqueActions: byAction.size,
      topActions: [...byAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    };
  }, [aiLogs]);
  const guestSummary = useMemo(() => {
    const byAction = new Map<string, number>();
    for (const entry of guestLogs) {
      byAction.set(entry.action, (byAction.get(entry.action) ?? 0) + 1);
    }

    return {
      total: guestLogs.length,
      created: guestLogs.filter((entry) => entry.action === "assessment_run.guest_link_created").length,
      submitted: guestLogs.filter((entry) => entry.action === "assessment_run.guest_submitted").length,
      revoked: guestLogs.filter((entry) => entry.action === "assessment_run.guest_link_revoked").length,
      topActions: [...byAction.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    };
  }, [guestLogs]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>AI activity</CardTitle>
          <CardDescription>Focused transparency view for AI-generated summaries, Q&A, and template-generation actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="text-sm text-muted-foreground">AI audit entries</div>
              <div className="mt-2 text-2xl font-semibold">{aiSummary.total}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="text-sm text-muted-foreground">AI action types</div>
              <div className="mt-2 text-2xl font-semibold">{aiSummary.uniqueActions}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="text-sm text-muted-foreground">Most used AI action</div>
              <div className="mt-2 text-sm font-semibold">{aiSummary.topActions[0]?.[0] ?? "-"}</div>
            </div>
          </div>

          <div className="space-y-2">
            {aiSummary.topActions.map(([action, count]) => (
              <div className="rounded-[1rem] border bg-muted/20 px-4 py-3 text-sm text-muted-foreground" key={action}>
                <span className="font-medium text-foreground">{action}</span> · {count}
              </div>
            ))}
            {!aiSummary.topActions.length ? (
              <div className="rounded-[1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No AI activity has been recorded yet.
              </div>
            ) : null}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {aiLogs.slice(0, 20).map((entry) => (
                <TableRow key={`ai-${entry.id}`}>
                  <TableCell>{formatDate(entry.createdAt)}</TableCell>
                  <TableCell>{entry.actorUser?.displayName ?? "System"}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.summary}</TableCell>
                </TableRow>
              ))}
              {!aiLogs.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    No AI audit activity found yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guest activity</CardTitle>
          <CardDescription>Focused view for external guest invite creation, submissions, revocations, and guest-session events.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="text-sm text-muted-foreground">Guest audit entries</div>
              <div className="mt-2 text-2xl font-semibold">{guestSummary.total}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="text-sm text-muted-foreground">Links created</div>
              <div className="mt-2 text-2xl font-semibold">{guestSummary.created}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="text-sm text-muted-foreground">Guest submissions</div>
              <div className="mt-2 text-2xl font-semibold">{guestSummary.submitted}</div>
            </div>
            <div className="rounded-[1.25rem] border bg-white p-4">
              <div className="text-sm text-muted-foreground">Links revoked</div>
              <div className="mt-2 text-2xl font-semibold">{guestSummary.revoked}</div>
            </div>
          </div>

          <div className="space-y-2">
            {guestSummary.topActions.map(([action, count]) => (
              <div className="rounded-[1rem] border bg-muted/20 px-4 py-3 text-sm text-muted-foreground" key={action}>
                <span className="font-medium text-foreground">{action}</span> · {count}
              </div>
            ))}
            {!guestSummary.topActions.length ? (
              <div className="rounded-[1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
                No guest activity has been recorded yet.
              </div>
            ) : null}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guestLogs.slice(0, 20).map((entry) => (
                <TableRow key={`guest-${entry.id}`}>
                  <TableCell>{formatDate(entry.createdAt)}</TableCell>
                  <TableCell>{entry.actorUser?.displayName ?? "System"}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.summary}</TableCell>
                </TableRow>
              ))}
              {!guestLogs.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>
                    No guest audit activity found yet.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription>Search audit records by summary, action, entity, or actor.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr),220px,220px,auto]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" onChange={(event) => setSearch(event.target.value)} placeholder="Search audit trail" value={search} />
            </div>
            <Select options={entityOptions} value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)} />
            <Select options={actorOptions} value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} />
            <Button onClick={exportFilteredLogs} type="button" variant="outline">
              Export CSV
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatDate(entry.createdAt)}</TableCell>
                  <TableCell>{entry.actorUser?.displayName ?? "System"}</TableCell>
                  <TableCell>{entry.action}</TableCell>
                  <TableCell>{entry.entityType}</TableCell>
                  <TableCell>{entry.summary}</TableCell>
                </TableRow>
              ))}
              {!filteredLogs.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={5}>
                    No audit records match the current search.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

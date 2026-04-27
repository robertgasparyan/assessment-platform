import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { ActiveExternalParticipantLink, SecurityOverview } from "@/types";

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[1rem] border bg-white p-4">
      <div className="text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export function SecurityOverviewSection() {
  const queryClient = useQueryClient();
  const overviewQuery = useQuery({
    queryKey: ["security-overview"],
    queryFn: () => api.get<SecurityOverview>("/security-overview")
  });
  const externalLinksQuery = useQuery({
    queryKey: ["security-external-participant-links"],
    queryFn: () => api.get<ActiveExternalParticipantLink[]>("/security/external-participant-links")
  });

  const clearExpiredSessionsMutation = useMutation({
    mutationFn: () => api.post<{ count: number }>("/security/clear-expired-sessions"),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["security-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["security-external-participant-links"] });
      toast.success(`Cleared ${result.count} expired sessions`);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const clearExpiredInvitesMutation = useMutation({
    mutationFn: () => api.post<{ count: number }>("/security/clear-expired-invites"),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["security-overview"] });
      toast.success(`Cleared ${result.count} expired invites`);
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const overview = overviewQuery.data;
  const activeExternalLinks = externalLinksQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security overview</CardTitle>
        <CardDescription>Review session, activation invite, and external participant-link hygiene.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Metric label="Active sessions" value={overview?.activeSessions ?? 0} />
          <Metric label="Expired sessions to clear" value={overview?.expiredSessions ?? 0} />
          <Metric label="Pending activation invites" value={overview?.pendingInvites ?? 0} />
          <Metric label="Expired invites to clear" value={overview?.expiredInvites ?? 0} />
          <Metric label="Active external participant links" value={overview?.activeExternalParticipantLinks ?? 0} />
          <Metric label="Revoked external participant links" value={overview?.revokedExternalParticipantLinks ?? 0} />
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            disabled={clearExpiredSessionsMutation.isPending}
            onClick={() => clearExpiredSessionsMutation.mutate()}
            type="button"
            variant="outline"
          >
            Clear expired sessions
          </Button>
          <Button
            disabled={clearExpiredInvitesMutation.isPending}
            onClick={() => clearExpiredInvitesMutation.mutate()}
            type="button"
            variant="outline"
          >
            Clear expired invites
          </Button>
        </div>
        <div className="rounded-[1rem] border bg-muted/20 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Active external participant links</div>
              <div className="mt-1 text-sm text-muted-foreground">Open tokenized links that can still be used by outside participants.</div>
            </div>
            <Badge variant="outline">{activeExternalLinks.length} shown</Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Participant</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeExternalLinks.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    <div className="font-medium">{link.displayName}</div>
                    <div className="text-xs text-muted-foreground">
                      {link.email || "No email"}{link.externalContact?.organization ? ` · ${link.externalContact.organization}` : ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>{link.assessmentRun.title}</div>
                    <div className="text-xs text-muted-foreground">{link.assessmentRun.team.name} · {link.assessmentRun.periodLabel}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{link.status}</Badge></TableCell>
                  <TableCell>{link.externalAccessExpiresAt ? new Date(link.externalAccessExpiresAt).toLocaleDateString() : "No expiry"}</TableCell>
                </TableRow>
              ))}
              {!activeExternalLinks.length ? (
                <TableRow>
                  <TableCell className="text-muted-foreground" colSpan={4}>No active external participant links.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

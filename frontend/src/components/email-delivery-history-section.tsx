import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { EmailDeliveryLog } from "@/types";

const typeLabels: Record<string, string> = {
  guest_invite: "Guest invite",
  external_participant_invite: "External participant invite",
  external_participant_reminder: "External participant reminder",
  internal_participant_invite: "Participant invite",
  internal_participant_reminder: "Participant reminder",
  submitted_report: "Submitted report"
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusClass(status: EmailDeliveryLog["status"]) {
  if (status === "SENT") {
    return "bg-primary/10 text-primary";
  }

  if (status === "FAILED") {
    return "bg-red-100 text-red-700";
  }

  return "bg-muted text-muted-foreground";
}

export function EmailDeliveryHistorySection() {
  const [search, setSearch] = useState("");

  const deliveriesQuery = useQuery({
    queryKey: ["email-deliveries"],
    queryFn: () => api.get<EmailDeliveryLog[]>("/email-deliveries")
  });

  const filteredDeliveries = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return deliveriesQuery.data ?? [];
    }

    return (deliveriesQuery.data ?? []).filter((delivery) =>
      [
        delivery.type,
        delivery.status,
        delivery.recipientEmail,
        delivery.recipientName,
        delivery.subject,
        delivery.errorMessage,
        delivery.assessmentRun?.title,
        delivery.assessmentRun?.team.name,
        delivery.createdByUser?.displayName
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    );
  }, [deliveriesQuery.data, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email delivery history</CardTitle>
        <CardDescription>
          Review recent participant invites, guest invites, submitted-report emails, and delivery failures.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            Showing {filteredDeliveries.length} of {deliveriesQuery.data?.length ?? 0} recent delivery attempts
          </div>
          <Input
            className="max-w-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search delivery history..."
            value={search}
          />
        </div>

        <div className="overflow-hidden rounded-[1.25rem] border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Assessment</TableHead>
                <TableHead>Sent / failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDeliveries.map((delivery) => (
                <TableRow key={delivery.id}>
                  <TableCell>
                    <Badge className={statusClass(delivery.status)}>{delivery.status.toLowerCase()}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{delivery.recipientName || delivery.recipientEmail}</div>
                    <div className="text-sm text-muted-foreground">{delivery.recipientEmail}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{typeLabels[delivery.type] ?? delivery.type}</div>
                    <div className="max-w-sm truncate text-sm text-muted-foreground">{delivery.subject}</div>
                    {delivery.errorMessage ? (
                      <div className="mt-1 max-w-sm truncate text-xs text-red-700">{delivery.errorMessage}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {delivery.assessmentRun ? (
                      <>
                        <div className="font-medium">{delivery.assessmentRun.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {delivery.assessmentRun.team.name} · {delivery.assessmentRun.periodLabel}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>{formatDateTime(delivery.sentAt ?? delivery.failedAt)}</div>
                    <div className="text-xs text-muted-foreground">Attempted {formatDateTime(delivery.createdAt)}</div>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredDeliveries.length ? (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={5}>
                    {deliveriesQuery.isLoading ? "Loading delivery history..." : "No email delivery attempts found."}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

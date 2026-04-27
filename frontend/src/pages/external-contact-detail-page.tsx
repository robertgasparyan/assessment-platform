import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import type { ExternalContactDetails } from "@/types";

function formatDate(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function statusVariant(status: string) {
  if (status === "SUBMITTED" || status === "SENT") {
    return "success" as const;
  }
  if (status === "FAILED" || status === "ARCHIVED") {
    return "secondary" as const;
  }
  return "outline" as const;
}

export function ExternalContactDetailPage() {
  const { contactId = "" } = useParams();
  const contactQuery = useQuery({
    queryKey: ["external-contact-details", contactId],
    queryFn: () => api.get<ExternalContactDetails>(`/external-contacts/${contactId}/details`),
    enabled: Boolean(contactId)
  });

  if (contactQuery.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading external contact...</div>;
  }

  if (!contactQuery.data) {
    return <div className="text-sm text-muted-foreground">External contact not found.</div>;
  }

  const { contact, guestLinks, participants } = contactQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">External contact</div>
          <h1 className="mt-2 text-4xl font-semibold">{contact.displayName}</h1>
          <p className="mt-2 text-muted-foreground">
            {contact.email || "No email"}{contact.organization ? ` · ${contact.organization}` : ""}
          </p>
          {contact.notes ? <p className="mt-3 max-w-3xl text-sm text-muted-foreground">{contact.notes}</p> : null}
        </div>
        <Link className={buttonVariants({ variant: "outline" })} to="/administration?tab=contacts">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to contacts
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <div className="text-2xl font-semibold">{participants.length}</div>
            <div className="text-sm text-muted-foreground">Individual participant runs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-2xl font-semibold">{guestLinks.length}</div>
            <div className="text-sm text-muted-foreground">Guest links</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="text-2xl font-semibold">{participants.reduce((sum, participant) => sum + participant.recentEmailDeliveries.length, 0)}</div>
            <div className="text-sm text-muted-foreground">Recent participant emails</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Individual participant history</CardTitle>
          <CardDescription>Runs where this contact was asked to answer as an individual participant.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Participant</TableHead>
                <TableHead>Answers</TableHead>
                <TableHead>Latest email</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {participants.map((participant) => {
                const latestEmail = participant.recentEmailDeliveries[0];
                return (
                  <TableRow key={participant.id}>
                    <TableCell>
                      <Link className="font-medium text-primary" to={`/assessments/${participant.assessmentRun.id}`}>
                        {participant.assessmentRun.title}
                      </Link>
                      <div className="text-xs text-muted-foreground">{participant.assessmentRun.periodLabel}</div>
                    </TableCell>
                    <TableCell>{participant.assessmentRun.team.name}</TableCell>
                    <TableCell><Badge variant={statusVariant(participant.assessmentRun.status)}>{participant.assessmentRun.status}</Badge></TableCell>
                    <TableCell><Badge variant={statusVariant(participant.status)}>{participant.status}</Badge></TableCell>
                    <TableCell>{participant.responseCount}</TableCell>
                    <TableCell>
                      {latestEmail ? (
                        <>
                          <Badge variant={statusVariant(latestEmail.status)}>{latestEmail.status}</Badge>
                          <div className="mt-1 text-xs text-muted-foreground">{latestEmail.type} · {formatDate(latestEmail.sentAt ?? latestEmail.failedAt ?? latestEmail.createdAt)}</div>
                        </>
                      ) : "-"}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!participants.length ? (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={6}>No individual participant history yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Guest link history</CardTitle>
          <CardDescription>Guest links created from this contact.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Assessment</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {guestLinks.map((link) => (
                <TableRow key={link.id}>
                  <TableCell>
                    <Link className="font-medium text-primary" to={`/assessments/${link.assessmentRun.id}`}>
                      {link.assessmentRun.title}
                    </Link>
                    <div className="text-xs text-muted-foreground">{link.assessmentRun.team.name} · {link.assessmentRun.periodLabel}</div>
                  </TableCell>
                  <TableCell>{link.inviteLabel || link.guestDisplayName || "-"}</TableCell>
                  <TableCell><Badge variant={link.submittedAt ? "success" : link.isRevoked ? "secondary" : "outline"}>{link.submittedAt ? "SUBMITTED" : link.isRevoked ? "REVOKED" : "ACTIVE"}</Badge></TableCell>
                  <TableCell>{formatDate(link.createdAt)}</TableCell>
                  <TableCell>{formatDate(link.submittedAt)}</TableCell>
                </TableRow>
              ))}
              {!guestLinks.length ? (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={5}>No guest link history yet.</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

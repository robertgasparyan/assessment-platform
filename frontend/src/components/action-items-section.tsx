import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { AssessmentActionItem, AssessmentResults } from "@/types";

type FormState = {
  title: string;
  description: string;
  domainTitle: string;
  ownerName: string;
  dueDate: string;
  status: AssessmentActionItem["status"];
};

const emptyForm: FormState = {
  title: "",
  description: "",
  domainTitle: "",
  ownerName: "",
  dueDate: "",
  status: "OPEN"
};

function toIsoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(new Date(value));
}

function statusVariant(status: AssessmentActionItem["status"]) {
  if (status === "DONE") {
    return "success" as const;
  }

  if (status === "BLOCKED") {
    return "secondary" as const;
  }

  return status === "IN_PROGRESS" ? ("default" as const) : ("outline" as const);
}

export function ActionItemsSection({ results }: { results: AssessmentResults }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(emptyForm);

  const actionItemsQuery = useQuery({
    queryKey: ["assessment-action-items", results.id],
    queryFn: () => api.get<AssessmentActionItem[]>(`/assessment-runs/${results.id}/action-items`)
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<AssessmentActionItem>(`/assessment-runs/${results.id}/action-items`, {
        title: form.title,
        description: form.description,
        domainTitle: form.domainTitle,
        ownerName: form.ownerName,
        dueDate: form.dueDate ? toIsoDate(form.dueDate) : null,
        status: form.status
      }),
    onSuccess: async () => {
      setForm(emptyForm);
      await queryClient.invalidateQueries({ queryKey: ["assessment-action-items", results.id] });
      toast.success("Action item created");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const updateMutation = useMutation({
    mutationFn: (item: AssessmentActionItem) =>
      api.put<AssessmentActionItem>(`/assessment-runs/${results.id}/action-items/${item.id}`, {
        title: item.title,
        description: item.description ?? "",
        domainTitle: item.domainTitle ?? "",
        ownerName: item.ownerName ?? "",
        dueDate: item.dueDate,
        status: item.status === "DONE" ? "OPEN" : "DONE"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-action-items", results.id] });
      toast.success("Action item updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => api.delete(`/assessment-runs/${results.id}/action-items/${itemId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assessment-action-items", results.id] });
      toast.success("Action item deleted");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const actionItems = actionItemsQuery.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Action plan</CardTitle>
        <CardDescription>Create follow-up actions from this submitted assessment result.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 rounded-[1.25rem] border bg-muted/20 p-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Action title</Label>
            <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Improve evidence collection for domain reviews" />
          </div>
          <div className="space-y-2">
            <Label>Domain</Label>
            <Select
              value={form.domainTitle}
              onChange={(event) => setForm((current) => ({ ...current, domainTitle: event.target.value }))}
              options={[{ value: "", label: "No domain" }, ...results.domains.map((domain) => ({ value: domain.title, label: domain.title }))]}
            />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Input value={form.ownerName} onChange={(event) => setForm((current) => ({ ...current, ownerName: event.target.value }))} placeholder="Owner name" />
          </div>
          <div className="space-y-2">
            <Label>Due date</Label>
            <Input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as FormState["status"] }))}
              options={[
                { value: "OPEN", label: "Open" },
                { value: "IN_PROGRESS", label: "In progress" },
                { value: "BLOCKED", label: "Blocked" },
                { value: "DONE", label: "Done" }
              ]}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} placeholder="What should change before the next assessment?" />
          </div>
          <div className="md:col-span-2">
            <Button disabled={!form.title.trim() || createMutation.isPending} onClick={() => createMutation.mutate()} type="button">
              Add action item
            </Button>
          </div>
        </div>

        {actionItems.length ? (
          <div className="grid gap-3">
            {actionItems.map((item) => (
              <div className="rounded-[1rem] border bg-white p-4" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-foreground">{item.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {item.domainTitle || "No domain"} · Owner {item.ownerName || "unassigned"} · Due {formatDate(item.dueDate)}
                    </div>
                  </div>
                  <Badge variant={statusVariant(item.status)}>{item.status.replace("_", " ").toLowerCase()}</Badge>
                </div>
                {item.description ? <p className="mt-3 text-sm text-muted-foreground">{item.description}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => updateMutation.mutate(item)} type="button">
                    {item.status === "DONE" ? "Reopen" : "Mark done"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(item.id)} type="button">
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-[1rem] border border-dashed px-4 py-6 text-sm text-muted-foreground">
            No action items yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

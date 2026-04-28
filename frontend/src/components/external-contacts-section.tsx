import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api } from "@/lib/api";
import { externalContactsEnabled } from "@/lib/features";
import type { ExternalContact } from "@/types";

type ContactFormState = {
  displayName: string;
  email: string;
  organization: string;
  notes: string;
};

const emptyForm: ContactFormState = {
  displayName: "",
  email: "",
  organization: "",
  notes: ""
};

function toFormState(contact: ExternalContact): ContactFormState {
  return {
    displayName: contact.displayName,
    email: contact.email ?? "",
    organization: contact.organization ?? "",
    notes: contact.notes ?? ""
  };
}

function buildPayload(form: ContactFormState) {
  return {
    displayName: form.displayName.trim(),
    email: form.email.trim(),
    organization: form.organization.trim(),
    notes: form.notes.trim()
  };
}

export function ExternalContactsSection() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ContactFormState>(emptyForm);
  const [search, setSearch] = useState("");
  const [externalContactsUnavailable, setExternalContactsUnavailable] = useState(false);

  const contactsQuery = useQuery({
    queryKey: ["external-contacts"],
    queryFn: async () => {
      if (!externalContactsEnabled) {
        setExternalContactsUnavailable(true);
        return [];
      }

      try {
        setExternalContactsUnavailable(false);
        return await api.get<ExternalContact[]>("/external-contacts");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          setExternalContactsUnavailable(true);
          return [];
        }

        throw error;
      }
    },
    enabled: externalContactsEnabled
  });

  const selectedContact = useMemo(
    () => contactsQuery.data?.find((contact) => contact.id === editingId) ?? null,
    [contactsQuery.data, editingId]
  );

  useEffect(() => {
    if (selectedContact) {
      setForm(toFormState(selectedContact));
    }
  }, [selectedContact]);

  const filteredContacts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return contactsQuery.data ?? [];
    }

    return (contactsQuery.data ?? []).filter((contact) =>
      [contact.displayName, contact.email, contact.organization, contact.notes]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(term))
    );
  }, [contactsQuery.data, search]);

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = buildPayload(form);
      if (editingId) {
        return api.put<ExternalContact>(`/external-contacts/${editingId}`, payload);
      }
      return api.post<ExternalContact>("/external-contacts", payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["external-contacts"] });
      toast.success(editingId ? "External contact updated" : "External contact created");
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.status === 404) {
        toast.error("External contacts are not available until the matching backend is deployed.");
        return;
      }

      toast.error(error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (contactId: string) => api.delete(`/external-contacts/${contactId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["external-contacts"] });
      toast.success("External contact deleted");
      if (editingId) {
        setEditingId(null);
        setForm(emptyForm);
      }
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const isSavingDisabled = !form.displayName.trim() || saveMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>External contacts</CardTitle>
        <CardDescription>
          Maintain reusable external people for guest links, external assessments, and invite tracking.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {externalContactsUnavailable ? (
          <div className="rounded-[1.25rem] border border-dashed bg-muted/20 px-4 py-4 text-sm text-muted-foreground">
            External Contacts is not available on this environment yet. The current frontend expects newer backend routes such as
            {" "}
            <code>/api/external-contacts</code>
            {" "}
            that are not deployed on this server.
          </div>
        ) : null}

        <div className="grid gap-4 rounded-[1.5rem] border bg-muted/20 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <div>
            <div className="text-sm font-semibold">{editingId ? "Edit contact" : "Create contact"}</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Contacts can be reused when creating guest participant links instead of typing names and emails each time.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Display name</Label>
              <Input
                onChange={(event) => setForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="Board reviewer"
                value={form.displayName}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="reviewer@example.com"
                type="email"
                value={form.email}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Organization</Label>
              <Input
                onChange={(event) => setForm((current) => ({ ...current, organization: event.target.value }))}
                placeholder="Vendor, partner, board, or consultant group"
                value={form.organization}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Notes</Label>
              <Textarea
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="Context for admins and assessment owners"
                value={form.notes}
              />
            </div>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button disabled={isSavingDisabled} onClick={() => saveMutation.mutate()} type="button">
                {saveMutation.isPending ? "Saving..." : editingId ? "Save changes" : "Create contact"}
              </Button>
              {editingId ? (
                <Button
                  onClick={() => {
                    setEditingId(null);
                    setForm(emptyForm);
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel edit
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">Contact directory</div>
            <div className="text-sm text-muted-foreground">{contactsQuery.data?.length ?? 0} contacts available</div>
          </div>
          <Input
            className="max-w-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search contacts..."
            value={search}
          />
        </div>

        <div className="overflow-hidden rounded-[1.25rem] border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Contact</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredContacts.map((contact) => {
                const usageTotal = contact.usage?.total ?? 0;
                return (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div className="font-medium">{contact.displayName}</div>
                      <div className="text-sm text-muted-foreground">{contact.email || "No email saved"}</div>
                    </TableCell>
                    <TableCell>{contact.organization || "-"}</TableCell>
                    <TableCell>
                      <div className="text-sm">{usageTotal} linked records</div>
                      <div className="text-xs text-muted-foreground">
                        {contact.usage?.guestLinks ?? 0} guest links · {contact.usage?.participants ?? 0} participants
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        <Button onClick={() => setEditingId(contact.id)} size="sm" type="button" variant="outline">
                          Edit
                        </Button>
                        <Link className={buttonVariants({ size: "sm", variant: "outline" })} to={`/external-contacts/${contact.id}`}>
                          Profile
                        </Link>
                        <Button
                          disabled={usageTotal > 0 || deleteMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete ${contact.displayName}?`)) {
                              deleteMutation.mutate(contact.id);
                            }
                          }}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!filteredContacts.length ? (
                <TableRow>
                  <TableCell className="text-center text-muted-foreground" colSpan={4}>
                    {contactsQuery.isLoading
                      ? "Loading contacts..."
                      : externalContactsUnavailable
                        ? "External contacts are unavailable on this server."
                        : "No external contacts found."}
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

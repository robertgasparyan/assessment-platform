import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { Team } from "@/types";

export function TeamsPage() {
  const queryClient = useQueryClient();
  const [teamForm, setTeamForm] = useState({ name: "", description: "" });
  const [teamEditId, setTeamEditId] = useState<string | null>(null);

  const teamsQuery = useQuery({
    queryKey: ["teams"],
    queryFn: () => api.get<Team[]>("/teams")
  });

  const saveTeamMutation = useMutation({
    mutationFn: () =>
      teamEditId ? api.put(`/teams/${teamEditId}`, teamForm) : api.post("/teams", teamForm),
    onSuccess: () => {
      toast.success(teamEditId ? "Team updated" : "Team created");
      setTeamForm({ name: "", description: "" });
      setTeamEditId(null);
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });
  const deleteTeamMutation = useMutation({
    mutationFn: (teamId: string) => api.delete(`/teams/${teamId}`),
    onSuccess: () => {
      toast.success("Team removed");
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Team directory</div>
        <h1 className="mt-2 text-4xl font-semibold">Teams</h1>
        <p className="mt-2 max-w-3xl text-muted-foreground">
          Maintain the teams that can be assigned to collaborative assessment runs.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-[420px,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{teamEditId ? "Edit team" : "Add team"}</CardTitle>
            <CardDescription>Teams are used when creating assessment runs and comparison views.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={teamForm.name} onChange={(event) => setTeamForm((current) => ({ ...current, name: event.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={teamForm.description} onChange={(event) => setTeamForm((current) => ({ ...current, description: event.target.value }))} />
            </div>
            <div className="flex gap-3">
              <Button onClick={() => saveTeamMutation.mutate()} type="button">
                {teamEditId ? "Update team" : "Create team"}
              </Button>
              {teamEditId ? (
                <Button
                  onClick={() => {
                    setTeamEditId(null);
                    setTeamForm({ name: "", description: "" });
                  }}
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Team list</CardTitle>
            <CardDescription>Use this directory when creating assessments and later for assignment workflows.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(teamsQuery.data ?? []).map((team) => (
              <div className="rounded-[1.25rem] border bg-white p-4" key={team.id}>
                <div className="font-semibold">{team.name}</div>
                <div className="mt-1 text-sm text-muted-foreground">{team.description || "No description"}</div>
                <div className="mt-3 flex gap-3 text-sm">
                  <button
                    className="font-medium text-primary"
                    onClick={() => {
                      setTeamEditId(team.id);
                      setTeamForm({ name: team.name, description: team.description ?? "" });
                    }}
                    type="button"
                  >
                    Edit
                  </button>
                  <button
                    className="font-medium text-muted-foreground"
                    onClick={() => deleteTeamMutation.mutate(team.id)}
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

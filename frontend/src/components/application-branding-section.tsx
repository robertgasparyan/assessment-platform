import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useApplicationBranding } from "@/hooks/use-application-branding";
import type { ApplicationBrandingSettings } from "@/types";

export function ApplicationBrandingSection() {
  const queryClient = useQueryClient();
  const { applicationTitle, defaultApplicationTitle, data } = useApplicationBranding();
  const [draftTitle, setDraftTitle] = useState(applicationTitle);

  useEffect(() => {
    setDraftTitle(applicationTitle);
  }, [applicationTitle]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put<ApplicationBrandingSettings>("/settings/application-branding", {
        applicationTitle: draftTitle.trim()
      }),
    onSuccess: async (settings) => {
      setDraftTitle(settings.applicationTitle);
      await queryClient.invalidateQueries({ queryKey: ["application-branding"] });
      toast.success("Application title updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Application branding</CardTitle>
        <CardDescription>
          Control the platform title shown in the login screen, shell header, and browser title. Leave the default if you do not need custom naming.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Application title</Label>
          <Input maxLength={80} onChange={(event) => setDraftTitle(event.target.value)} value={draftTitle} />
          <div className="text-xs text-muted-foreground">
            Current source: {data?.source === "admin" ? "Admin override" : "Default"} · Default title: {defaultApplicationTitle}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()} type="button">
            {saveMutation.isPending ? "Saving..." : "Save application title"}
          </Button>
          <Button
            disabled={saveMutation.isPending || draftTitle.trim() === defaultApplicationTitle}
            onClick={() => setDraftTitle(defaultApplicationTitle)}
            type="button"
            variant="outline"
          >
            Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

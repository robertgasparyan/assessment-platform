import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import type { ReportEmailDeliverySettings } from "@/types";

export function EmailConfigurationSection() {
  const queryClient = useQueryClient();
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");

  const reportEmailSettingsQuery = useQuery({
    queryKey: ["report-email-delivery-settings"],
    queryFn: () => api.get<ReportEmailDeliverySettings>("/settings/report-email-delivery")
  });

  const updateReportEmailSettingsMutation = useMutation({
    mutationFn: (enabled: boolean) => api.put<ReportEmailDeliverySettings>("/settings/report-email-delivery", { enabled }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["report-email-delivery-settings"] });
      toast.success("Report email delivery settings updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const updateSmtpConfigurationMutation = useMutation({
    mutationFn: () =>
      api.put<ReportEmailDeliverySettings>("/settings/smtp-configuration", {
        host: smtpHost.trim(),
        port: Number(smtpPort),
        from: smtpFrom.trim()
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["report-email-delivery-settings"] });
      toast.success("SMTP settings updated");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  useEffect(() => {
    if (!reportEmailSettingsQuery.data?.smtp) {
      return;
    }

    setSmtpHost(reportEmailSettingsQuery.data.smtp.host);
    setSmtpPort(String(reportEmailSettingsQuery.data.smtp.port));
    setSmtpFrom(reportEmailSettingsQuery.data.smtp.from);
  }, [reportEmailSettingsQuery.data?.smtp?.host, reportEmailSettingsQuery.data?.smtp?.port, reportEmailSettingsQuery.data?.smtp?.from]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email configuration</CardTitle>
        <CardDescription>Control submitted-report delivery and the SMTP settings used by the platform.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-[1.25rem] border border-border/80 bg-muted/25 p-4">
          <label className="flex items-center gap-3 text-sm text-muted-foreground">
            <input
              checked={reportEmailSettingsQuery.data?.enabled ?? false}
              disabled={reportEmailSettingsQuery.isLoading || updateReportEmailSettingsMutation.isPending}
              onChange={(event) => updateReportEmailSettingsMutation.mutate(event.target.checked)}
              type="checkbox"
            />
            Enable submitted report email sending
          </label>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className={`rounded-full px-2.5 py-1 font-medium ${reportEmailSettingsQuery.data?.configured ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              SMTP {reportEmailSettingsQuery.data?.configured ? "configured" : "not configured"}
            </span>
            <span className={`rounded-full px-2.5 py-1 font-medium ${reportEmailSettingsQuery.data?.available ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {reportEmailSettingsQuery.data?.available ? "Available to users" : "Not currently available"}
            </span>
          </div>
        </div>

        {reportEmailSettingsQuery.data?.smtp ? (
          <div className="space-y-4 rounded-[1.25rem] border border-border/80 bg-white p-4 text-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>SMTP host</Label>
                <Input onChange={(event) => setSmtpHost(event.target.value)} value={smtpHost} />
                <div className="text-xs text-muted-foreground">
                  Source: {reportEmailSettingsQuery.data.smtp.source?.host === "admin" ? "Admin override" : "Environment default"}
                </div>
              </div>
              <div className="space-y-2">
                <Label>SMTP port</Label>
                <Input onChange={(event) => setSmtpPort(event.target.value)} type="number" value={smtpPort} />
                <div className="text-xs text-muted-foreground">
                  Source: {reportEmailSettingsQuery.data.smtp.source?.port === "admin" ? "Admin override" : "Environment default"}
                </div>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>From</Label>
                <Input onChange={(event) => setSmtpFrom(event.target.value)} value={smtpFrom} />
                <div className="text-xs text-muted-foreground">
                  Source: {reportEmailSettingsQuery.data.smtp.source?.from === "admin" ? "Admin override" : "Environment default"}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={!smtpHost.trim() || !smtpPort.trim() || !smtpFrom.trim() || updateSmtpConfigurationMutation.isPending}
                onClick={() => updateSmtpConfigurationMutation.mutate()}
                type="button"
              >
                {updateSmtpConfigurationMutation.isPending ? "Saving..." : "Save SMTP settings"}
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Current from</div>
                <div className="mt-1 font-medium">{reportEmailSettingsQuery.data.smtp.from || "-"}</div>
              </div>
              <div>
                <div className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Credentials</div>
                <div className="mt-1 font-medium">
                  User: {reportEmailSettingsQuery.data.smtp.hasUser ? "set" : "not set"} · Password: {reportEmailSettingsQuery.data.smtp.hasPassword ? "set" : "not set"}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

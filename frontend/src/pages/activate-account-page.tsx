import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Radar } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth-context";
import { useApplicationBranding } from "@/hooks/use-application-branding";

export function ActivateAccountPage() {
  const { activateAccount } = useAuth();
  const { applicationTitle } = useApplicationBranding();
  const [searchParams] = useSearchParams();
  const token = useMemo(() => searchParams.get("token") ?? "", [searchParams]);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!token) {
      toast.error("Activation token is missing");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Password confirmation does not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await activateAccount(token, newPassword);
      toast.success("Account activated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Activation failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-md rounded-[2rem] border border-border/80 bg-white/96 p-8 shadow-lg">
        <div className="mb-8 flex items-center gap-4">
          <div className="rounded-[1.25rem] bg-primary p-3 text-primary-foreground shadow-sm">
            <Radar className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">{applicationTitle}</div>
            <h1 className="text-2xl font-semibold text-foreground">Activate account</h1>
          </div>
        </div>

        {token ? (
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Activating..." : "Activate account"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">This activation link is missing a token. Request a fresh invitation from an administrator.</p>
            <Link className="inline-flex w-full items-center justify-center rounded-xl border border-input px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent" to="/">
              Back to sign in
            </Link>
          </div>
        )}
      </Card>
    </div>
  );
}

import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/features/auth-context";

export function ForcePasswordChangePage() {
  const { changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error("New password confirmation does not match");
      return;
    }

    setIsSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password update failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <Card className="w-full max-w-lg rounded-[2rem] border border-border/80 bg-white/96 p-8 shadow-lg">
        <div className="mb-8 flex items-center gap-4">
          <div className="rounded-[1.25rem] bg-primary p-3 text-primary-foreground shadow-sm">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-muted-foreground">First-time sign-in</div>
            <h1 className="text-2xl font-semibold text-foreground">Change your password</h1>
          </div>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="rounded-[1.25rem] border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            Your account requires a password change before you can use the platform.
          </div>
          <div className="space-y-2">
            <Label htmlFor="current-password-required">Current password</Label>
            <Input
              id="current-password-required"
              onChange={(event) => setCurrentPassword(event.target.value)}
              type="password"
              value={currentPassword}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password-required">New password</Label>
            <Input
              id="new-password-required"
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              value={newPassword}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password-required">Confirm new password</Label>
            <Input
              id="confirm-password-required"
              onChange={(event) => setConfirmPassword(event.target.value)}
              type="password"
              value={confirmPassword}
            />
          </div>
          <div className="flex gap-3">
            <Button className="flex-1" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Updating..." : "Update password"}
            </Button>
            <Button
              onClick={() => {
                void logout();
              }}
              type="button"
              variant="outline"
            >
              Logout
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

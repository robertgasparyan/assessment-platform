import { Card, CardContent } from "@/components/ui/card";

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="text-[0.82rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
        <div className="mt-3 text-3xl font-semibold text-foreground">{value}</div>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

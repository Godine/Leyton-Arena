import { cn } from "@/lib/utils";

interface Props {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string | null;
  className?: string;
}

export function StatCard({ icon, label, value, hint, className }: Props) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">{label}</p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-2 font-mono text-hero tabular-nums leading-none">{value}</p>
      <p className="mt-2 min-h-[1.25rem] text-body text-muted-foreground">{hint ?? ""}</p>
    </div>
  );
}

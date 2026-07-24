import { cn } from "@/lib/utils";

export type ProgressTone = "ok" | "warn" | "over";

export function ProgressBar({
  value,
  tone,
}: {
  value: number; // 0-100+
  tone: ProgressTone;
}) {
  const pct = Math.min(100, Math.max(0, value));
  const color =
    tone === "over"
      ? "bg-destructive"
      : tone === "warn"
        ? "bg-amber-500"
        : "bg-emerald-500";

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

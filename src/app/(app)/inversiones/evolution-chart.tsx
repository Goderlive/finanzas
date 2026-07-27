import { formatMoney } from "@/lib/money";
import { formatShortDate } from "@/lib/dates";
import type { EvolutionPoint } from "@/lib/portfolio";

/**
 * Evolución del valor del holding contra lo invertido.
 *
 * Dos series con la paleta del proyecto (`--series-1` valor, `--series-2`
 * costo), validada para daltonismo en claro y oscuro. Llevan leyenda además
 * del color, así que la identidad nunca depende sólo del tono.
 */
export function EvolutionChart({
  points,
  currency,
}: {
  points: EvolutionPoint[];
  currency: string;
}) {
  if (points.length < 2) {
    return (
      <p className="text-xs text-muted-foreground">
        Registra al menos dos precios para ver la evolución.
      </p>
    );
  }

  const W = 300;
  const H = 80;
  const values = points.flatMap((p) => [p.value, p.cost]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  // Un 8% de aire arriba y abajo para que las líneas no toquen el borde.
  const pad = span * 0.08;
  const lo = min - pad;
  const hi = max + pad;

  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
  const path = (key: "value" | "cost") =>
    points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p[key])}`).join(" ");

  const last = points[points.length - 1];
  const first = points[0];
  const up = last.value >= last.cost;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <LegendDot varName="--series-1" label="Valor" />
        <LegendDot varName="--series-2" label="Invertido" />
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-20 w-full overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Evolución del valor de ${formatShortDate(first.date)} a ${formatShortDate(last.date)}: de ${formatMoney(first.value, currency)} a ${formatMoney(last.value, currency)}`}
      >
        <path
          d={path("cost")}
          fill="none"
          stroke="var(--series-2)"
          strokeWidth={2}
          strokeDasharray="4 3"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={path("value")}
          fill="none"
          stroke="var(--series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        {/* Marcador del último punto: ancla la lectura en el dato de hoy. */}
        <circle
          cx={x(points.length - 1)}
          cy={y(last.value)}
          r={3}
          fill="var(--series-1)"
          stroke="var(--card)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatShortDate(first.date)}</span>
        <span
          className={
            up
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-destructive"
          }
        >
          {formatMoney(last.value, currency)}
        </span>
        <span>{formatShortDate(last.date)}</span>
      </div>
    </div>
  );
}

function LegendDot({ varName, label }: { varName: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: `var(${varName})` }}
      />
      {label}
    </span>
  );
}

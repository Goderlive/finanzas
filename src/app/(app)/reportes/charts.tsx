import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------
// Gasto por categoría — barras horizontales con el color de cada categoría.
// ---------------------------------------------------------------------
export function CategoryBreakdown({
  items,
  currency,
}: {
  items: { name: string; color: string; amount: number; pct: number }[];
  currency: string;
}) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Sin gastos este mes.</p>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((it) => (
        <li key={it.name} className="space-y-1">
          <div className="flex items-baseline justify-between text-sm">
            <span className="truncate">{it.name}</span>
            <span className="tabular-nums text-muted-foreground">
              {formatMoney(it.amount, currency)} · {it.pct.toFixed(0)}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, it.pct)}%`,
                backgroundColor: it.color,
              }}
              title={`${it.name}: ${formatMoney(it.amount, currency)}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------
// Tendencia mensual — barras agrupadas ingreso/gasto por mes.
// ---------------------------------------------------------------------
export function MonthlyTrend({
  months,
  currency,
}: {
  months: { label: string; income: number; expense: number }[];
  currency: string;
}) {
  const max = Math.max(
    1,
    ...months.map((m) => Math.max(m.income, m.expense)),
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-4 text-xs">
        <LegendDot varName="--series-1" label="Ingresos" />
        <LegendDot varName="--series-2" label="Gastos" />
      </div>
      <div className="flex h-40 items-end gap-2">
        {months.map((m) => (
          <div key={m.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-32 w-full items-end justify-center gap-1">
              <Bar
                value={m.income}
                max={max}
                varName="--series-1"
                label={`${m.label} · Ingresos: ${formatMoney(m.income, currency)}`}
              />
              <Bar
                value={m.expense}
                max={max}
                varName="--series-2"
                label={`${m.label} · Gastos: ${formatMoney(m.expense, currency)}`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({
  value,
  max,
  varName,
  label,
}: {
  value: number;
  max: number;
  varName: string;
  label: string;
}) {
  const h = value > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div
      className="w-3 rounded-t-sm sm:w-4"
      style={{ height: `${h}%`, backgroundColor: `var(${varName})` }}
      title={label}
    />
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

// ---------------------------------------------------------------------
// Comparativa entre los dos — gasto del mes por persona.
// ---------------------------------------------------------------------
export function MemberComparison({
  members,
  currency,
}: {
  members: { name: string; amount: number }[];
  currency: string;
}) {
  const total = members.reduce((s, m) => s + m.amount, 0);
  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Sin gastos registrados este mes.
      </p>
    );
  }
  const vars = ["--series-1", "--series-2"];
  return (
    <ul className="space-y-3">
      {members.map((m, i) => {
        const pct = total > 0 ? (m.amount / total) * 100 : 0;
        return (
          <li key={m.name} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span>{m.name}</span>
              <span className="tabular-nums text-muted-foreground">
                {formatMoney(m.amount, currency)} · {pct.toFixed(0)}%
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full")}
                style={{
                  width: `${Math.max(2, pct)}%`,
                  backgroundColor: `var(${vars[i % vars.length]})`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

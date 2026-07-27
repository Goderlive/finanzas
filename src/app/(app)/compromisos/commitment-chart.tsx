import { AlertTriangle } from "lucide-react";
import { formatMoney } from "@/lib/money";
import { shortMonthLabel, monthLabel, type MonthlyCommitment } from "@/lib/commitments";
import { cn } from "@/lib/utils";

/**
 * Mensualidades comprometidas por mes, con la línea del umbral de ingreso.
 *
 * Una sola serie, un solo color: los meses que se pasan del umbral se
 * distinguen por quedar sobre la línea, por el icono y por su etiqueta, nunca
 * sólo por el color (naranja y rojo no se separan lo suficiente ni con visión
 * plena — ΔE 11.7, comprobado con el validador de paleta).
 */
export function CommitmentChart({
  months,
  currency,
  monthlyIncome,
  alertPct,
}: {
  months: MonthlyCommitment[];
  currency: string;
  monthlyIncome: number;
  alertPct: number;
}) {
  if (months.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay mensualidades pendientes.
      </p>
    );
  }

  const threshold = monthlyIncome > 0 ? monthlyIncome * alertPct : 0;
  const max = Math.max(1, ...months.map((m) => m.total), threshold);
  const peak = months.reduce((a, b) => (b.total > a.total ? b : a));

  return (
    <div className="space-y-3">
      {threshold > 0 ? (
        <p className="text-xs text-muted-foreground">
          Línea: {(alertPct * 100).toFixed(0)}% del ingreso mensual promedio ={" "}
          {formatMoney(threshold, currency)}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Sin ingresos registrados en los últimos 6 meses: no se puede calcular
          el umbral.
        </p>
      )}

      <div className="overflow-x-auto pb-1">
        <div
          className="min-w-fit"
          role="img"
          aria-label={`Mensualidades comprometidas por mes, de ${monthLabel(months[0].month)} a ${monthLabel(months[months.length - 1].month)}`}
        >
          {/* Área de trazado: la línea del umbral se posiciona sólo contra
              esta altura, así queda exactamente sobre su valor. */}
          <div className="relative h-32">
            {threshold > 0 ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-muted-foreground/60"
                style={{ bottom: `${(threshold / max) * 100}%` }}
                aria-hidden
              />
            ) : null}
            <div className="flex h-full items-end gap-2">
              {months.map((m) => (
                <div
                  key={m.month}
                  className="flex h-full w-10 items-end justify-center sm:w-12"
                >
                  <div
                    className="w-5 rounded-t sm:w-6"
                    style={{
                      height: `${m.total > 0 ? Math.max(2, (m.total / max) * 100) : 0}%`,
                      backgroundColor: "var(--series-2)",
                    }}
                    title={`${monthLabel(m.month)}: ${formatMoney(m.total, currency)}${
                      m.incomeShare !== null
                        ? ` · ${(m.incomeShare * 100).toFixed(0)}% del ingreso`
                        : ""
                    } · ${m.count} ${m.count === 1 ? "mensualidad" : "mensualidades"}`}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="mt-1 flex gap-2">
            {months.map((m) => (
              <span
                key={m.month}
                className={cn(
                  "flex w-10 items-center justify-center gap-0.5 text-[11px] leading-tight sm:w-12",
                  m.overThreshold
                    ? "font-medium text-destructive"
                    : "text-muted-foreground",
                )}
              >
                {m.overThreshold ? (
                  <AlertTriangle
                    className="h-3 w-3 shrink-0"
                    aria-label="Sobre el umbral"
                  />
                ) : null}
                {shortMonthLabel(m.month)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {peak.total > 0 ? (
        <p className="text-xs text-muted-foreground">
          Mes con más carga: {monthLabel(peak.month)} con{" "}
          {formatMoney(peak.total, currency)}
          {peak.incomeShare !== null
            ? ` (${(peak.incomeShare * 100).toFixed(0)}% del ingreso)`
            : ""}
          .
        </p>
      ) : null}

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Ver tabla
        </summary>
        <table className="mt-2 w-full">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal">Mes</th>
              <th className="py-1 text-right font-normal">Mensualidades</th>
              <th className="py-1 text-right font-normal">Total</th>
              <th className="py-1 text-right font-normal">% ingreso</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr
                key={m.month}
                className={cn("border-t", m.overThreshold && "text-destructive")}
              >
                <td className="py-1">{monthLabel(m.month)}</td>
                <td className="py-1 text-right tabular-nums">{m.count}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatMoney(m.total, currency)}
                </td>
                <td className="py-1 text-right tabular-nums">
                  {m.incomeShare !== null
                    ? `${(m.incomeShare * 100).toFixed(0)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

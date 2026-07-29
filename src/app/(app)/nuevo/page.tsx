import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { today } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { getQuickSharedOptions, getQuickTransactionOptions } from "./data";
import { QuickSharedForm } from "./quick-shared-form";
import { QuickTransactionForm } from "./quick-form";
import {
  parseQuickType,
  quickTitles,
  quickToTransactionType,
  quickTypes,
} from "./tipos";

/**
 * Captura rápida. Es el destino de los accesos directos del launcher, así que
 * lo único que importa aquí es que el formulario exista cuanto antes: este
 * Server Component sólo resuelve `?tipo=` y la fecha de hoy, y le entrega al
 * cliente una PROMESA con cuentas y categorías, sin esperarla.
 *
 * Abrirlo directo en el navegador funciona igual: la URL lleva todo el estado
 * y no hay nada que dependa de haber navegado desde dentro de la app.
 */
export default async function NuevoPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string | string[] }>;
}) {
  const { tipo } = await searchParams;
  const quickType = parseQuickType(tipo);
  const defaultDate = today();

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href="/"
          aria-label="Volver al inicio"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-xl font-semibold">{quickTitles[quickType]}</h1>
      </div>

      {/* Cambiar de tipo sin volver al inicio: el acceso directo se toca a
          ciegas y equivocarse cuesta un toque, no una navegación. */}
      <nav className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {quickTypes.map((t) => (
          <Link
            key={t}
            href={`/nuevo?tipo=${t}`}
            replace
            aria-current={t === quickType ? "page" : undefined}
            className={cn(
              "rounded-md py-2 text-center text-sm font-medium transition-colors",
              t === quickType
                ? "bg-background shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t === "gasto" ? "Gasto" : t === "ingreso" ? "Ingreso" : "Compartido"}
          </Link>
        ))}
      </nav>

      {quickType === "compartido" ? (
        <QuickSharedForm
          // Sin `await`: la promesa viaja al cliente y se resuelve cuando
          // llegue, con el formulario ya en pantalla.
          optionsPromise={getQuickSharedOptions()}
          defaultDate={defaultDate}
        />
      ) : (
        <QuickTransactionForm
          key={quickType}
          transactionType={quickToTransactionType[quickType]}
          optionsPromise={getQuickTransactionOptions(
            quickToTransactionType[quickType],
          )}
          defaultDate={defaultDate}
        />
      )}
    </div>
  );
}

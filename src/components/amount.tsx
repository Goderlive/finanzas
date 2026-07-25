import { cn } from "@/lib/utils";

/**
 * Importe sensible al modo privado. Renderiza el valor y una máscara; cuál de
 * los dos se ve lo decide CSS según `data-amounts` en el <html>, así funciona
 * desde componentes de servidor y sin parpadeo al cargar.
 */
export function Amount({
  children,
  className,
  mask = "••••••",
}: {
  children: React.ReactNode;
  className?: string;
  mask?: string;
}) {
  return (
    <span className={className}>
      <span className="private-hide">{children}</span>
      <span className="private-show text-muted-foreground" aria-hidden>
        {mask}
      </span>
    </span>
  );
}

/**
 * Envoltorio para ocultar un bloque entero (una línea, una fila) en modo
 * privado, sin dejar máscara en su lugar.
 */
export function PrivateOnly({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <span className={cn("private-hide", className)}>{children}</span>;
}

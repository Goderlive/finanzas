"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRIVACY_ATTR, PRIVACY_KEY } from "@/lib/privacy";

function readStored(): boolean {
  try {
    return localStorage.getItem(PRIVACY_KEY) === "1";
  } catch {
    return false;
  }
}

/** Botón de "ojito" para ocultar o mostrar los importes en pantalla. */
export function PrivacyToggle({ className }: { className?: string }) {
  const [hidden, setHidden] = useState(false);
  const [ready, setReady] = useState(false);

  // El estado real vive en el atributo del <html> (lo puso el script inline);
  // acá sólo lo sincronizamos para pintar el ícono correcto.
  useEffect(() => {
    setHidden(readStored());
    setReady(true);
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    if (next) {
      document.documentElement.setAttribute(PRIVACY_ATTR, "hidden");
    } else {
      document.documentElement.removeAttribute(PRIVACY_ATTR);
    }
    try {
      localStorage.setItem(PRIVACY_KEY, next ? "1" : "0");
    } catch {
      // Si el almacenamiento no está disponible, el cambio dura la sesión.
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={className}
      onClick={toggle}
      aria-pressed={hidden}
      aria-label={hidden ? "Mostrar importes" : "Ocultar importes"}
      title={hidden ? "Mostrar importes" : "Ocultar importes"}
    >
      {/* Hasta leer la preferencia mostramos el ojo abierto para no parpadear. */}
      {ready && hidden ? (
        <EyeOff className="h-5 w-5" />
      ) : (
        <Eye className="h-5 w-5" />
      )}
    </Button>
  );
}

"use client";

import { useEffect } from "react";

export function Pwa() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // El registro del SW es opcional; si falla, la app sigue funcionando.
      });
    }
  }, []);

  return null;
}

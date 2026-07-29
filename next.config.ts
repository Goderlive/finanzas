import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // El resumen del mes vive en "/". El acceso directo del launcher apunta
      // a /dashboard porque es un nombre estable: una vez instalada la PWA,
      // las URLs de los shortcuts quedan grabadas en Android y sólo se
      // actualizan al reinstalar. Este alias permite mover la página después
      // sin romper los iconos ya instalados.
      //
      // Temporal (307) a propósito: un 301 se queda cacheado en el navegador y
      // en el service worker, y volvería imposible darle contenido propio a
      // /dashboard más adelante.
      { source: "/dashboard", destination: "/", permanent: false },
    ];
  },
};

export default nextConfig;

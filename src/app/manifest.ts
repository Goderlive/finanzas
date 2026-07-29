import type { MetadataRoute } from "next";

/** Un icono de acceso directo, en los dos tamaños que genera el script. */
function shortcutIcons(name: string): MetadataRoute.Manifest["icons"] {
  return [
    {
      src: `/icons/shortcut-${name}-96.png`,
      sizes: "96x96",
      type: "image/png",
      purpose: "any",
    },
    {
      src: `/icons/shortcut-${name}-192.png`,
      sizes: "192x192",
      type: "image/png",
      purpose: "any",
    },
  ];
}

export default function manifest(): MetadataRoute.Manifest {
  return {
    // `id` fija la identidad de la PWA aunque cambie `start_url`. Sin él,
    // Android puede tratar una instalación vieja y una nueva como apps
    // distintas y duplicar el icono.
    id: "/",
    name: "Finanzas del hogar",
    short_name: "Finanzas",
    description: "Finanzas personales para dos",
    start_url: "/",
    // Todos los accesos directos apuntan dentro de este scope; si alguno
    // quedara fuera, Chrome descarta ese shortcut en silencio.
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#6366f1",
    lang: "es",
    dir: "ltr",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],

    // Accesos directos del launcher (mantener presionado el icono). Android
    // muestra 4 en la mayoría de los launchers y trunca `short_name` cerca de
    // los 12 caracteres, así que ninguno lo pasa.
    shortcuts: [
      {
        name: "Nuevo gasto",
        short_name: "Gasto",
        description: "Captura un gasto en dos toques",
        url: "/nuevo?tipo=gasto",
        icons: shortcutIcons("gasto"),
      },
      {
        name: "Gasto compartido",
        short_name: "Compartido",
        description: "Registra un gasto a dividir con tu pareja",
        url: "/nuevo?tipo=compartido",
        icons: shortcutIcons("compartido"),
      },
      {
        name: "Ingreso",
        short_name: "Ingreso",
        description: "Registra dinero que entró",
        url: "/nuevo?tipo=ingreso",
        icons: shortcutIcons("ingreso"),
      },
      {
        name: "Resumen del mes",
        short_name: "Resumen",
        description: "Cómo va el mes y los saldos del hogar",
        url: "/dashboard",
        icons: shortcutIcons("resumen"),
      },
    ],
  };
}

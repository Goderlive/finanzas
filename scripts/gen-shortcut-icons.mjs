// Genera los iconos de los accesos directos del manifest (public/icons/).
//
// Son PLACEHOLDERS: un color plano por acción y un glifo blanco al centro.
// La idea es que se distingan de un vistazo al mantener presionado el icono
// de la app; el diseño definitivo se reemplaza sin tocar el manifest, porque
// los nombres de archivo no cambian.
//
//   node scripts/gen-shortcut-icons.mjs
//
// `sharp` ya viene instalado (lo usa Next para optimizar imágenes).

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");

// Android enmascara el icono (círculo en la mayoría de launchers): el fondo va
// a sangre y el glifo se queda dentro del 60% central para no perder trazos.
const glyphs = {
  gasto: `
    <path d="M48 28 v30" />
    <path d="M34 46 l14 14 l14 -14" />`,
  ingreso: `
    <path d="M48 68 v-30" />
    <path d="M34 50 l14 -14 l14 14" />`,
  // Círculo partido a la mitad: lee como "esto se divide entre dos".
  compartido: `
    <circle cx="48" cy="48" r="21" />
    <path d="M48 27 A21 21 0 0 0 48 69 Z" fill="#ffffff" stroke="none" />`,
  resumen: `
    <path d="M32 60 v-8" />
    <path d="M48 60 v-20" />
    <path d="M64 60 v-14" />`,
};

const icons = [
  { name: "gasto", color: "#ef4444", glyph: glyphs.gasto },
  { name: "compartido", color: "#8b5cf6", glyph: glyphs.compartido },
  { name: "ingreso", color: "#10b981", glyph: glyphs.ingreso },
  { name: "resumen", color: "#6366f1", glyph: glyphs.resumen },
];

const svg = (color, glyph) => `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <rect width="96" height="96" fill="${color}"/>
  <g fill="none" stroke="#ffffff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
    ${glyph}
  </g>
</svg>`;

await mkdir(OUT, { recursive: true });

for (const { name, color, glyph } of icons) {
  const source = Buffer.from(svg(color, glyph));
  // 96 es el mínimo que pide la spec; 192 evita que se vea suave en xxhdpi.
  for (const size of [96, 192]) {
    const file = join(OUT, `shortcut-${name}-${size}.png`);
    await sharp(source, { density: 384 })
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(file);
    console.log(`✓ ${file}`);
  }
}

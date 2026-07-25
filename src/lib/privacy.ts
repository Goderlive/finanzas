// Modo privado ("ojito"): oculta los importes en pantalla.
// Vive fuera del componente cliente porque el layout de servidor necesita el
// string del script; los exports de un módulo "use client" llegarían al
// servidor como referencias de cliente, no como valores.

export const PRIVACY_KEY = "finanzas:ocultar-montos";
export const PRIVACY_ATTR = "data-amounts";

/**
 * Script que corre antes del primer paint para aplicar la preferencia guardada.
 * Sin esto los importes se pintarían un instante antes de que React hidrate,
 * que es justo lo que el modo privado intenta evitar. El enmascarado se hace
 * por CSS (ver globals.css) contra este atributo del <html>.
 */
export const privacyScript = `try{if(localStorage.getItem("${PRIVACY_KEY}")==="1"){document.documentElement.setAttribute("${PRIVACY_ATTR}","hidden")}}catch(e){}`;

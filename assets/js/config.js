/*
 * Emergency Radar · configuración pública
 * ------------------------------------------------------------------
 * Contador de visitas con Supabase (ver supabase/visitas.sql y el README).
 * Aquí van la URL del proyecto y la clave PÚBLICA "anon". Esa clave está pensada para
 * usarse en el navegador: la tabla no se puede leer ni escribir con ella, solo se pueden
 * llamar las funciones registrar_visita y resumen_visitas.
 * NUNCA pongas aquí la clave "service_role".
 * Si quedan vacías, el contador simplemente no se muestra.
 */
window.ER_CONFIG = {
  visitas: {
    url: "",   // p. ej. "https://abcdefghijkl.supabase.co"
    clave: ""  // clave anon (Project Settings → API → Project API keys → anon public)
  }
};

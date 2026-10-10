/*
 * Emergency Radar · configuración pública
 * ------------------------------------------------------------------
 * Contador de visitas con Supabase (ver supabase/visitas.sql y el README).
 * Aquí van la URL del proyecto y la clave PÚBLICA (publishable o anon). Esa clave está pensada para
 * usarse en el navegador: la tabla no se puede leer ni escribir con ella, solo se pueden
 * llamar las funciones registrar_visita y resumen_visitas.
 * NUNCA pongas aquí la clave "secret" (sb_secret_...) ni la "service_role".
 * Si quedan vacías, el contador simplemente no se muestra.
 */
window.ER_CONFIG = {
  visitas: {
    url: "https://syglkptimygybufswhmd.supabase.co",
    // Clave pública: "Publishable key" (sb_publishable_...) o la clave "anon" de "Legacy API Keys" (eyJ...).
    // Está en Project Settings → API Keys, o en el botón "Connect" del panel del proyecto.
    clave: ""
  }
};

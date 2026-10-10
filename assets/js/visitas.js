/*
 * Emergency Radar · contador de visitas
 * ------------------------------------------------------------------
 * Cada carga de la página llama a registrar_visita en Supabase. El servidor toma la IP
 * del encabezado de la petición, guarda solo su huella cifrada y decide si es una visita
 * nueva (la misma IP cuenta otra vez recién después de 6 horas). Así, recargar no suma.
 * País y ciudad aproximados se piden a un servicio de geolocalización sin clave; si no
 * responde, el servidor usa el país que informa la red.
 */
(function () {
  "use strict";

  var cfg = (window.ER_CONFIG || {}).visitas || {};
  if (!cfg.url || !cfg.clave) return;

  var REFRESCO_MS = 120000;     // el resumen se actualiza cada 2 minutos
  var ROTACION_MS = 5000;       // la pastilla de "recientes" cambia cada 5 segundos
  var GEO_URL = "https://get.geojs.io/v1/ip/geo.json";
  var base = cfg.url.replace(/\/+$/, "") + "/rest/v1/rpc/";
  var nombres = null;
  try { nombres = new Intl.DisplayNames(["es"], { type: "region" }); } catch (e) { /* navegador antiguo */ }

  var datos = null, giro = 0, timerGiro = null;

  // La clave nueva (sb_publishable_...) va solo en "apikey"; la antigua "anon" es un JWT y
  // también se envía como Authorization.
  var cabeceras = { apikey: cfg.clave, "Content-Type": "application/json" };
  if (/^eyJ/.test(cfg.clave)) cabeceras.Authorization = "Bearer " + cfg.clave;

  function rpc(nombre, cuerpo) {
    return fetch(base + nombre, {
      method: "POST",
      headers: cabeceras,
      body: JSON.stringify(cuerpo || {})
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error(nombre + ": HTTP " + r.status + " " + t); });
      return r.json();
    });
  }

  function conLimite(promesa, ms) {
    return Promise.race([promesa, new Promise(function (_, no) { setTimeout(function () { no(new Error("tiempo")); }, ms); })]);
  }

  function geolocalizar() {
    return conLimite(fetch(GEO_URL).then(function (r) { return r.json(); }), 2500)
      .then(function (g) { return { p_codigo: g.country_code || null, p_ciudad: g.city || null }; })
      .catch(function () { return {}; });
  }

  function pais(codigo) {
    if (!codigo) return "Ubicación desconocida";
    try { return (nombres && nombres.of(codigo)) || codigo; } catch (e) { return codigo; }
  }
  function bandera(codigo) {
    if (!codigo || !/^[A-Z]{2}$/.test(codigo)) return '<span class="vis-bandera vacia">' + window.icon("world") + "</span>";
    return '<img class="vis-bandera" src="https://flagcdn.com/' + codigo.toLowerCase() + '.svg" alt="" width="18" height="13" loading="lazy">';
  }
  function lugar(v) {
    var p = pais(v.codigo);
    return v.ciudad ? ER.escapar(v.ciudad) + ", " + ER.escapar(p) : ER.escapar(p);
  }
  function compacto(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(".0", "").replace(".", ",") + " M";
    if (n >= 1e4) return Math.round(n / 1e3) + " mil";
    return ER.fmtNum(n);
  }

  function pintar() {
    if (!datos) return;
    var caja = document.getElementById("visitas");
    caja.hidden = false;
    var btn = document.getElementById("btnVisitas");
    document.getElementById("visTotal").textContent = compacto(datos.total);
    btn.title = ER.fmtNum(datos.total) + " visitas · " + ER.fmtNum(datos.hoy) + " en las últimas 24 h";
    btn.setAttribute("aria-label", btn.title);

    var recientes = (datos.recientes || []).map(function (v) { v.fecha = new Date(v.fecha); return v; });
    document.getElementById("visPop").innerHTML =
      '<div class="pop-title">Visitas</div>' +
      '<div class="vis-stats"><div><b>' + ER.fmtNum(datos.total) + '</b><span>Total</span></div><div><b>' + ER.fmtNum(datos.hoy) +
      '</b><span>Últimas 24&nbsp;h</span></div><div><b>' + ER.fmtNum(datos.paises) + "</b><span>" + (datos.paises === 1 ? "País" : "Países") + "</span></div></div>" +
      (recientes.length ? '<div class="vis-sub">Visitas recientes</div><ul class="vis-lista">' + recientes.map(function (v) {
        return "<li>" + bandera(v.codigo) + '<span class="vis-lugar">' + lugar(v) + "</span><small>" + ER.htmlHace(v.fecha) + "</small></li>";
      }).join("") + "</ul>" : "") +
      ((datos.top || []).length ? '<div class="vis-sub">Países con más visitas</div><div class="vis-top">' + datos.top.map(function (t) {
        return '<span class="vis-chip">' + bandera(t.codigo) + ER.escapar(pais(t.codigo)) + " <b>" + ER.fmtNum(t.n) + "</b></span>";
      }).join("") + "</div>" : "") +
      '<p class="vis-nota">Cada persona cuenta una vez cada 6 horas. No guardamos tu IP: solo una huella cifrada para no contar recargas, y el país y la ciudad aproximados.</p>';

    girar(true);
  }

  // Pastilla con la visita más reciente; va rotando entre las últimas.
  function girar(reiniciar) {
    var el = document.getElementById("visReciente");
    var lista = datos && datos.recientes || [];
    if (!lista.length) { el.hidden = true; return; }
    if (reiniciar) giro = 0;
    var v = lista[giro % lista.length];
    el.hidden = false;
    el.classList.remove("entra");
    void el.offsetWidth;
    el.innerHTML = bandera(v.codigo) + '<span class="vis-lugar">' + lugar(v) + "</span><small>" + ER.haceCorto(v.fecha) + "</small>";
    el.title = "Visita reciente desde " + el.querySelector(".vis-lugar").textContent + " · " + ER.hace(v.fecha);
    el.classList.add("entra");
    clearTimeout(timerGiro);
    if (lista.length > 1) timerGiro = setTimeout(function () { giro++; girar(); }, ROTACION_MS);
  }

  function refrescar() {
    if (document.hidden) return;
    rpc("resumen_visitas").then(function (r) { datos = r; pintar(); }).catch(function () { /* se reintenta en el próximo ciclo */ });
  }

  function iniciar() {
    ER.enlazarPopover("btnVisitas", "visPop");
    document.getElementById("visReciente").addEventListener("click", function (ev) {
      ev.stopPropagation();
      document.getElementById("btnVisitas").click();
    });
    geolocalizar()
      .then(function (geo) { return rpc("registrar_visita", geo); })
      .then(function (r) { datos = r; pintar(); })
      .catch(function (e) { if (window.console) console.warn("Contador de visitas:", e.message); });
    setInterval(refrescar, REFRESCO_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) refrescar(); });
  }

  iniciar();
})();

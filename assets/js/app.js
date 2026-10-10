/*
 * Emergency Radar · núcleo de la aplicación
 * Estado global, navegación por hash (compatible con GitHub Pages),
 * barra superior, popovers, modal, notificaciones y modo "En vivo".
 */
(function () {
  "use strict";

  var D = window.ER_DATA;
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ---------- Hora de Ecuador ----------
  // Todas las fechas y horas se muestran y agrupan en hora de Ecuador continental (GMT-5),
  // sin importar la zona horaria del navegador. Ecuador no usa horario de verano, así que
  // el desfase es fijo.
  var DESFASE = -5 * 3600000;
  var DIA_MS = 86400000;
  // Partes de la fecha en hora de Ecuador: año, mes (0-11), día, hora, minuto y día de la semana (0 = domingo).
  function ec(d) {
    var x = new Date(+d + DESFASE);
    return { y: x.getUTCFullYear(), m: x.getUTCMonth(), d: x.getUTCDate(), h: x.getUTCHours(), mi: x.getUTCMinutes(), dow: x.getUTCDay() };
  }
  // Fecha (instante real) que corresponde a una hora de Ecuador.
  function desdeEc(y, m, d, h, mi, s, ms) { return new Date(Date.UTC(y, m, d, h || 0, mi || 0, s || 0, ms || 0) - DESFASE); }
  function inicioDia(d) { var p = ec(d); return desdeEc(p.y, p.m, p.d); }
  function finDia(d) { var p = ec(d); return desdeEc(p.y, p.m, p.d, 23, 59, 59, 999); }
  function sumarDias(d, n) { return new Date(+d + n * DIA_MS); }

  var hoy = new Date();
  var ER = {
    estado: {
      // X solo entrega publicaciones de los últimos 7 días; por eso es el rango inicial.
      desde: inicioDia(sumarDias(hoy, -6)),
      hasta: finDia(hoy),
      enVivo: true,
      vista: "principal"
    },
    vistas: {},
    _oyentes: [],

    // ---------- filtros globales ----------
    // Estado compartido por Principal e Histórico: lo que se elige en "Estás viendo",
    // en Pre-alertas o en Histórico aplica en ambas. Estadísticas tiene sus propios filtros.
    filtros: {
      categorias: D.CATEGORIAS.map(function (c) { return c.id; }),
      ciudad: "",
      clasificacion: "emergencias"
    },
    cambiarFiltros: function (cambios) {
      Object.keys(cambios).forEach(function (k) { ER.filtros[k] = cambios[k]; });
      // Se conserva el orden original de las categorías.
      ER.filtros.categorias = D.CATEGORIAS.map(function (c) { return c.id; }).filter(function (id) {
        return ER.filtros.categorias.indexOf(id) >= 0;
      });
      ER.emitir("filtros");
    },
    // Opciones para D.filtrar con el rango de fechas y los filtros globales.
    // `extra` permite sobrescribir algo puntual (otro rango, otra categoría...).
    consulta: function (extra) {
      var f = ER.filtros;
      var o = { desde: ER.estado.desde, hasta: ER.estado.hasta, categorias: f.categorias, ciudad: f.ciudad || null, clasificacion: f.clasificacion };
      Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
      return o;
    },

    // ---------- utilidades compartidas ----------
    pad: pad,
    inicioDia: inicioDia,
    finDia: finDia,
    sumarDias: sumarDias,
    ec: ec,
    desdeEc: desdeEc,
    DESFASE: DESFASE,
    ZONA: "hora de Ecuador (GMT-5)",
    fmtFecha: function (d) { var p = ec(d); return p.y + "/" + pad(p.m + 1) + "/" + pad(p.d); },
    fmtFechaCorta: function (d) { var p = ec(d); return pad(p.d) + "/" + pad(p.m + 1) + "/" + p.y; },
    fmtDiaMes: function (d) { var p = ec(d); return p.d + " " + MESES[p.m]; },
    fmtHoraH: function (d) { var p = ec(d); return pad(p.h) + "h" + pad(p.mi); },
    fmtHora: function (d) { var p = ec(d); return pad(p.h) + ":" + pad(p.mi); },
    fmtLarga: function (d) { var p = ec(d); return pad(p.h) + ":" + pad(p.mi) + " · " + p.d + " " + MESES[p.m] + " " + p.y; },
    fmtNum: function (n) { return n.toLocaleString("es-EC"); },
    isoDia: function (d) { var p = ec(d); return p.y + "-" + pad(p.m + 1) + "-" + pad(p.d); },
    // Texto "AAAA-MM-DD" (de un <input type="date">) a medianoche de Ecuador.
    deIsoDia: function (v) { var a = v.split("-"); return desdeEc(+a[0], a[1] - 1, +a[2]); },
    escapar: function (s) {
      return String(s).replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    },
    iniciales: function (nombre) {
      // Solo letras y números: los nombres reales de X traen emojis y símbolos.
      var p = nombre.normalize("NFC").split(/\s+/).map(function (w) {
        return w.replace(/[^0-9A-Za-zÀ-ÖØ-öø-ÿ]/g, "");
      }).filter(Boolean);
      var ini = ((p[0] || "").charAt(0) + (p[1] || "").charAt(0)).toUpperCase();
      return ini || "?";
    },
    // Periodo anterior de igual duración al seleccionado.
    periodoAnterior: function () {
      var e = ER.estado;
      var dur = e.hasta - e.desde;
      return { desde: new Date(e.desde.getTime() - dur - 1), hasta: new Date(e.desde.getTime() - 1) };
    },

    // ---------- eventos internos ----------
    on: function (fn) { ER._oyentes.push(fn); },
    emitir: function (tipo, dato) { ER._oyentes.forEach(function (fn) { fn(tipo, dato); }); },

    // ---------- UI común ----------
    toast: function (msg) {
      var t = document.getElementById("toast");
      t.textContent = msg;
      t.hidden = false;
      clearTimeout(ER._toastT);
      ER._toastT = setTimeout(function () { t.hidden = true; }, 2600);
    },
    abrirModal: function (titulo, html, alAbrir) {
      document.getElementById("modalTitle").textContent = titulo;
      var body = document.getElementById("modalBody");
      body.innerHTML = html;
      document.getElementById("modal").hidden = false;
      pintarIconos(body);
      if (alAbrir) alAbrir(body);
    },
    cerrarModal: function () { document.getElementById("modal").hidden = true; },
    pintarIconos: pintarIconos
  };

  function pintarIconos(raiz) {
    (raiz || document).querySelectorAll("[data-icon]").forEach(function (el) {
      if (!el.firstChild) el.innerHTML = window.icon(el.getAttribute("data-icon"));
    });
  }

  // ---------- Popovers ----------
  function enlazarPopover(btnId, popId, alAbrir) {
    var btn = document.getElementById(btnId);
    var pop = document.getElementById(popId);
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var abrir = pop.hidden;
      cerrarPopovers();
      if (abrir) { pop.hidden = false; if (alAbrir) alAbrir(pop); }
    });
    pop.addEventListener("click", function (ev) { ev.stopPropagation(); });
    pop.querySelectorAll("[data-close]").forEach(function (b) { b.addEventListener("click", cerrarPopovers); });
  }
  function cerrarPopovers() {
    document.querySelectorAll(".popover").forEach(function (p) { p.hidden = true; });
  }
  ER.enlazarPopover = enlazarPopover;
  ER.cerrarPopovers = cerrarPopovers;

  // ---------- Rango de fechas ----------
  function pintarRango() {
    document.getElementById("rangoDesde").textContent = ER.fmtFecha(ER.estado.desde);
    document.getElementById("rangoHasta").textContent = ER.fmtFecha(ER.estado.hasta);
    document.getElementById("btnRango").title = "Rango de fechas: " + ER.fmtFecha(ER.estado.desde) + " a " + ER.fmtFecha(ER.estado.hasta);
  }
  function aplicarRango(desde, hasta) {
    if (hasta < desde) { var t = desde; desde = hasta; hasta = t; }
    ER.estado.desde = inicioDia(desde);
    ER.estado.hasta = finDia(hasta);
    pintarRango();
    ER.emitir("rango");
  }
  function iniciarRango() {
    var inDesde = document.getElementById("inDesde");
    var inHasta = document.getElementById("inHasta");
    var disp = D.rangoDisponible();
    inDesde.min = inHasta.min = ER.isoDia(disp.desde);
    inDesde.max = inHasta.max = ER.isoDia(new Date());
    enlazarPopover("btnRango", "popRango", function () {
      inDesde.value = ER.isoDia(ER.estado.desde);
      inHasta.value = ER.isoDia(ER.estado.hasta);
    });
    document.querySelectorAll("[data-preset]").forEach(function (b) {
      b.addEventListener("click", function () {
        var p = b.getAttribute("data-preset");
        var h = new Date(), d;
        if (p === "hoy") d = h;
        else if (p === "mes") { var hp = ec(h); d = desdeEc(hp.y, hp.m, 1); }
        else d = sumarDias(h, -(parseInt(p, 10) - 1));
        inDesde.value = ER.isoDia(d);
        inHasta.value = ER.isoDia(h);
      });
    });
    document.getElementById("btnAplicarRango").addEventListener("click", function () {
      if (!inDesde.value || !inHasta.value) { ER.toast("Selecciona ambas fechas"); return; }
      aplicarRango(ER.deIsoDia(inDesde.value), ER.deIsoDia(inHasta.value));
      cerrarPopovers();
    });
    pintarRango();
  }

  // ---------- Modo En vivo ----------
  var vivoTimer = null;
  function recibir(p) {
    // Si el rango termina hoy, se extiende para incluir la nueva publicación.
    if (ER.isoDia(ER.estado.hasta) === ER.isoDia(p.fecha)) ER.estado.hasta = finDia(p.fecha);
    ER.emitir("nueva", p);
  }
  // En vivo: cada minuto se vuelve a leer data/posts.json (que el recolector actualiza cada
  // 30 minutos) y lo nuevo entra al mapa, al resumen, a Pre-alertas, a Frecuencia y a la
  // píldora "N posts nuevos". En pausa la pantalla queda fija para analizarla con calma.
  // No afecta la captura en X, que corre en GitHub Actions de todos modos.
  var proximaRevision = null;
  function revisarAhora() {
    var antes = D.estado();
    return D.sincronizar().then(function (nuevas) {
      nuevas.forEach(recibir);
      pintarFuente();
      if ((antes !== "ok" && D.estado() === "ok") || nuevas.reetiquetadas) ER.emitir("rango");
      if (nuevas.length) ER.toast(nuevas.length === 1 ? "Llegó 1 post nuevo" : "Llegaron " + nuevas.length + " posts nuevos");
      return nuevas;
    });
  }
  function programarVivo() {
    clearTimeout(vivoTimer);
    if (!ER.estado.enVivo) { proximaRevision = null; pintarVivo(); return; }
    proximaRevision = Date.now() + D.INTERVALO_MS;
    pintarVivo();
    vivoTimer = setTimeout(function () { revisarAhora().then(programarVivo); }, D.INTERVALO_MS);
  }
  function pintarVivo() {
    var b = document.getElementById("btnLive");
    b.classList.toggle("is-on", ER.estado.enVivo);
    b.setAttribute("aria-pressed", String(ER.estado.enVivo));
    b.querySelector(".live-label").textContent = ER.estado.enVivo ? "En vivo" : "Pausado";
    var seg = proximaRevision ? Math.max(0, Math.round((proximaRevision - Date.now()) / 1000)) : null;
    b.title = ER.estado.enVivo
      ? "En vivo: revisa si hay posts nuevos cada minuto (próxima revisión en " + seg + " s). Clic para pausar y dejar la pantalla fija."
      : "Pausado: la pantalla no se actualiza. Clic para volver a revisar posts nuevos cada minuto.";
  }
  // Mantiene al día la cuenta regresiva del título del botón.
  setInterval(function () { if (ER.estado.enVivo && proximaRevision) pintarVivo(); }, 5000);
  function iniciarVivo() {
    document.getElementById("btnLive").addEventListener("click", function () {
      ER.estado.enVivo = !ER.estado.enVivo;
      if (ER.estado.enVivo) {
        // Al reanudar se revisa de inmediato, sin esperar el minuto.
        ER.toast("En vivo: buscando posts nuevos…");
        revisarAhora().then(function (nuevas) {
          if (!nuevas.length) ER.toast("En vivo: no hay posts nuevos por ahora");
          programarVivo();
        });
      } else {
        programarVivo();
        ER.toast("Pausado: la pantalla queda fija hasta que vuelvas a activar En vivo");
      }
      ER.emitir("vivo");
    });
    pintarVivo();
    programarVivo();
  }

  // ---------- Fuente de datos ----------
  function pintarFuente() {
    var el = document.getElementById("fuenteDatos");
    var est = D.estado();
    var act = D.actualizado();
    el.classList.toggle("real", est === "ok");
    el.classList.toggle("error", est === "error");
    el.textContent = est === "error" ? "Sin conexión a los datos"
      : est === "vacio" ? "Sin capturas aún"
      : "Datos de X" + (act ? " · " + ER.hace(act) : "");
    el.title = est === "error"
      ? "No se pudo leer data/posts.json"
      : "Última captura desde la API de X: " + (act ? ER.fmtLarga(act) : "aún no hay capturas");
  }

  // ---------- Escala de gravedad (colores de mapa de calor) ----------
  // Rojo = más emergencia, amarillo = media, verde = menos. Se usa en el mapa, las
  // tarjetas, el mapa de calor y las etiquetas del modelo. Siempre va con texto.
  ER.GRAVEDAD = {
    alta: { id: "alta", nombre: "Gravedad alta", corto: "Alta", color: "#d03b3b", suave: "#fbe1e1" },
    media: { id: "media", nombre: "Gravedad media", corto: "Media", color: "#f0a400", suave: "#fff1cc" },
    baja: { id: "baja", nombre: "Gravedad baja", corto: "Baja", color: "#2f9e44", suave: "#e3f5e6" }
  };
  // Puntaje de 0 a 1: la probabilidad del modelo, más un plus si menciona heridos o
  // fallecidos. Lo que el modelo descartó queda en gravedad baja.
  ER.severidad = function (p) {
    var score = typeof p.prob === "number" ? p.prob : 0.6;
    if (window.ER_ALERTAS && window.ER_ALERTAS.GRAVEDAD.test(p.texto || "")) score += 0.25;
    if (p.emergencia === false) score = Math.min(score, 0.3);
    score = Math.max(0, Math.min(1, score));
    var nivel = score >= 0.75 ? ER.GRAVEDAD.alta : score >= 0.5 ? ER.GRAVEDAD.media : ER.GRAVEDAD.baja;
    return { score: score, nivel: nivel };
  };
  // En el mapa se usa la línea del mapa de calor (sin verde): amarillo, naranja y rojo.
  ER.CALOR = {
    baja: { id: "baja", corto: "Baja", color: "#ffc400" },
    media: { id: "media", corto: "Media", color: "#ff8c00" },
    alta: { id: "alta", corto: "Alta", color: "#e03131" }
  };
  // Grupos del mapa: el color sigue la cantidad de reportes, como un mapa de calor.
  ER.nivelPorCantidad = function (n) {
    return n >= 15 ? ER.GRAVEDAD.alta : n >= 5 ? ER.GRAVEDAD.media : ER.GRAVEDAD.baja;
  };

  // ---------- Tiempo relativo ----------
  // "hace 12 min", "hace 3 horas"... Los elementos con data-hace se actualizan solos.
  ER.hace = function (d) {
    var s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "hace un momento";
    if (s < 3600) return "hace " + Math.floor(s / 60) + " min";
    if (s < 86400) { var h = Math.floor(s / 3600); return "hace " + h + (h === 1 ? " hora" : " horas"); }
    var dd = Math.floor(s / 86400);
    return "hace " + dd + (dd === 1 ? " día" : " días");
  };
  // Versión corta para etiquetas del mapa: "ahora", "12 min", "3 h", "2 d".
  ER.haceCorto = function (d) {
    var s = (Date.now() - d.getTime()) / 1000;
    if (s < 60) return "ahora";
    if (s < 3600) return Math.floor(s / 60) + " min";
    if (s < 86400) return Math.floor(s / 3600) + " h";
    return Math.floor(s / 86400) + " d";
  };
  ER.htmlHace = function (d) {
    return '<time data-hace="' + d.toISOString() + '" datetime="' + d.toISOString() + '" title="' + ER.fmtLarga(d) + '">' + ER.hace(d) + "</time>";
  };
  setInterval(function () {
    document.querySelectorAll("[data-hace]").forEach(function (el) { el.textContent = ER.hace(new Date(el.getAttribute("data-hace"))); });
    if (D.estado() !== "cargando") pintarFuente();
  }, 30000);

  // Últimas 24 horas hasta el final del rango elegido (o hasta ahora, si el rango incluye hoy),
  // y las 24 horas anteriores para comparar.
  ER.ventana24h = function () {
    var fin = new Date(Math.min(Date.now(), ER.estado.hasta.getTime()));
    var ini = new Date(fin.getTime() - 24 * 3600 * 1000);
    return { desde: ini, hasta: fin, prevDesde: new Date(ini.getTime() - 24 * 3600 * 1000), prevHasta: new Date(ini.getTime() - 1) };
  };

  // Cuenta animada de un número (de lo que muestra el elemento al valor nuevo).
  ER.animarNumero = function (el, valor) {
    var desde = parseInt((el.textContent || "0").replace(/\D/g, ""), 10) || 0;
    if (desde === valor || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = ER.fmtNum(valor); return; }
    var inicio = performance.now(), dur = 600;
    (function paso(t) {
      var k = Math.min(1, (t - inicio) / dur);
      el.textContent = ER.fmtNum(Math.round(desde + (valor - desde) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(paso);
    })(inicio);
  };

  // Texto para listas vacías según el estado de los datos.
  ER.mensajeSinDatos = function (siFiltros) {
    var est = D.estado();
    if (est === "error") return "No se pudieron cargar las publicaciones. Revisa tu conexión y recarga la página.";
    if (est !== "ok") return "Aún no hay publicaciones capturadas desde X. Aparecerán aquí después de la próxima captura.";
    return siFiltros;
  };

  // ---------- Navegación ----------
  function rutaActual() {
    var r = (location.hash || "").replace(/^#\/?/, "");
    return ER.vistas[r] ? r : "principal";
  }
  function navegar() {
    var ruta = rutaActual();
    ER.estado.vista = ruta;
    document.body.setAttribute("data-vista", ruta);
    document.querySelectorAll("[data-view]").forEach(function (v) { v.hidden = v.getAttribute("data-view") !== ruta; });
    document.querySelectorAll(".tabs a").forEach(function (a) {
      var on = a.getAttribute("data-route") === ruta;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    cerrarPopovers();
    var v = ER.vistas[ruta];
    if (!v._iniciada) { v.iniciar(); v._iniciada = true; }
    v.mostrar();
    window.scrollTo(0, 0);
  }

  ER.registrarVista = function (nombre, vista) { ER.vistas[nombre] = vista; };

  ER.iniciar = function () {
    pintarIconos();
    D.cargar().then(arrancar);
  };

  function arrancar() {
    pintarFuente();
    iniciarRango();
    iniciarVivo();
    document.getElementById("btnAcerca").addEventListener("click", function () {
      cerrarPopovers();
      ER.abrirModal("Acerca de",
        "<p><b>Emergency Radar</b> lee publicaciones de X y muestra en el mapa las emergencias que se reportan en Ecuador.</p>" +
        "<p class='acerca-sub'>Categorías</p><ul class='acerca-cats'>" + D.CATEGORIAS.map(function (c) {
          return "<li>" + window.icon(c.icono) + "<div><b>" + c.nombre + "</b><span>" + ER.escapar(c.descripcion || "") + "</span></div></li>";
        }).join("") + "</ul>" +
        "<p>Los posts se capturan cada 30 minutos. Un modelo decide si cada uno es una emergencia y se ubica por la ciudad que menciona. " +
        "Todas las fechas y horas están en hora de Ecuador (GMT-5).</p>" +
        "<p class='acerca-sub'>Visitas</p>" +
        "<p class='acerca-nota'>Cada persona cuenta una vez cada 6 horas. No se guarda la IP, solo una huella cifrada, el país y la ciudad aproximados.</p>" +
        "<div class='acerca-paper'><p>Implementa el modelo propuesto en:</p>" +
        "<p>Parraga-Alava, J., Rodas-Silva, J., Franco, J. y Vélez, M.-J. (2026). <i>A graph-based semi-supervised approach for automatic text corpus " +
        "emergency events labelling in X (Twitter)</i>. Big Data Research, 45, 100630.</p>" +
        "<p>DOI: <a href='https://doi.org/10.1016/j.bdr.2026.100630' target='_blank' rel='noopener'>https://doi.org/10.1016/j.bdr.2026.100630</a></p></div>");
    });
    document.querySelectorAll("#modal [data-close]").forEach(function (b) { b.addEventListener("click", ER.cerrarModal); });
    document.addEventListener("click", cerrarPopovers);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { cerrarPopovers(); ER.cerrarModal(); }
    });

    // Cualquier cambio de datos o rango refresca la vista activa; las demás se refrescan al abrirse.
    ER.on(function (tipo, dato) {
      Object.keys(ER.vistas).forEach(function (k) {
        var v = ER.vistas[k];
        if (!v._iniciada) return;
        if (k === ER.estado.vista) v.actualizar(tipo, dato);
        else v._pendiente = true;
      });
    });

    window.addEventListener("hashchange", navegar);
    navegar();
  }

  window.ER = ER;
})();

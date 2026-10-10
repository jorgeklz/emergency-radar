/*
 * Emergency Radar · núcleo de la aplicación
 * Estado global, navegación por hash (compatible con GitHub Pages),
 * barra superior, popovers, modal, notificaciones y modo "En Vivo".
 */
(function () {
  "use strict";

  var D = window.ER_DATA;
  var MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function inicioDia(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function finDia(d) { var x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
  function sumarDias(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  var hoy = new Date();
  var ER = {
    estado: {
      desde: inicioDia(sumarDias(hoy, -29)),
      hasta: finDia(hoy),
      enVivo: true,
      vista: "principal"
    },
    vistas: {},
    _oyentes: [],

    // ---------- utilidades compartidas ----------
    pad: pad,
    inicioDia: inicioDia,
    finDia: finDia,
    sumarDias: sumarDias,
    fmtFecha: function (d) { return d.getFullYear() + "/" + pad(d.getMonth() + 1) + "/" + pad(d.getDate()); },
    fmtFechaCorta: function (d) { return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear(); },
    fmtHoraH: function (d) { return pad(d.getHours()) + "h" + pad(d.getMinutes()); },
    fmtHora: function (d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()); },
    fmtLarga: function (d) { return pad(d.getHours()) + ":" + pad(d.getMinutes()) + " · " + d.getDate() + " " + MESES[d.getMonth()] + " " + d.getFullYear(); },
    fmtNum: function (n) { return n.toLocaleString("es-EC"); },
    isoDia: function (d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); },
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
        else if (p === "mes") d = new Date(h.getFullYear(), h.getMonth(), 1);
        else d = sumarDias(h, -(parseInt(p, 10) - 1));
        inDesde.value = ER.isoDia(d);
        inHasta.value = ER.isoDia(h);
      });
    });
    document.getElementById("btnAplicarRango").addEventListener("click", function () {
      if (!inDesde.value || !inHasta.value) { ER.toast("Selecciona ambas fechas"); return; }
      var a = inDesde.value.split("-"), b = inHasta.value.split("-");
      aplicarRango(new Date(+a[0], a[1] - 1, +a[2]), new Date(+b[0], b[1] - 1, +b[2]));
      cerrarPopovers();
    });
    pintarRango();
  }

  // ---------- Modo En Vivo ----------
  var vivoTimer = null;
  function recibir(p) {
    // Si el rango termina hoy, se extiende para incluir la nueva publicación.
    if (ER.isoDia(ER.estado.hasta) === ER.isoDia(p.fecha)) ER.estado.hasta = finDia(p.fecha);
    ER.emitir("nueva", p);
  }
  function programarVivo() {
    clearTimeout(vivoTimer);
    if (!ER.estado.enVivo) return;
    if (D.modo() === "real") {
      // Datos reales: se vuelve a leer el JSON que actualiza el recolector.
      vivoTimer = setTimeout(function () {
        D.sincronizar().then(function (nuevas) {
          nuevas.forEach(recibir);
          pintarFuente();
          programarVivo();
        });
      }, D.INTERVALO_REAL_MS);
      return;
    }
    vivoTimer = setTimeout(function () {
      recibir(D.nuevaPublicacion());
      programarVivo();
    }, 3500 + Math.random() * 5000);
  }
  function pintarVivo() {
    var b = document.getElementById("btnLive");
    b.classList.toggle("is-on", ER.estado.enVivo);
    b.setAttribute("aria-pressed", String(ER.estado.enVivo));
    b.querySelector(".live-label").textContent = ER.estado.enVivo ? "En Vivo" : "Pausado";
  }
  function iniciarVivo() {
    document.getElementById("btnLive").addEventListener("click", function () {
      ER.estado.enVivo = !ER.estado.enVivo;
      pintarVivo();
      programarVivo();
      ER.toast(ER.estado.enVivo ? "Transmisión en vivo activada" : "Transmisión en vivo pausada");
      ER.emitir("vivo");
    });
    pintarVivo();
    programarVivo();
  }

  // ---------- Fuente de datos ----------
  function pintarFuente() {
    var el = document.getElementById("fuenteDatos");
    var real = D.modo() === "real";
    var act = D.actualizado();
    el.classList.toggle("real", real);
    el.textContent = real ? "Datos de X" + (act ? " · " + ER.fmtHora(act) : "") : "Datos simulados";
    el.title = real
      ? "Publicaciones reales capturadas desde la API de X. Última captura: " + (act ? ER.fmtLarga(act) : "desconocida")
      : "Aún no hay datos capturados desde X; se muestran datos simulados";
  }

  // ---------- Navegación ----------
  function rutaActual() {
    var r = (location.hash || "").replace(/^#\/?/, "");
    return ER.vistas[r] ? r : "principal";
  }
  function navegar() {
    var ruta = rutaActual();
    ER.estado.vista = ruta;
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
    enlazarPopover("btnMenu", "popMenu");
    document.querySelectorAll("#popMenu a").forEach(function (a) { a.addEventListener("click", cerrarPopovers); });
    document.querySelector("[data-soon]").addEventListener("click", function () {
      cerrarPopovers();
      ER.toast("Disponible en una próxima versión");
    });
    document.getElementById("btnAcerca").addEventListener("click", function () {
      cerrarPopovers();
      ER.abrirModal("Acerca de Emergency Radar",
        "<p><b>Emergency Radar</b> monitorea publicaciones de redes sociales para detectar " +
        "y ubicar emergencias (asaltos, incendios, accidentes de tránsito y desastres naturales) en Ecuador.</p>" +
        (D.modo() === "real"
          ? "<p>Las publicaciones provienen de la API de X y se actualizan de forma periódica.</p>"
          : "<p>Esta es una versión prototipo. Los datos que ves son simulados y los autores son ficticios.</p>") +
        "<p style='font-size:12px;color:#8a90a2'>Mapa base © OpenStreetMap, © CARTO. Íconos Tabler Icons. Gráficos Chart.js.</p>");
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

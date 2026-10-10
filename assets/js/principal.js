/*
 * Emergency Radar · vista Principal
 * Mapa (geolocalización / mapa de calor), tweets recientes,
 * pre alertas y frecuencia de publicaciones por hora del día.
 */
(function () {
  "use strict";

  var D = window.ER_DATA;
  var ER = window.ER;

  var st = {
    modo: "geo",
    categorias: D.CATEGORIAS.map(function (c) { return c.id; }),
    alertas: { ciudad: "", orden: "menciones", dir: "desc" },
    pendientes: []
  };

  var mapa, capaGrupos, capaCalor, spotlights = [], chart;

  // ================= Utilidades =================
  function filtroBase() {
    return { desde: ER.estado.desde, hasta: ER.estado.hasta, categorias: st.categorias };
  }
  function coincide(p) {
    return p.fecha >= ER.estado.desde && p.fecha <= ER.estado.hasta &&
      st.categorias.indexOf(p.categoria) >= 0;
  }
  function iconoX() {
    return '<span class="x-logo">' + window.icon("brand-x") + "</span>";
  }
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l9 -9"/></svg>';

  function textoEnriquecido(t) {
    return ER.escapar(t)
      .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)(#[\wÁÉÍÓÚáéíóúÑñ]+)/g, '$1<span class="tag">$2</span>');
  }

  // Tarjeta de publicación reutilizada en la lista y en el modal "Ver todo".
  function htmlTweet(p, nuevo) {
    var cat = D.categoria(p.categoria);
    return '<article class="tweet' + (nuevo ? " nuevo" : "") + '">' +
      '<div class="tweet-head">' +
        '<div class="avatar" style="background:' + p.autor.color + '">' + ER.iniciales(p.autor.nombre) + "</div>" +
        '<div class="who"><b>' + ER.escapar(p.autor.nombre) +
          (p.autor.verificado ? ' <span class="verified" title="Cuenta verificada">' + CHECK + "</span>" : "") +
          "</b><small>@" + ER.escapar(p.autor.usuario) + "</small></div>" +
        (p.url
          ? '<a class="tweet-src" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener" title="Ver publicación original">' + iconoX() + "</a>"
          : '<span class="tweet-src">' + iconoX() + "</span>") +
      "</div>" +
      "<p>" + textoEnriquecido(p.texto) + "</p>" +
      '<div class="tweet-foot"><span>' + ER.fmtLarga(p.fecha) + "</span>" +
        (p.url ? '<span>·</span><a class="client" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">Ver en X</a>' : "") +
        '<span class="cat"><i style="background:' + cat.color + '"></i>' + cat.nombre + " · " + p.ciudad + "</span>" +
      "</div>" +
    "</article>";
  }
  ER.htmlTweet = htmlTweet;

  // ================= Chips y filtro del mapa =================
  function pintarChips() {
    var box = document.getElementById("chips");
    if (!st.categorias.length) {
      box.innerHTML = '<span class="placeholder">Ninguna categoría seleccionada</span>';
    } else {
      box.innerHTML = st.categorias.map(function (id) {
        var c = D.categoria(id);
        return '<span class="chip">' + c.nombre + '<button type="button" data-quitar="' + id + '" aria-label="Quitar ' + c.nombre + '">' + window.icon("x") + "</button></span>";
      }).join("");
    }
    box.querySelectorAll("[data-quitar]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var id = b.getAttribute("data-quitar");
        st.categorias = st.categorias.filter(function (x) { return x !== id; });
        alCambiarFiltros();
      });
    });
    document.querySelectorAll("#listaCatFiltro input").forEach(function (i) { i.checked = st.categorias.indexOf(i.value) >= 0; });
  }

  function iniciarFiltroMapa() {
    var lista = document.getElementById("listaCatFiltro");
    lista.innerHTML = D.CATEGORIAS.map(function (c) {
      return '<label><input type="checkbox" value="' + c.id + '" checked>' + window.icon(c.icono) + c.nombre + "</label>";
    }).join("");
    ER.enlazarPopover("btnFiltroMapa", "popFiltroMapa");
    lista.querySelectorAll("input").forEach(function (i) {
      i.addEventListener("change", function () {
        // Se conserva el orden original de las categorías.
        st.categorias = D.CATEGORIAS.map(function (c) { return c.id; }).filter(function (id) {
          return lista.querySelector('input[value="' + id + '"]').checked;
        });
        alCambiarFiltros();
      });
    });
  }

  function alCambiarFiltros() {
    pintarChips();
    pintarMapa();
    pintarTweets();
    pintarFrecuencia();
  }

  // ================= Mapa =================
  function tarjeta(p, total) {
    var c = D.categoria(p.categoria);
    return '<div class="t">' + iconoX() + c.nombre + "</div>" +
      '<div class="row">' + window.icon("calendar-event") + ER.fmtFechaCorta(p.fecha) + "</div>" +
      '<div class="row time">' + ER.fmtHoraH(p.fecha) + "</div>" +
      (total > 1 ? '<div class="count">' + total + " reportes en esta zona</div>" : "");
  }

  function popupPost(p) {
    var c = D.categoria(p.categoria);
    return '<div class="popup-post"><div class="meta">' + iconoX() + "<b>" + c.nombre + "</b> · " + ER.escapar(p.ciudad) + "</div>" +
      "<p>" + textoEnriquecido(p.texto) + "</p>" +
      '<div class="foot">' + ER.escapar(p.autor.nombre) + " · " + ER.fmtLarga(p.fecha) + "</div></div>";
  }

  function iconoGrupo(cluster) {
    var n = cluster.getChildCount();
    var s = n < 10 ? 50 : n < 50 ? 56 : n < 200 ? 62 : 70;
    return L.divIcon({
      html: '<div class="halo"><div class="core">' + n + "</div></div>",
      className: "er-cluster",
      iconSize: [s, s]
    });
  }

  function crearMarcador(p, fresco) {
    var m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({ html: '<div class="halo"><div class="core"></div></div>', className: "er-point" + (fresco ? " fresh" : ""), iconSize: [34, 34] }),
      keyboard: false
    });
    m._erPost = p;
    m.bindPopup(popupPost(p), { maxWidth: 320 });
    return m;
  }

  function ultimoDe(capa) {
    if (capa._erPost) return { post: capa._erPost, total: 1 };
    var hijos = capa.getAllChildMarkers();
    var mejor = hijos[0]._erPost;
    for (var i = 1; i < hijos.length; i++) if (hijos[i]._erPost.fecha > mejor.fecha) mejor = hijos[i]._erPost;
    return { post: mejor, total: hijos.length };
  }

  // Muestra tarjetas fijas sobre los grupos donde ocurrieron los reportes más recientes.
  function refrescarSpotlights() {
    spotlights.forEach(function (capa) { capa.unbindTooltip(); capa._erSpot = false; });
    spotlights = [];
    if (st.modo !== "geo" || !mapa) return;
    var limites = mapa.getBounds().pad(-0.08);
    var vistos = [];
    var marcadores = capaGrupos.getLayers().slice().sort(function (a, b) { return b._erPost.fecha - a._erPost.fecha; });
    for (var i = 0; i < marcadores.length && spotlights.length < 3; i++) {
      var padre = capaGrupos.getVisibleParent(marcadores[i]);
      if (!padre || vistos.indexOf(padre) >= 0) continue;
      var ll = padre.getLatLng();
      if (!limites.contains(ll)) continue;
      var pt = mapa.latLngToContainerPoint(ll);
      if (pt.y < 150) continue;
      var choca = spotlights.some(function (s) { return mapa.latLngToContainerPoint(s.getLatLng()).distanceTo(pt) < 200; });
      vistos.push(padre);
      if (choca) continue;
      var info = ultimoDe(padre);
      padre.bindTooltip(tarjeta(info.post, info.total), {
        permanent: true, direction: "top", className: "er-card", offset: [0, -24], interactive: false
      }).openTooltip();
      padre._erSpot = true;
      spotlights.push(padre);
    }
  }
  var spotTimer;
  function programarSpotlights() { clearTimeout(spotTimer); spotTimer = setTimeout(refrescarSpotlights, 80); }

  function iniciarMapa() {
    mapa = L.map("map", { zoomControl: true, minZoom: 5, maxZoom: 17, worldCopyJump: false })
      .setView([-1.86, -79.75], 8);
    // Mosaicos oficiales de OpenStreetMap: no requieren API key (solo la atribución).
    // En CSS se pasan a escala de grises para seguir la línea gráfica del diseño.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(mapa);
    mapa.zoomControl.setPosition("bottomright");

    capaGrupos = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 70,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: iconoGrupo
    });
    capaGrupos.on("clustermouseover", function (e) {
      var c = e.layer;
      if (c._erSpot) return;
      var info = ultimoDe(c);
      c.bindTooltip(tarjeta(info.post, info.total), { direction: "top", className: "er-card", offset: [0, -24] }).openTooltip();
    });
    capaGrupos.on("clustermouseout", function (e) { if (!e.layer._erSpot) e.layer.unbindTooltip(); });
    capaGrupos.on("animationend", programarSpotlights);
    mapa.on("moveend", programarSpotlights);

    // Evita que la capa de calor dibuje cuando el mapa está oculto (tamaño 0).
    var redibujar = L.HeatLayer.prototype._redraw;
    L.HeatLayer.prototype._redraw = function () {
      if (!this._map || this._map.getSize().x === 0 || this._map.getSize().y === 0) { this._frame = null; return; }
      return redibujar.call(this);
    };
    capaCalor = L.heatLayer([], {
      radius: 26, blur: 22, maxZoom: 12, max: 6, minOpacity: 0.25,
      gradient: { 0.2: "#cfe0fb", 0.45: "#6aa5f2", 0.7: "#2f7be5", 1: "#2e3192" }
    });

    document.querySelectorAll(".segmented button").forEach(function (b) {
      b.addEventListener("click", function () {
        st.modo = b.getAttribute("data-modo");
        document.querySelectorAll(".segmented button").forEach(function (x) {
          var on = x === b;
          x.classList.toggle("active", on);
          x.setAttribute("aria-selected", String(on));
        });
        aplicarModo();
      });
    });
    aplicarModo();
  }

  function aplicarModo() {
    if (st.modo === "geo") {
      if (mapa.hasLayer(capaCalor)) mapa.removeLayer(capaCalor);
      if (!mapa.hasLayer(capaGrupos)) mapa.addLayer(capaGrupos);
    } else {
      if (mapa.hasLayer(capaGrupos)) mapa.removeLayer(capaGrupos);
      if (!mapa.hasLayer(capaCalor)) mapa.addLayer(capaCalor);
    }
    pintarLeyendaMapa();
    programarSpotlights();
  }

  function pintarLeyendaMapa(total) {
    if (typeof total === "number") pintarLeyendaMapa._t = total;
    total = pintarLeyendaMapa._t || 0;
    var el = document.getElementById("mapLegend");
    var base = "<span>" + ER.fmtNum(total) + " publicaciones geolocalizadas en el periodo</span>";
    el.innerHTML = st.modo === "geo"
      ? '<span><i class="dot"></i>Reporte o grupo de reportes (el número indica cuántos)</span>' + base
      : "<span>Densidad de reportes: baja<i class=\"ramp\"></i>alta</span>" + base;
  }

  function pintarMapa() {
    var f = filtroBase(); f.soloGeo = true;
    var posts = D.filtrar(f);
    spotlights.forEach(function (c) { c.unbindTooltip(); c._erSpot = false; });
    spotlights = [];
    capaGrupos.clearLayers();
    capaGrupos.addLayers(posts.map(function (p) { return crearMarcador(p, false); }));
    capaCalor.setLatLngs(posts.map(function (p) { return [p.lat, p.lng, 1]; }));
    pintarLeyendaMapa(posts.length);
    programarSpotlights();
  }

  // ================= Tweets recientes =================
  function pintarTweets() {
    var excluidos = {};
    st.pendientes.forEach(function (p) { excluidos[p.id] = true; });
    var lista = D.filtrar(filtroBase()).filter(function (p) { return !excluidos[p.id]; }).slice(0, 40);
    var cont = document.getElementById("tweets");
    cont.innerHTML = lista.length ? lista.map(function (p) { return htmlTweet(p); }).join("") :
      '<div class="empty">' + ER.mensajeSinDatos("No hay publicaciones para los filtros seleccionados.") + "</div>";
    pintarPildora();
  }

  function pintarPildora() {
    var visibles = st.pendientes.filter(coincide);
    var pill = document.getElementById("pillNuevos");
    pill.hidden = visibles.length === 0;
    pill.textContent = visibles.length + (visibles.length === 1 ? " tweet nuevo" : " tweets nuevos");
  }

  function mostrarPendientes() {
    var nuevos = st.pendientes.filter(coincide);
    st.pendientes = [];
    pintarTweets();
    var cont = document.getElementById("tweets");
    var html = nuevos.map(function (p) { return htmlTweet(p, true); }).join("");
    var vacio = cont.querySelector(".empty");
    if (vacio) cont.innerHTML = html; else cont.insertAdjacentHTML("afterbegin", html);
    cont.scrollTo({ top: 0, behavior: "smooth" });
  }

  function verTodo() {
    var opciones = '<option value="">Todas las categorías</option>' + D.CATEGORIAS.map(function (c) {
      return '<option value="' + c.id + '">' + c.nombre + "</option>";
    }).join("");
    ER.abrirModal("Todas las publicaciones del periodo",
      '<div class="filters"><label class="search"><span class="ic-wrap" data-icon="search"></span>' +
      '<input type="search" id="vtBuscar" placeholder="Buscar texto, autor o ciudad"></label>' +
      '<select id="vtCat" aria-label="Categoría">' + opciones + "</select></div>" +
      '<p id="vtInfo" style="margin:0 0 10px;font-size:12px"></p><div class="tweets" id="vtLista"></div>',
      function (body) {
        function render() {
          var cat = body.querySelector("#vtCat").value;
          var res = D.filtrar({
            desde: ER.estado.desde, hasta: ER.estado.hasta,
            categorias: cat ? [cat] : st.categorias,
            texto: body.querySelector("#vtBuscar").value.trim()
          });
          body.querySelector("#vtInfo").textContent = res.length > 100
            ? "Mostrando las 100 más recientes de " + ER.fmtNum(res.length) + " publicaciones"
            : ER.fmtNum(res.length) + " publicaciones";
          body.querySelector("#vtLista").innerHTML = res.slice(0, 100).map(function (p) { return htmlTweet(p); }).join("") ||
            '<div class="empty">Sin resultados.</div>';
        }
        body.querySelector("#vtBuscar").addEventListener("input", render);
        body.querySelector("#vtCat").addEventListener("change", render);
        render();
      });
  }

  // ================= Pre alertas =================
  function ventanaAlertas() {
    var fin = new Date(Math.min(Date.now(), ER.estado.hasta.getTime()));
    var ini = new Date(fin.getTime() - 24 * 3600 * 1000);
    return { desde: ini, hasta: fin, prevDesde: new Date(ini.getTime() - 24 * 3600 * 1000) };
  }

  function pintarAlertas() {
    var a = st.alertas;
    var v = ventanaAlertas();
    var ciudad = a.ciudad || null;
    var actual = D.filtrar({ desde: v.desde, hasta: v.hasta, ciudad: ciudad });
    var previo = D.filtrar({ desde: v.prevDesde, hasta: new Date(v.desde.getTime() - 1), ciudad: ciudad });
    var filas = D.CATEGORIAS.map(function (c) {
      var n = actual.filter(function (p) { return p.categoria === c.id; }).length;
      var m = previo.filter(function (p) { return p.categoria === c.id; }).length;
      var tend = m === 0 ? (n > 0 ? "up" : "flat") : n / m > 1.1 ? "up" : n / m < 0.9 ? "down" : "flat";
      return { c: c, n: n, m: m, tend: tend };
    });
    filas.sort(function (x, y) {
      var r = a.orden === "nombre" ? x.c.nombre.localeCompare(y.c.nombre, "es") : x.n - y.n;
      return a.dir === "asc" ? r : -r;
    });
    document.getElementById("alertsBody").innerHTML = filas.map(function (f) {
      var tr = f.tend === "up" ? window.icon("trending-up") : f.tend === "down" ? window.icon("trending-down") : "";
      var titulo = "Últimas 24 h: " + f.n + " · 24 h previas: " + f.m;
      return '<tr class="' + (f.tend === "up" ? "up" : "") + '" title="' + titulo + '">' +
        '<td><div class="alert-cat">' + window.icon(f.c.icono) + f.c.nombre + "</div></td>" +
        '<td><div class="alert-num"><span class="n">' + ER.fmtNum(f.n) + '</span><span class="lbl">menciones</span>' +
        '<span class="tr" aria-label="' + (f.tend === "up" ? "En aumento" : f.tend === "down" ? "En descenso" : "Estable") + '">' + tr + "</span></div></td></tr>";
    }).join("");
    document.querySelectorAll(".alerts .sort").forEach(function (b) {
      b.classList.remove("asc", "desc");
      if (b.getAttribute("data-sort") === a.orden) b.classList.add(a.dir);
    });
  }

  function iniciarAlertas() {
    var sel = document.getElementById("selCiudadAlertas");
    ER.enlazarPopover("btnFiltrosAlertas", "popAlertas", opcionesCiudadAlertas);
    sel.addEventListener("change", function () { st.alertas.ciudad = sel.value; pintarAlertas(); marcarFiltrosAlertas(); });
    document.querySelectorAll(".alerts .sort").forEach(function (b) {
      b.addEventListener("click", function () {
        var k = b.getAttribute("data-sort");
        if (st.alertas.orden === k) st.alertas.dir = st.alertas.dir === "asc" ? "desc" : "asc";
        else { st.alertas.orden = k; st.alertas.dir = k === "nombre" ? "asc" : "desc"; }
        pintarAlertas();
      });
    });
    var h2 = document.querySelector(".card-alerts h2");
    h2.insertAdjacentHTML("afterend", '<span class="hint" style="margin:0 auto 0 0">Últimas 24 horas</span>');
  }
  // Las ciudades del filtro salen de los datos capturados, con su número de publicaciones.
  function opcionesCiudadAlertas() {
    var sel = document.getElementById("selCiudadAlertas");
    sel.innerHTML = '<option value="">Todas</option>' + D.ciudadesPresentes().map(function (c) {
      return '<option value="' + ER.escapar(c.nombre) + '">' + ER.escapar(c.nombre) + " (" + c.total + ")</option>";
    }).join("");
    sel.value = st.alertas.ciudad;
  }
  function marcarFiltrosAlertas() {
    document.getElementById("btnFiltrosAlertas").textContent = st.alertas.ciudad ? "Filtros (1)" : "Filtros";
  }

  // ================= Frecuencia =================
  var ETIQUETAS = [];
  for (var i = 0; i < 48; i++) ETIQUETAS.push(ER.pad(Math.floor(i / 2)) + ":" + (i % 2 ? "30" : "00"));

  function porFranja(posts) {
    var arr = new Array(48).fill(0);
    posts.forEach(function (p) { arr[p.fecha.getHours() * 2 + (p.fecha.getMinutes() >= 30 ? 1 : 0)]++; });
    return arr;
  }

  var lineaGuia = {
    id: "lineaGuia",
    afterDatasetsDraw: function (c) {
      var act = c.tooltip && c.tooltip.getActiveElements();
      if (!act || !act.length) return;
      var x = act[0].element.x, ctx = c.ctx, a = c.chartArea;
      ctx.save();
      ctx.strokeStyle = "rgba(46,49,146,.18)";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, a.top); ctx.lineTo(x, a.bottom); ctx.stroke();
      ctx.restore();
    }
  };

  function tooltipExterno(ctx) {
    var tip = document.getElementById("tipFreq");
    var t = ctx.tooltip;
    if (!t || t.opacity === 0) { tip.hidden = true; return; }
    var i = t.dataPoints[0].dataIndex;
    var ds = ctx.chart.data.datasets;
    tip.innerHTML = '<div class="h">' + ETIQUETAS[i] + "</div>" +
      '<div class="v"><i></i>' + ER.fmtNum(ds[0].data[i]) + " tweets</div>" +
      '<div class="v prev"><i></i>' + ER.fmtNum(ds[1].data[i]) + " periodo anterior</div>";
    var y = Math.min(ctx.chart.scales.y.getPixelForValue(ds[0].data[i]), ctx.chart.scales.y.getPixelForValue(ds[1].data[i]));
    tip.style.left = (ctx.chart.canvas.offsetLeft + t.caretX) + "px";
    tip.style.top = (ctx.chart.canvas.offsetTop + Math.max(y, 50)) + "px";
    tip.hidden = false;
  }

  function iniciarFrecuencia() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#8a90a2";
    chart = new Chart(document.getElementById("chartFreq"), {
      type: "line",
      data: {
        labels: ETIQUETAS,
        datasets: [
          { label: "Periodo seleccionado", data: [], borderColor: "#2f7be5", borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: "#2f7be5", pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2, tension: 0, order: 1 },
          { label: "Periodo anterior", data: [], borderColor: "#d3dae6", borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: "#c4ccdb", pointHoverBorderColor: "#fff", tension: 0, order: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 },
        interaction: { mode: "index", intersect: false },
        layout: { padding: { top: 24 } },
        plugins: {
          legend: { display: false },
          tooltip: { enabled: false, external: tooltipExterno }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              autoSkip: false, maxRotation: 0, font: { size: 13 }, color: "#6b7184",
              callback: function (v, i) {
                // En pantallas angostas se muestra una etiqueta cada 6 h en lugar de cada 2 h.
                var paso = this.chart.width < 640 ? 12 : 4;
                return i % paso === 0 ? ETIQUETAS[i] : i === 47 && paso === 4 ? "23:59" : "";
              }
            }
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: "#eef0f5" },
            ticks: { maxTicksLimit: 5, precision: 0, font: { size: 13 }, color: "#6b7184", padding: 14 }
          }
        }
      },
      plugins: [lineaGuia]
    });
    document.getElementById("chartFreq").addEventListener("mouseleave", function () { document.getElementById("tipFreq").hidden = true; });
  }

  function pintarFrecuencia() {
    var actual = D.filtrar(filtroBase());
    var ant = ER.periodoAnterior();
    var previo = D.filtrar({ desde: ant.desde, hasta: ant.hasta, categorias: st.categorias });
    chart.data.datasets[0].data = porFranja(actual);
    chart.data.datasets[1].data = porFranja(previo);
    chart.update();
  }

  // ================= Ciclo de vida =================
  var refrescoTimer;
  function refrescoDiferido() {
    clearTimeout(refrescoTimer);
    refrescoTimer = setTimeout(function () { pintarAlertas(); pintarFrecuencia(); }, 400);
  }

  function pintarTodo() {
    pintarChips();
    pintarMapa();
    pintarTweets();
    pintarAlertas();
    pintarFrecuencia();
  }

  ER.registrarVista("principal", {
    iniciar: function () {
      iniciarFiltroMapa();
      iniciarMapa();
      iniciarAlertas();
      iniciarFrecuencia();
      document.getElementById("pillNuevos").addEventListener("click", mostrarPendientes);
      document.getElementById("btnVerTodo").addEventListener("click", verTodo);
      pintarTodo();
    },
    mostrar: function () {
      if (this._pendiente) { this._pendiente = false; pintarTodo(); }
      setTimeout(function () { mapa.invalidateSize(); programarSpotlights(); }, 0);
    },
    actualizar: function (tipo, p) {
      if (tipo === "rango") { st.pendientes = st.pendientes.filter(coincide); pintarTodo(); return; }
      if (tipo === "nueva") {
        st.pendientes.unshift(p);
        pintarPildora();
        if (coincide(p) && p.lat !== null) {
          capaGrupos.addLayer(crearMarcador(p, true));
          capaCalor.addLatLng([p.lat, p.lng, 1]);
          pintarLeyendaMapa((pintarLeyendaMapa._t || 0) + 1);
        }
        refrescoDiferido();
      }
    }
  });
})();

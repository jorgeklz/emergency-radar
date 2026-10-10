/*
 * Emergency Radar · vista Principal
 * Mapa (geolocalización / mapa de calor), posts recientes,
 * pre-alertas y frecuencia de publicaciones por hora del día.
 */
(function () {
  "use strict";

  var D = window.ER_DATA;
  var ER = window.ER;

  // Los filtros (categorías, ciudad, clasificación del modelo) viven en ER.filtros
  // y se comparten con Histórico y Estadísticas.
  var st = {
    modo: "geo",
    alertas: { horas: 6, abiertas: {} },
    pendientes: []
  };

  var mapa, capaGrupos, capaCalor, spotlights = [], chart;

  // ================= Utilidades =================
  function filtroBase() { return ER.consulta(); }
  // ¿La publicación pasa los filtros actuales? (misma regla que D.filtrar)
  function coincide(p) {
    var f = ER.filtros;
    if (p.fecha < ER.estado.desde || p.fecha > ER.estado.hasta) return false;
    if (f.categorias.indexOf(p.categoria) < 0) return false;
    if (f.ciudad && p.ciudad !== f.ciudad) return false;
    if (f.clasificacion === "emergencias" && p.emergencia === false) return false;
    if (f.clasificacion === "descartadas" && p.emergencia !== false) return false;
    return true;
  }

  // Resultado del modelo LSI + kNN, con la explicación de los vecinos.
  function etiquetaModelo(p) {
    if (p.emergencia === null) return "";
    var k = (D.modelo() || {}).k || 7;
    var detalle = p.vecinos !== null ? p.vecinos + " de " + k + " publicaciones parecidas del corpus son emergencias" : "";
    var g = ER.severidad(p).nivel;
    return p.emergencia
      ? '<span class="modelo grav-' + g.id + '" title="' + g.nombre + ". " + detalle + '"><i></i>Emergencia ' + Math.round(p.prob * 100) + " %</span>"
      : '<span class="modelo grav-baja" title="' + detalle + '"><i></i>Descartada por el modelo</span>';
  }
  ER.etiquetaModelo = etiquetaModelo;
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
  // Tarjeta compacta: autor y hora en la cabecera, texto en hasta 3 líneas (clic para ver todo)
  // y una sola línea con categoría, ciudad y decisión del modelo.
  function htmlPost(p, nuevo) {
    var cat = D.categoria(p.categoria);
    var g = ER.severidad(p).nivel;
    var k = (D.modelo() || {}).k || 7;
    var modelo = "";
    if (p.emergencia !== null) {
      var detalle = p.vecinos !== null ? p.vecinos + " de " + k + " publicaciones parecidas del corpus son emergencias" : "";
      modelo = '<span class="pm-sep">·</span><span class="pm-modelo grav-' + (p.emergencia ? g.id : "baja") + '" title="' + g.nombre + ". " + detalle + '">' +
        window.icon("tag") + (p.emergencia ? "Emergencia " + Math.round(p.prob * 100) + " %" : "Descartada") + "</span>";
    }
    return '<article class="post' + (nuevo ? " nuevo" : "") + '">' +
      '<div class="post-head">' +
        '<div class="avatar" style="background:' + p.autor.color + '">' + ER.iniciales(p.autor.nombre) + "</div>" +
        '<div class="who"><b>' + ER.escapar(p.autor.nombre) +
          (p.autor.verificado ? ' <span class="verified" title="Cuenta verificada">' + CHECK + "</span>" : "") +
          "</b><small>@" + ER.escapar(p.autor.usuario) + " · " + ER.htmlHace(p.fecha) + "</small></div>" +
        (p.url
          ? '<a class="post-src" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener" title="Ver en X">' + iconoX() + "</a>"
          : '<span class="post-src">' + iconoX() + "</span>") +
      "</div>" +
      '<p class="post-texto" title="Clic para ver el texto completo">' + textoEnriquecido(p.texto) + "</p>" +
      '<div class="post-meta">' +
        '<span class="pm-cat" style="--k:' + cat.color + '">' + window.icon(cat.icono) + cat.nombre + "</span>" +
        '<span class="pm-sep">·</span><span class="pm-ciudad">' + window.icon("map-pin") + ER.escapar(p.ciudad) + "</span>" +
        modelo +
      "</div>" +
    "</article>";
  }
  ER.htmlPost = htmlPost;

  // ================= Chips y filtros ("Estás viendo") =================
  var CLASES = {
    emergencias: "Solo emergencias (según el modelo)",
    todas: "Todas las publicaciones",
    descartadas: "Solo las descartadas por el modelo"
  };

  function pintarChips() {
    var f = ER.filtros;
    var box = document.getElementById("chips");
    var chips = f.categorias.map(function (id) {
      var c = D.categoria(id);
      return '<span class="chip">' + c.nombre + '<button type="button" data-quitar="cat:' + id + '" aria-label="Quitar ' + c.nombre + '">' + window.icon("x") + "</button></span>";
    });
    if (f.ciudad) chips.push('<span class="chip chip-ciudad">' + window.icon("map-pin") + ER.escapar(f.ciudad) +
      '<button type="button" data-quitar="ciudad" aria-label="Quitar ciudad">' + window.icon("x") + "</button></span>");
    if (f.clasificacion !== "emergencias") chips.push('<span class="chip chip-modelo">' + (f.clasificacion === "todas" ? "Incluye descartadas" : "Solo descartadas") +
      '<button type="button" data-quitar="clasificacion" aria-label="Volver a solo emergencias">' + window.icon("x") + "</button></span>");
    box.innerHTML = chips.length ? chips.join("") : '<span class="placeholder">Ninguna categoría seleccionada</span>';
    box.querySelectorAll("[data-quitar]").forEach(function (b) {
      b.addEventListener("click", function (ev) {
        ev.stopPropagation();
        var q = b.getAttribute("data-quitar");
        if (q === "ciudad") ER.cambiarFiltros({ ciudad: "" });
        else if (q === "clasificacion") ER.cambiarFiltros({ clasificacion: "emergencias" });
        else ER.cambiarFiltros({ categorias: f.categorias.filter(function (x) { return "cat:" + x !== q; }) });
      });
    });
    document.querySelectorAll("#listaCatFiltro input").forEach(function (i) { i.checked = f.categorias.indexOf(i.value) >= 0; });
    document.getElementById("selCiudadMapa").value = f.ciudad;
    document.getElementById("selClaseMapa").value = f.clasificacion;
    document.getElementById("selCiudadAlertas").value = f.ciudad;
    document.getElementById("btnFiltrosAlertas").textContent = f.ciudad ? "Filtros (1)" : "Filtros";
  }

  // Las ciudades salen de los datos capturados, con su número de publicaciones.
  function opcionesCiudad(sel) {
    sel.innerHTML = '<option value="">Todas las ciudades</option>' + D.ciudadesPresentes().map(function (c) {
      return '<option value="' + ER.escapar(c.nombre) + '">' + ER.escapar(c.nombre) + " (" + c.total + ")</option>";
    }).join("");
    sel.value = ER.filtros.ciudad;
  }

  function iniciarFiltroMapa() {
    var lista = document.getElementById("listaCatFiltro");
    lista.innerHTML = D.CATEGORIAS.map(function (c) {
      return '<label><input type="checkbox" value="' + c.id + '" checked>' + window.icon(c.icono) + c.nombre + "</label>";
    }).join("");
    var selCiudad = document.getElementById("selCiudadMapa");
    var selClase = document.getElementById("selClaseMapa");
    selClase.innerHTML = Object.keys(CLASES).map(function (k) { return '<option value="' + k + '">' + CLASES[k] + "</option>"; }).join("");
    ER.enlazarPopover("btnFiltroMapa", "popFiltroMapa", function () { opcionesCiudad(selCiudad); });
    lista.querySelectorAll("input").forEach(function (i) {
      i.addEventListener("change", function () {
        ER.cambiarFiltros({ categorias: Array.prototype.map.call(lista.querySelectorAll("input:checked"), function (x) { return x.value; }) });
      });
    });
    selCiudad.addEventListener("change", function () { ER.cambiarFiltros({ ciudad: selCiudad.value }); });
    selClase.addEventListener("change", function () { ER.cambiarFiltros({ clasificacion: selClase.value }); });
  }

  // ================= Mapa =================
  // Etiqueta fija: solo el ícono de la categoría (con su color de gravedad) y hace cuánto.
  function etiquetaMini(p) {
    var g = ER.severidad(p).nivel, gc = ER.CALOR[g.id].color, c = D.categoria(p.categoria);
    return '<span class="mini-ic" style="--g:' + g.color + '" title="' + c.nombre + " · " + g.nombre + '">' + window.icon(c.icono) + "</span>" +
      '<span class="mini-hace">' + ER.haceCorto(p.fecha) + "</span>";
  }

  // Al pasar por un punto: categoría, hace cuánto y la confianza del modelo, en una línea.
  function etiquetaPunto(p) {
    var g = ER.severidad(p).nivel, gc = ER.CALOR[g.id].color, c = D.categoria(p.categoria);
    return '<span class="mini-ic" style="--g:' + g.color + '">' + window.icon(c.icono) + "</span><b>" + c.nombre + "</b>" +
      '<span class="mini-hace">' + ER.haceCorto(p.fecha) + "</span>" +
      (typeof p.prob === "number" ? '<span class="mini-prob" style="--g:' + g.color + '">' + Math.round(p.prob * 100) + " %</span>" : "");
  }

  // Detalle compacto de un grupo: total, conteo por categoría con íconos y una línea del último post.
  function tarjeta(p, total, porCat) {
    var g = ER.severidad(p).nivel, gc = ER.CALOR[g.id].color;
    var chips = D.CATEGORIAS.filter(function (x) { return porCat && porCat[x.id]; }).map(function (x) {
      return '<span class="chip-cat" title="' + x.nombre + '" style="--k:' + x.color + '">' + window.icon(x.icono) + porCat[x.id] + "</span>";
    }).join("");
    return '<div class="g-cab"><b>' + total + " reportes</b><span>último " + ER.haceCorto(p.fecha) + "</span></div>" +
      (chips ? '<div class="g-chips">' + chips + "</div>" : "") +
      '<div class="extracto"><span class="mini-dot" style="background:' + gc + '"></span>' +
      ER.escapar(p.texto.length > 70 ? p.texto.slice(0, 70) + "…" : p.texto) + "</div>";
  }

  function popupPost(p) {
    var c = D.categoria(p.categoria);
    return '<div class="popup-post"><div class="meta"><i class="punto" style="background:' + c.color + '"></i><b>' + c.nombre + "</b> · " + ER.escapar(p.ciudad) + "</div>" +
      "<p>" + textoEnriquecido(p.texto) + "</p>" +
      '<div class="foot">' + ER.escapar(p.autor.nombre) + " · " + ER.fmtLarga(p.fecha) + " (" + ER.hace(p.fecha) + ")</div>" +
      '<div class="foot2">' + etiquetaModelo(p) +
      (p.url ? '<a class="link-x" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">' + window.icon("brand-x") + "Ver en X</a>" : "") +
      "</div></div>";
  }

  function iconoGrupo(cluster) {
    var n = cluster.getChildCount();
    var s = n < 10 ? 50 : n < 50 ? 56 : n < 200 ? 62 : 70;
    var nivel = ER.nivelPorCantidad(n);
    return L.divIcon({
      html: '<div class="halo" style="--c:' + nivel.color + '"><div class="core">' + n + "</div></div>",
      className: "er-cluster er-" + nivel.id,
      iconSize: [s, s]
    });
  }

  function crearMarcador(p, fresco) {
    var g = ER.severidad(p).nivel;
    var reciente = Date.now() - p.fecha < 3600000;
    var m = L.marker([p.lat, p.lng], {
      icon: L.divIcon({
        html: '<div class="halo" style="--c:' + g.color + '"><div class="core">' + window.icon(D.categoria(p.categoria).icono) + "</div></div>",
        className: "er-point er-" + g.id + (fresco ? " fresh" : "") + (reciente ? " reciente" : ""), iconSize: [34, 34] }),
      keyboard: false
    });
    m._erPost = p;
    m.bindPopup(popupPost(p), { maxWidth: 320 });
    m.bindTooltip(function () { return etiquetaPunto(p); }, { direction: "top", className: "er-mini", offset: [0, -14] });
    return m;
  }

  function ultimoDe(capa) {
    if (capa._erPost) return { post: capa._erPost, total: 1, porCat: {} };
    var hijos = capa.getAllChildMarkers();
    var mejor = hijos[0]._erPost, porCat = {};
    hijos.forEach(function (h) {
      var p = h._erPost;
      porCat[p.categoria] = (porCat[p.categoria] || 0) + 1;
      if (p.fecha > mejor.fecha) mejor = p;
    });
    return { post: mejor, total: hijos.length, porCat: porCat };
  }

  // Muestra tarjetas fijas sobre los grupos donde ocurrieron los reportes más recientes.
  function refrescarSpotlights() {
    spotlights.forEach(function (capa) { capa.unbindTooltip(); capa._erSpot = false; });
    spotlights = [];
    if (st.modo !== "geo" || !mapa) return;
    var limites = mapa.getBounds().pad(-0.08);
    var vistos = [];
    var marcadores = capaGrupos.getLayers().slice().sort(function (a, b) { return b._erPost.fecha - a._erPost.fecha; });
    for (var i = 0; i < marcadores.length && spotlights.length < 5; i++) {
      var padre = capaGrupos.getVisibleParent(marcadores[i]);
      if (!padre || vistos.indexOf(padre) >= 0) continue;
      var ll = padre.getLatLng();
      if (!limites.contains(ll)) continue;
      var pt = mapa.latLngToContainerPoint(ll);
      if (pt.y < 60) continue;
      // La etiqueta ocupa unos 60 x 20 px por encima del punto: se evita que choque con otra.
      var choca = spotlights.some(function (s) {
        var q = mapa.latLngToContainerPoint(s.getLatLng());
        return Math.abs(q.x - pt.x) < 70 && Math.abs(q.y - pt.y) < 30;
      });
      vistos.push(padre);
      if (choca) continue;
      var info = ultimoDe(padre);
      // Las tarjetas fijas van compactas; el desglose por categoría se ve al pasar el cursor.
      padre.bindTooltip(etiquetaMini(info.post), {
        permanent: true, direction: "top", className: "er-mini er-fija", offset: [0, -20], interactive: false
      }).openTooltip();
      padre._erSpot = true;
      spotlights.push(padre);
    }
  }
  var spotTimer;
  function programarSpotlights() { clearTimeout(spotTimer); spotTimer = setTimeout(refrescarSpotlights, 80); }

  // Botón para centrar el mapa en la ubicación actual del dispositivo (pide permiso al navegador).
  function controlUbicacion() {
    var Control = L.Control.extend({
      options: { position: "bottomright" },
      onAdd: function (m) {
        var caja = L.DomUtil.create("div", "leaflet-bar");
        var btn = L.DomUtil.create("button", "ctl-ubicacion", caja);
        var yo = null, area = null;
        // Panel propio por encima de las etiquetas para que el punto azul nunca quede tapado.
        if (!m.getPane("erYo")) m.createPane("erYo").style.zIndex = 660;
        btn.type = "button";
        btn.title = "Mi ubicación";
        btn.setAttribute("aria-label", "Mostrar mi ubicación actual");
        btn.innerHTML = window.icon("current-location");
        L.DomEvent.disableClickPropagation(caja);
        L.DomEvent.on(btn, "click", function () {
          if (!navigator.geolocation) { ER.toast("Este navegador no permite obtener la ubicación."); return; }
          btn.classList.add("buscando");
          btn.innerHTML = window.icon("loader-2");
          navigator.geolocation.getCurrentPosition(function (pos) {
            var ll = [pos.coords.latitude, pos.coords.longitude], r = pos.coords.accuracy || 0;
            btn.classList.remove("buscando"); btn.classList.add("activa");
            btn.innerHTML = window.icon("current-location");
            if (yo) { m.removeLayer(yo); m.removeLayer(area); }
            area = L.circle(ll, { radius: r, color: "#2f7be5", weight: 1, opacity: .5, fillColor: "#2f7be5", fillOpacity: .1, interactive: false }).addTo(m);
            yo = L.marker(ll, { icon: L.divIcon({ className: "er-yo", html: "<span></span>", iconSize: [18, 18] }), pane: "erYo", keyboard: false })
              .bindTooltip("Estás aquí" + (r ? " (± " + Math.round(r) + " m)" : ""), { direction: "top", className: "er-mini", offset: [0, -10] }).addTo(m);
            m.flyTo(ll, Math.max(m.getZoom(), r && r < 2000 ? 13 : 11), { duration: .8 });
          }, function (err) {
            btn.classList.remove("buscando");
            btn.innerHTML = window.icon("current-location");
            ER.toast(err.code === 1 ? "Permiso de ubicación denegado en el navegador." : "No se pudo obtener tu ubicación.");
          }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
        });
        return caja;
      }
    });
    return new Control();
  }

  function iniciarMapa() {
    mapa = L.map("map", { zoomControl: true, minZoom: 5, maxZoom: 17, worldCopyJump: false })
      .setView([-1.86, -79.75], 8);
    // Mapas base sin API key. Por defecto "Humanitario" (OpenStreetMap, estilo HOT); se puede
    // cambiar desde el control de capas y la elección se recuerda en este navegador.
    var osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    var bases = {
      "Calles": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: osm, maxZoom: 19 }),
      "Humanitario": L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
        attribution: osm + ', estilo <a href="https://www.hotosm.org/">HOT</a>', subdomains: "abc", maxZoom: 19 }),
      "Gris": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: osm, maxZoom: 19, className: "tiles-gris" }),
      "Satélite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Imágenes &copy; Esri", maxZoom: 19 })
    };
    var elegida = "Humanitario";
    try { if (bases[localStorage.getItem("er-mapa-base-v2")]) elegida = localStorage.getItem("er-mapa-base-v2"); } catch (e) { /* sin almacenamiento */ }
    bases[elegida].addTo(mapa);
    L.control.layers(bases, null, { position: "topright", collapsed: true }).addTo(mapa);
    mapa.on("baselayerchange", function (e) {
      try { localStorage.setItem("er-mapa-base-v2", e.name); } catch (err) { /* sin almacenamiento */ }
    });
    mapa.zoomControl.setPosition("bottomright");
    controlUbicacion().addTo(mapa);

    capaGrupos = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 70,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: iconoGrupo
    });
    // Al pasar el cursor por un grupo aparece el detalle breve; al salir vuelve la etiqueta mínima (o nada).
    capaGrupos.on("clustermouseover", function (e) {
      var c = e.layer, info = ultimoDe(c);
      if (c._erSpot) { c.unbindTooltip(); }
      c.bindTooltip(tarjeta(info.post, info.total, info.porCat), { direction: "top", className: "er-card", offset: [0, -22] }).openTooltip();
    });
    capaGrupos.on("clustermouseout", function (e) {
      var c = e.layer;
      c.unbindTooltip();
      if (c._erSpot) {
        var info = ultimoDe(c);
        c.bindTooltip(etiquetaMini(info.post), { permanent: true, direction: "top", className: "er-mini er-fija", offset: [0, -20] }).openTooltip();
      }
    });
    capaGrupos.on("animationend", programarSpotlights);
    mapa.on("moveend", programarSpotlights);

    // Evita que la capa de calor dibuje cuando el mapa está oculto (tamaño 0).
    var redibujar = L.HeatLayer.prototype._redraw;
    L.HeatLayer.prototype._redraw = function () {
      if (!this._map || this._map.getSize().x === 0 || this._map.getSize().y === 0) { this._frame = null; return; }
      return redibujar.call(this);
    };
    // Cada post pesa según su gravedad, así el calor refleja peligro y no solo cantidad.
    // Blanco = sin peligro, amarillo = medio, anaranjado = alto, rojo = extremo.
    capaCalor = L.heatLayer([], {
      radius: 34, blur: 24, maxZoom: 11, max: 2.5, minOpacity: 0.55,
      gradient: { 0.05: "#ffffff", 0.3: "#fff3a0", 0.5: "#ffd000", 0.7: "#ff8c00", 0.88: "#f03e3e", 1: "#c00000" }
    });

    document.querySelectorAll(".card-map .segmented button").forEach(function (b) {
      b.addEventListener("click", function () {
        st.modo = b.getAttribute("data-modo");
        document.querySelectorAll(".card-map .segmented button").forEach(function (x) {
          var on = x === b;
          x.classList.toggle("active", on);
          x.setAttribute("aria-selected", String(on));
        });
        aplicarModo();
      });
    });
    aplicarModo();
  }

  // Peso de un post en el mapa de calor: gravedad alta 1, media 0,6, baja 0,3.
  function pesoCalor(p) {
    var g = ER.severidad(p).nivel.id;
    return g === "alta" ? 1 : g === "media" ? 0.6 : 0.3;
  }

  function aplicarModo() {
    // En modo calor el mapa base se atenúa para que el blanco y el amarillo resalten.
    document.getElementById("map").classList.toggle("modo-calor", st.modo !== "geo");
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
    var G = ER.CALOR;
    var escala = '<span class="ley-grav"><b>Gravedad</b>' + [G.baja, G.media, G.alta].map(function (g) {
      return '<span><i class="dot-grav" style="background:' + g.color + '"></i>' + g.corto + "</span>";
    }).join("") + "</span>";
    var cats = '<span class="ley-cats">' + D.CATEGORIAS.filter(function (c) { return ER.filtros.categorias.indexOf(c.id) >= 0; }).map(function (c) {
      return '<span title="' + c.nombre + '">' + window.icon(c.icono) + c.nombre + "</span>";
    }).join("") + "</span>";
    el.innerHTML = st.modo === "geo"
      ? escala + cats + '<span class="ley-grupos">Grupos: amarillo menos de 5 reportes, naranja de 5 a 14, rojo 15 o más</span>' + base
      : '<span class="ley-calor"><b>Peligro</b><span class="ramp-calor"><i></i></span><span class="ramp-etq"><span>Sin peligro</span><span>Medio</span><span>Alto</span><span>Extremo</span></span></span>' + base;
  }

  // `ajustar`: centra el mapa en los resultados (al cambiar filtros o fechas, no con cada publicación en vivo).
  function pintarMapa(ajustar) {
    var f = filtroBase(); f.soloGeo = true;
    var posts = D.filtrar(f);
    if (ajustar && posts.length) {
      mapa.fitBounds(L.latLngBounds(posts.map(function (p) { return [p.lat, p.lng]; })), { padding: [60, 60], maxZoom: 12 });
    }
    spotlights.forEach(function (c) { c.unbindTooltip(); c._erSpot = false; });
    spotlights = [];
    capaGrupos.clearLayers();
    capaGrupos.addLayers(posts.map(function (p) { return crearMarcador(p, false); }));
    capaCalor.setLatLngs(posts.map(function (p) { return [p.lat, p.lng, pesoCalor(p)]; }));
    pintarLeyendaMapa(posts.length);
    programarSpotlights();
  }

  // ================= Posts recientes =================
  // Solo los posts de las últimas 24 horas, con los filtros globales.
  function pintarPosts() {
    var excluidos = {};
    st.pendientes.forEach(function (p) { excluidos[p.id] = true; });
    var v = ER.ventana24h();
    var todos = D.filtrar(ER.consulta({ desde: v.desde, hasta: v.hasta }));
    var lista = todos.filter(function (p) { return !excluidos[p.id]; });
    var cont = document.getElementById("posts");
    cont.innerHTML = lista.length ? lista.slice(0, 150).map(function (p) { return htmlPost(p); }).join("") :
      '<div class="empty">' + ER.mensajeSinDatos("No hubo posts en las últimas 24 horas con estos filtros.") + "</div>";
    document.getElementById("conteoPosts").textContent = ER.fmtNum(todos.length) + (todos.length === 1 ? " post" : " posts") + " · últimas 24 horas";
    pintarPildora();
  }

  function pintarPildora() {
    var visibles = st.pendientes.filter(coincide);
    var pill = document.getElementById("pillNuevos");
    pill.hidden = visibles.length === 0;
    pill.textContent = visibles.length + (visibles.length === 1 ? " post nuevo" : " posts nuevos");
  }

  function mostrarPendientes() {
    var nuevos = st.pendientes.filter(coincide);
    st.pendientes = [];
    pintarPosts();
    var cont = document.getElementById("posts");
    var html = nuevos.map(function (p) { return htmlPost(p, true); }).join("");
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
      '<p id="vtInfo" style="margin:0 0 10px;font-size:12px"></p><div class="posts" id="vtLista"></div>',
      function (body) {
        function render() {
          var cat = body.querySelector("#vtCat").value;
          var res = D.filtrar(ER.consulta({
            categorias: cat ? [cat] : ER.filtros.categorias,
            texto: body.querySelector("#vtBuscar").value.trim()
          }));
          body.querySelector("#vtInfo").textContent = res.length > 100
            ? "Mostrando las 100 más recientes de " + ER.fmtNum(res.length) + " publicaciones"
            : ER.fmtNum(res.length) + " publicaciones";
          body.querySelector("#vtLista").innerHTML = res.slice(0, 100).map(function (p) { return htmlPost(p); }).join("") ||
            '<div class="empty">Sin resultados.</div>';
        }
        body.querySelector("#vtBuscar").addEventListener("input", render);
        body.querySelector("#vtCat").addEventListener("change", render);
        render();
      });
  }

  // ================= Pre alertas =================
  // El cálculo de niveles vive en alertas.js (window.ER_ALERTAS); aquí solo se dibuja.
  var A = window.ER_ALERTAS;

  // Mini gráfico de barras de la ventana (24 tramos).
  function sparkline(serie, color, horas) {
    var max = Math.max.apply(null, serie) || 1;
    var barras = serie.map(function (n, i) {
      var h = n ? Math.max(2, Math.round(n / max * 20)) : 1;
      return '<rect x="' + (i * 3) + '" y="' + (22 - h) + '" width="2" height="' + h + '" rx="1" fill="' + (n ? color : "#d9dde7") + '"/>';
    }).join("");
    var tramo = horas * 60 / 24;
    return '<svg class="spark" viewBox="0 0 72 22" width="58" height="22" preserveAspectRatio="none" role="img" aria-label="Posts por tramo de ' +
      Math.round(tramo) + ' minutos"><title>Posts por tramo de ' + Math.round(tramo) + " minutos (máximo " + max + ")</title>" + barras + "</svg>";
  }

  function pastilla(nivel, titulo) {
    return '<span class="nivel nivel-' + nivel.id + '" title="' + ER.escapar(titulo || "") + '">' + window.icon(nivel.icono) + nivel.nombre + "</span>";
  }

  function fmtDecimal(x) { return (Math.round(x * 10) / 10).toString().replace(".", ","); }

  function textoBase(base, horas) {
    if (base.tipo === "dias") return "habitual " + fmtDecimal(base.esperado) + " (promedio de " + base.n + (base.n === 1 ? " día" : " días") + " a esta hora)";
    if (base.tipo === "previo") return (horas === 1 ? "en la hora previa: " : "en las " + horas + " h previas: ") + fmtDecimal(base.esperado);
    return "sin historial para comparar";
  }

  function nombreVentana(h) { return h === 1 ? "la última hora" : "las últimas " + h + " horas"; }

  function pintarAlertas() {
    var horas = st.alertas.horas;
    var todos = D.filtrar(ER.consulta({ desde: null, hasta: null }));
    var r = A.calcular(todos, {
      fin: ER.ventana24h().hasta, horas: horas,
      inicioDatos: D.rangoDisponible().desde,
      categorias: D.CATEGORIAS.filter(function (c) { return ER.filtros.categorias.indexOf(c.id) >= 0; }),
      sinUbicacion: D.SIN_UBICACION
    });
    document.getElementById("alertasSub").textContent = (horas === 1 ? "Última hora" : "Últimas " + horas + " horas") + " frente a lo habitual";
    document.querySelectorAll("#ventanaAlertas button").forEach(function (b) {
      var on = +b.getAttribute("data-horas") === horas;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", String(on));
    });

    // Resumen: cuántas categorías y zonas están por encima de lo normal.
    var activas = r.categorias.filter(function (c) { return c.nivel.orden >= 1; });
    var sinBase = r.categorias.length && r.categorias.every(function (c) { return c.base.tipo === "ninguna"; });
    var peor = activas[0];
    var banner;
    if (!r.categorias.length) banner = '<div class="banner banner-neutro">' + window.icon("info-circle") + "Ninguna categoría seleccionada en los filtros.</div>";
    else if (sinBase && peor) banner = '<div class="banner banner-' + peor.nivel.id + '">' + window.icon(peor.nivel.icono) + "<span><b>Todavía no hay historial para comparar</b>, pero " +
      ER.escapar(peor.categoria.nombre) + " queda en " + peor.nivel.nombre + (peor.graves >= 3 ? " por " + peor.graves + " posts que mencionan heridos o fallecidos." : " porque se está acelerando.") + "</span></div>";
    else if (sinBase) banner = '<div class="banner banner-neutro">' + window.icon("info-circle") + "<span>Reuniendo historial: los niveles aparecen cuando hay capturas anteriores para comparar. Prueba la ventana de 1 h o 6 h.</span></div>";
    else if (peor) banner = '<div class="banner banner-' + peor.nivel.id + '">' + window.icon(peor.nivel.icono) + "<span><b>" + activas.length +
      (activas.length === 1 ? " categoría" : " categorías") + " por encima de lo habitual</b> en " + nombreVentana(horas) + ". La más alta: " +
      ER.escapar(peor.categoria.nombre) + " (" + peor.observado + " posts, " + textoBase(peor.base, horas) + ").</span></div>";
    else banner = '<div class="banner banner-normal">' + window.icon("circle-check") + "<span><b>Actividad dentro de lo habitual</b> en " + nombreVentana(horas) + ".</span></div>";

    var zonas = r.zonas.slice(0, 3).map(function (z) {
      return '<button type="button" class="zona" data-zona="' + ER.escapar(z.ciudad) + '" data-cat="' + z.categoria.id + '" title="Ver en el mapa">' +
        '<i style="background:' + z.categoria.color + '"></i><b>' + ER.escapar(z.categoria.nombre) + " en " + ER.escapar(z.ciudad) + "</b>" +
        "<span>" + z.observado + " posts · " + textoBase(z.base, horas) + "</span>" + pastilla(z.nivel) + "</button>";
    }).join("");
    document.getElementById("alertasResumen").innerHTML = banner +
      (zonas ? '<div class="zonas"><div class="pop-title">Zonas a vigilar</div>' + zonas + "</div>" : "");

    document.getElementById("alertsBody").innerHTML = r.categorias.map(function (c) {
      var abierta = !!st.alertas.abiertas[c.categoria.id];
      var titulo = c.observado + " posts en " + nombreVentana(horas) + "; " + textoBase(c.base, horas) +
        (c.z !== null ? ". Puntaje z = " + fmtDecimal(c.z) : "");
      var meta = [textoBase(c.base, horas)];
      if (c.zonas.length) meta.push(c.zonas.slice(0, 2).map(function (z) { return ER.escapar(z.ciudad) + " " + z.n; }).join(", "));
      if (c.ultimo) meta.push("último " + ER.htmlHace(c.ultimo));
      var senales = "";
      if (c.aceleracion.acelera) senales += '<span class="senal senal-acelera" title="' + c.aceleracion.ultimo + ' posts en los últimos ' + c.aceleracion.minutos +
        ' minutos, más del doble que antes">' + window.icon("activity") + "Acelerando</span>";
      if (c.graves) senales += '<span class="senal senal-grave" title="Posts que mencionan heridos, fallecidos o víctimas">' + window.icon("first-aid-kit") +
        c.graves + (c.graves === 1 ? " con heridos o fallecidos" : " con heridos o fallecidos") + "</span>";
      if (c.verificados) senales += '<span class="senal" title="Publicados por cuentas verificadas">' + window.icon("discount-check") + c.verificados + " de cuentas verificadas</span>";
      var detalle = c.recientes.length ? c.recientes.map(function (p) {
        return '<li><span class="d-meta">' + ER.htmlHace(p.fecha) + " · " + ER.escapar(p.ciudad) + "</span>" +
          '<span class="d-texto">' + ER.escapar(p.texto.length > 140 ? p.texto.slice(0, 140) + "…" : p.texto) + "</span>" +
          (p.url ? '<a class="link-x" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">' + window.icon("brand-x") + "Ver en X</a>" : "") + "</li>";
      }).join("") : '<li class="d-vacio">Sin posts en ' + nombreVentana(horas) + ".</li>";
      return '<li class="alerta-fila alerta-' + c.nivel.id + (abierta ? " abierta" : "") + '" data-cat="' + c.categoria.id + '">' +
        '<button type="button" class="alerta-cabecera" aria-expanded="' + abierta + '">' +
          '<span class="alerta-icono" title="' + c.categoria.nombre + '">' + window.icon(c.categoria.icono) + "</span>" +
          '<span class="alerta-nombre"><b>' + c.categoria.nombre + '</b><small>' + meta.join(" · ") + "</small></span>" +
          sparkline(c.serie, c.categoria.color, horas) +
          '<span class="alerta-n">' + ER.fmtNum(c.observado) + "<small>posts</small></span>" +
          pastilla(c.nivel, titulo) +
          '<span class="alerta-chev">' + window.icon("chevron-down") + "</span>" +
        "</button>" +
        (senales ? '<div class="senales">' + senales + "</div>" : "") +
        '<div class="alerta-detalle"' + (abierta ? "" : " hidden") + '><ul>' + detalle + "</ul>" +
          '<button type="button" class="btn-soft ver-mapa" data-cat="' + c.categoria.id + '">' + window.icon("map-pin") + "Ver solo " + c.categoria.nombre.toLowerCase() + " en el mapa</button>" +
        "</div></li>";
    }).join("");
  }

  function iniciarAlertas() {
    var sel = document.getElementById("selCiudadAlertas");
    ER.enlazarPopover("btnFiltrosAlertas", "popAlertas", function () { opcionesCiudad(sel); });
    ER.enlazarPopover("btnAyudaAlertas", "popAyudaAlertas");
    sel.addEventListener("change", function () { ER.cambiarFiltros({ ciudad: sel.value }); });
    document.querySelectorAll("#ventanaAlertas button").forEach(function (b) {
      b.addEventListener("click", function () { st.alertas.horas = +b.getAttribute("data-horas"); pintarAlertas(); });
    });
    // Delegación: abrir o cerrar una fila, ver una categoría o una zona en el mapa.
    document.querySelector(".card-alerts").addEventListener("click", function (ev) {
      var cab = ev.target.closest(".alerta-cabecera");
      if (cab) {
        var id = cab.parentNode.getAttribute("data-cat");
        st.alertas.abiertas[id] = !st.alertas.abiertas[id];
        cab.setAttribute("aria-expanded", String(st.alertas.abiertas[id]));
        cab.parentNode.classList.toggle("abierta", st.alertas.abiertas[id]);
        cab.parentNode.querySelector(".alerta-detalle").hidden = !st.alertas.abiertas[id];
        return;
      }
      var ver = ev.target.closest(".ver-mapa");
      if (ver) { ER.cambiarFiltros({ categorias: [ver.getAttribute("data-cat")] }); document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" }); return; }
      var zona = ev.target.closest(".zona");
      if (zona) {
        ER.cambiarFiltros({ categorias: [zona.getAttribute("data-cat")], ciudad: zona.getAttribute("data-zona") });
        document.getElementById("map").scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  // ================= Frecuencia =================
  // Dos vistas: "tiempo" (línea de tiempo por gravedad, con picos) y "hora" (patrón por hora del día).
  var MESES_C = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  var RANGOS = { "6h": { horas: 6, paso: 15 }, "24h": { horas: 24, paso: 60 }, "3d": { horas: 72, paso: 180 }, "7d": { horas: 168, paso: 360 } };
  var COL = { alta: "#d03b3b", media: "#f0a400", baja: "#2f9e44" };
  var freq = { vista: "tiempo", rango: "24h", sel: null, bins: [], picos: [], paso: 60 };

  var ETIQUETAS = [];
  for (var i = 0; i < 48; i++) ETIQUETAS.push(ER.pad(Math.floor(i / 2)) + ":" + (i % 2 ? "30" : "00"));

  function porFranja(posts) {
    var arr = new Array(48).fill(0);
    posts.forEach(function (p) { arr[p.fecha.getHours() * 2 + (p.fecha.getMinutes() >= 30 ? 1 : 0)]++; });
    return arr;
  }

  function rangoTiempo() {
    var fin = ER.ventana24h().hasta;
    if (freq.rango === "periodo") {
      var ini = ER.estado.desde, horas = (fin - ini) / 3600000;
      return { ini: ini, fin: fin, paso: horas <= 26 ? 60 : horas <= 80 ? 180 : horas <= 260 ? 360 : 1440 };
    }
    var r = RANGOS[freq.rango];
    return { ini: new Date(fin - r.horas * 3600000), fin: fin, paso: r.paso };
  }

  // Agrupa los posts en franjas de `paso` minutos con su desglose por gravedad.
  function agrupar(posts, ini, fin, paso) {
    var ms = paso * 60000;
    // Las franjas empiezan en múltiplos del paso (13:00, 13:15...) para que se lean fácil.
    var inicio = Math.floor(ini / ms) * ms, n = Math.ceil((fin - inicio) / ms);
    var bins = [];
    for (var k = 0; k < n; k++) bins.push({ desde: new Date(inicio + k * ms), hasta: new Date(inicio + (k + 1) * ms), alta: 0, media: 0, baja: 0, total: 0, prob: 0, nProb: 0, porCat: {}, posts: [] });
    posts.forEach(function (p) {
      var b = bins[Math.floor((p.fecha - inicio) / ms)];
      if (!b) return;
      b[ER.severidad(p).nivel.id]++;
      b.total++;
      if (typeof p.prob === "number") { b.prob += p.prob; b.nProb++; }
      b.porCat[p.categoria] = (b.porCat[p.categoria] || 0) + 1;
      b.posts.push(p);
    });
    return bins;
  }

  // Picos: franjas que superan la media + 2 desviaciones (y al menos 3 posts) y son máximos locales.
  // Guarda la media en freq.media para expresar cada pico como "× veces lo normal".
  function detectarPicos(bins) {
    var tot = bins.map(function (b) { return b.total; });
    var media = tot.reduce(function (s, x) { return s + x; }, 0) / (tot.length || 1);
    var sd = Math.sqrt(tot.reduce(function (s, x) { return s + (x - media) * (x - media); }, 0) / (tot.length || 1));
    var umbral = Math.max(3, media + 2 * sd);
    freq.media = media;
    return tot.map(function (t, k) { return { k: k, t: t }; })
      .filter(function (o) { return o.t >= umbral && o.t >= (tot[o.k - 1] || 0) && o.t >= (tot[o.k + 1] || 0); })
      .sort(function (a, b) { return b.t - a.t; }).slice(0, 4).map(function (o) { return o.k; });
  }

  function fmtFranja(b, paso) {
    var d = b.desde, h = b.hasta;
    var dia = d.getDate() + " " + MESES_C[d.getMonth()];
    if (paso >= 1440) return dia;
    return dia + " " + ER.fmtHora(d) + "–" + ER.fmtHora(h);
  }

  function etiquetasEje(bins, paso) {
    return bins.map(function (b, k) {
      var d = b.desde;
      if (paso >= 1440) return d.getDate() + " " + MESES_C[d.getMonth()];
      var cambioDia = k === 0 || d.getDate() !== bins[k - 1].desde.getDate();
      return cambioDia ? [ER.fmtHora(d), d.getDate() + " " + MESES_C[d.getMonth()]] : ER.fmtHora(d);
    });
  }

  function categoriaPrincipal(porCat) {
    var id = Object.keys(porCat).sort(function (a, b) { return porCat[b] - porCat[a]; })[0];
    return id ? D.categoria(id) : null;
  }

  // Marca los picos con una pastilla roja con el total sobre la barra.
  var marcasPico = {
    id: "marcasPico",
    afterDatasetsDraw: function (c) {
      if (freq.vista !== "tiempo" || !freq.picos.length) return;
      var meta = c.getDatasetMeta(c.data.datasets.length - 1), ctx = c.ctx;
      ctx.save();
      ctx.font = "800 10px " + Chart.defaults.font.family;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      freq.picos.forEach(function (k) {
        var y = c.scales.y.getPixelForValue(freq.bins[k].total), x = meta.data[k] && meta.data[k].x;
        if (x === undefined) return;
        var txt = String(freq.bins[k].total), w = ctx.measureText(txt).width + 10, h = 15, top = y - h - 5;
        ctx.fillStyle = "#c92a2a";
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(x - w / 2, top, w, h, 7.5); else ctx.rect(x - w / 2, top, w, h);
        ctx.fill();
        ctx.beginPath(); ctx.moveTo(x - 3, top + h); ctx.lineTo(x + 3, top + h); ctx.lineTo(x, top + h + 3); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.fillText(txt, x, top + h / 2 + .5);
      });
      ctx.restore();
    }
  };

  var lineaGuia = {
    id: "lineaGuia",
    afterDatasetsDraw: function (c) {
      if (freq.vista !== "hora") return;
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
    var i = t.dataPoints[0].dataIndex, html;
    if (freq.vista === "tiempo") {
      var b = freq.bins[i], cat = categoriaPrincipal(b.porCat);
      html = '<div class="h">' + fmtFranja(b, freq.paso) + "</div>" +
        '<div class="v"><b>' + ER.fmtNum(b.total) + (b.total === 1 ? " post" : " posts") + "</b>" + (freq.picos.indexOf(i) >= 0 ?  ' <span class="tip-pico">' + window.icon("chart-line") + "pico</span>" : "") + "</div>" +
        (b.total ? '<div class="tip-grav"><span><i style="background:' + COL.alta + '"></i>' + b.alta + ' alta</span><span><i style="background:' + COL.media + '"></i>' + b.media +
          ' media</span><span><i style="background:' + COL.baja + '"></i>' + b.baja + " baja</span></div>" : "") +
        (b.nProb ? '<div class="v prev">Confianza media del modelo: ' + Math.round(b.prob / b.nProb * 100) + " %</div>" : "") +
        (cat ? '<div class="v prev">Más reportado: ' + cat.nombre + "</div>" : "") +
        (b.total ? '<div class="v prev tip-ayuda">Clic para ver los posts</div>' : "");
    } else {
      var ds = ctx.chart.data.datasets;
      html = '<div class="h">' + ETIQUETAS[i] + "</div>" +
        '<div class="v"><i></i>' + ER.fmtNum(ds[0].data[i]) + " posts</div>" +
        '<div class="v prev"><i></i>' + ER.fmtNum(ds[1].data[i]) + " periodo anterior</div>";
    }
    tip.innerHTML = html;
    var x = ctx.chart.canvas.offsetLeft + t.caretX;
    tip.style.left = Math.max(110, Math.min(x, ctx.chart.canvas.offsetLeft + ctx.chart.width - 110)) + "px";
    tip.style.top = (ctx.chart.canvas.offsetTop + Math.max(t.caretY, 60)) + "px";
    tip.hidden = false;
  }

  function opcionesBase() {
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 350 },
      interaction: { mode: "index", intersect: false },
      layout: { padding: { top: 26 } },
      plugins: { legend: { display: false }, tooltip: { enabled: false, external: tooltipExterno } },
      scales: {
        y: { beginAtZero: true, stacked: true, border: { display: false }, grid: { color: "#eef0f5" },
          ticks: { maxTicksLimit: 5, precision: 0, font: { size: 12 }, color: "#6b7184", padding: 10 } }
      }
    };
  }

  function crearGrafico() {
    if (chart) chart.destroy();
    var lienzo = document.getElementById("chartFreq");
    var op = opcionesBase();
    if (freq.vista === "tiempo") {
      var color = function (nivel) {
        return function (c) { return freq.sel !== null && c.dataIndex !== freq.sel ? COL[nivel] + "40" : COL[nivel]; };
      };
      op.scales.x = { stacked: true, grid: { display: false }, border: { display: false },
        ticks: { maxRotation: 0, autoSkip: true, autoSkipPadding: 14, font: { size: 11 }, color: "#6b7184" } };
      op.onClick = function (ev, els) {
        if (!els.length) return;
        seleccionarFranja(els[0].index);
      };
      op.onHover = function (ev, els) { ev.native.target.style.cursor = els.length ? "pointer" : "default"; };
      chart = new Chart(lienzo, {
        type: "bar",
        data: { labels: [], datasets: [
          { label: "Gravedad alta", data: [], backgroundColor: color("alta"), borderColor: "#fff", borderWidth: { top: 1 }, borderSkipped: false, maxBarThickness: 26 },
          { label: "Gravedad media", data: [], backgroundColor: color("media"), borderColor: "#fff", borderWidth: { top: 1 }, borderSkipped: false, maxBarThickness: 26 },
          { label: "Gravedad baja", data: [], backgroundColor: color("baja"), borderColor: "#fff", borderWidth: { top: 1 }, borderSkipped: false, maxBarThickness: 26,
            borderRadius: { topLeft: 3, topRight: 3 } }
        ] },
        options: op,
        plugins: [marcasPico]
      });
    } else {
      op.scales.y.stacked = false;
      op.scales.x = { grid: { display: false }, border: { display: false },
        ticks: { autoSkip: false, maxRotation: 0, font: { size: 12 }, color: "#6b7184",
          callback: function (v, k) { var paso = this.chart.width < 640 ? 12 : 4; return k % paso === 0 ? ETIQUETAS[k] : k === 47 && paso === 4 ? "23:59" : ""; } } };
      chart = new Chart(lienzo, {
        type: "line",
        data: { labels: ETIQUETAS, datasets: [
          { label: "Periodo seleccionado", data: [], borderColor: "#2f7be5", borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: "#2f7be5", pointHoverBorderColor: "#fff", pointHoverBorderWidth: 2, tension: 0, order: 1 },
          { label: "Periodo anterior", data: [], borderColor: "#d3dae6", borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, pointHoverBackgroundColor: "#c4ccdb", pointHoverBorderColor: "#fff", tension: 0, order: 2 }
        ] },
        options: op,
        plugins: [lineaGuia]
      });
    }
    chart._vista = freq.vista;
  }

  function seleccionarFranja(k) {
    freq.sel = freq.sel === k ? null : k;
    chart.update("none");
    document.querySelectorAll("#freqPicos [data-pico]").forEach(function (b) {
      var sel = +b.getAttribute("data-pico") === freq.sel;
      b.classList.toggle("sel", sel);
      b.setAttribute("aria-pressed", sel ? "true" : "false");
    });
    pintarDetalleFranja();
  }

  // Tarjetas de picos: franja, total, cuántas veces supera lo normal, gravedad y qué se reporta.
  function htmlPicos(paso) {
    var media = freq.media || 0;
    var unidad = paso >= 1440 ? "día" : paso >= 60 ? (paso === 60 ? "hora" : "franja de " + paso / 60 + " h") : "franja de " + paso + " min";
    var cab = '<div class="picos-cab"><span class="pop-title">' + window.icon("chart-line") + "Picos detectados</span>" +
      '<small>Lo normal: ' + ER.fmtNum(Math.round(media * 10) / 10) + " posts por " + unidad + "</small></div>";
    var tarjetas = freq.picos.map(function (k) {
      var b = freq.bins[k], cat = categoriaPrincipal(b.porCat);
      var ciudades = {};
      b.posts.forEach(function (p) { if (p.ciudad && p.ciudad !== "Sin ubicación") ciudades[p.ciudad] = (ciudades[p.ciudad] || 0) + 1; });
      var ciudad = Object.keys(ciudades).sort(function (x, y) { return ciudades[y] - ciudades[x]; })[0];
      var veces = media > 0 ? b.total / media : null;
      var d = b.desde, dia = d.getDate() + " " + MESES_C[d.getMonth()];
      var hora = paso >= 1440 ? dia : ER.fmtHora(d) + "–" + ER.fmtHora(b.hasta);
      var barra = ["alta", "media", "baja"].map(function (n) {
        return b[n] ? '<i style="width:' + (b[n] / b.total * 100) + "%;background:" + COL[n] + '" title="' + b[n] + " de gravedad " + n + '"></i>' : "";
      }).join("");
      return '<button type="button" class="pico-card' + (freq.sel === k ? " sel" : "") + '" data-pico="' + k + '" aria-pressed="' + (freq.sel === k) + '">' +
        '<span class="pc-hora"><b>' + hora + "</b>" + (paso >= 1440 ? "" : "<small>" + dia + "</small>") + "</span>" +
        '<span class="pc-num"><b>' + ER.fmtNum(b.total) + "</b> posts" +
        (veces ? '<em title="Veces sobre lo normal en este intervalo">× ' + veces.toFixed(1).replace(".", ",") + "</em>" : "") + "</span>" +
        '<span class="pc-barra">' + barra + "</span>" +
        '<span class="pc-que">' + (cat ? window.icon(cat.icono) + "<b>" + cat.nombre + "</b>" : "") + (ciudad ? '<span class="pc-ciudad">· ' + ER.escapar(ciudad) + "</span>" : "") + "</span>" +
        (b.alta ? '<span class="pc-grave">' + b.alta + " de gravedad alta</span>" : "") +
        "</button>";
    }).join("");
    return cab + '<div class="picos-lista">' + tarjetas + "</div>";
  }

  function pintarDetalleFranja() {
    var el = document.getElementById("freqDetalle");
    var b = freq.sel !== null ? freq.bins[freq.sel] : null;
    if (!b || !b.total) { el.hidden = true; el.innerHTML = ""; return; }
    var lista = b.posts.slice().sort(function (x, y) { return ER.severidad(y).score - ER.severidad(x).score || y.fecha - x.fecha; }).slice(0, 5);
    el.innerHTML = '<div class="fd-cab"><b>' + fmtFranja(b, freq.paso) + "</b> · " + b.total + (b.total === 1 ? " post" : " posts") +
      (b.total > 5 ? " (los 5 más graves)" : "") + '<button type="button" class="icon-btn small" id="fdCerrar" aria-label="Cerrar">' + window.icon("x") + "</button></div>" +
      "<ul>" + lista.map(function (p) {
        var g = ER.severidad(p).nivel, c = D.categoria(p.categoria);
        return '<li><span class="mini-ic" style="--g:' + g.color + '" title="' + g.nombre + '">' + window.icon(c.icono) + "</span>" +
          '<div><span class="fd-meta"><b>' + c.nombre + "</b> · " + ER.escapar(p.ciudad) + " · " + ER.htmlHace(p.fecha) +
          (typeof p.prob === "number" ? " · " + Math.round(p.prob * 100) + " %" : "") + "</span>" +
          '<span class="fd-texto">' + ER.escapar(p.texto.length > 160 ? p.texto.slice(0, 160) + "…" : p.texto) + "</span></div>" +
          (p.url ? '<a class="link-x" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">' + window.icon("brand-x") + "Ver</a>" : "") + "</li>";
      }).join("") + "</ul>";
    el.hidden = false;
    document.getElementById("fdCerrar").addEventListener("click", function () { seleccionarFranja(freq.sel); });
  }

  function iniciarFrecuencia() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#8a90a2";
    document.querySelectorAll("#freqVista button").forEach(function (b) {
      b.addEventListener("click", function () { freq.vista = b.getAttribute("data-vista"); freq.sel = null; pintarFrecuencia(); });
    });
    document.querySelectorAll("#freqRango button").forEach(function (b) {
      b.addEventListener("click", function () { freq.rango = b.getAttribute("data-rango"); freq.sel = null; pintarFrecuencia(); });
    });
    document.getElementById("freqPicos").addEventListener("click", function (ev) {
      var b = ev.target.closest("[data-pico]");
      if (b) seleccionarFranja(+b.getAttribute("data-pico"));
    });
    document.getElementById("chartFreq").addEventListener("mouseleave", function () { document.getElementById("tipFreq").hidden = true; });
  }

  function pintarFrecuencia() {
    if (!chart || chart._vista !== freq.vista) crearGrafico();
    document.querySelectorAll("#freqVista button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-vista") === freq.vista); });
    document.querySelectorAll("#freqRango button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-rango") === freq.rango); });
    document.getElementById("freqRango").hidden = freq.vista !== "tiempo";
    var sub = document.getElementById("freqSub"), ley = document.getElementById("freqLeyenda"), picosEl = document.getElementById("freqPicos");

    if (freq.vista === "hora") {
      var actual = D.filtrar(filtroBase());
      var ant = ER.periodoAnterior();
      chart.data.datasets[0].data = porFranja(actual);
      chart.data.datasets[1].data = porFranja(D.filtrar(ER.consulta({ desde: ant.desde, hasta: ant.hasta })));
      chart.update();
      sub.textContent = "Posts por franja de 30 minutos del día en el periodo elegido, frente al periodo anterior";
      ley.innerHTML = '<span><i class="sw sw-line"></i>Periodo seleccionado</span><span><i class="sw sw-line prev"></i>Periodo anterior</span>';
      picosEl.innerHTML = ""; freq.picos = [];
      pintarDetalleFranja();
      return;
    }

    var r = rangoTiempo();
    freq.paso = r.paso;
    var posts = D.filtrar(ER.consulta({ desde: r.ini, hasta: r.fin }));
    freq.bins = agrupar(posts, r.ini, r.fin, r.paso);
    freq.picos = detectarPicos(freq.bins);
    if (freq.sel !== null && freq.sel >= freq.bins.length) freq.sel = null;
    chart.data.labels = etiquetasEje(freq.bins, r.paso);
    ["alta", "media", "baja"].forEach(function (n, k) { chart.data.datasets[k].data = freq.bins.map(function (b) { return b[n]; }); });
    chart.update();

    var pasoTxt = r.paso >= 1440 ? "por día" : r.paso >= 60 ? "por franja de " + (r.paso / 60) + (r.paso === 60 ? " hora" : " horas") : "por franja de " + r.paso + " minutos";
    sub.textContent = "Posts " + pasoTxt + ", por gravedad. Haz clic en una barra para ver sus posts.";
    var conProb = posts.filter(function (p) { return typeof p.prob === "number"; });
    var probMedia = conProb.length ? Math.round(conProb.reduce(function (s, p) { return s + p.prob; }, 0) / conProb.length * 100) : null;
    ley.innerHTML = '<span><i class="sw" style="background:' + COL.alta + '"></i>Gravedad alta</span><span><i class="sw" style="background:' + COL.media +
      '"></i>Gravedad media</span><span><i class="sw" style="background:' + COL.baja + '"></i>Gravedad baja</span><span class="ley-pico">' + window.icon("chart-line") + 'Pico</span>' +
      '<span class="ley-stats">' + ER.fmtNum(posts.length) + " posts" + (probMedia !== null ? " · confianza media " + probMedia + " %" : "") + "</span>";

    picosEl.innerHTML = freq.picos.length ? htmlPicos(r.paso) :
      '<span class="sin-picos">' + window.icon("circle-check") + "Sin picos fuera de lo normal en este intervalo.</span>";
    pintarDetalleFranja();
  }

  // ================= Resumen de las últimas 24 horas =================
  var previoResumen = {};
  function pintarResumen() {
    var v = ER.ventana24h();
    var actual = D.filtrar(ER.consulta({ desde: v.desde, hasta: v.hasta }));
    var previo = D.filtrar(ER.consulta({ desde: v.prevDesde, hasta: v.prevHasta }));
    var ultimaHora = actual.filter(function (p) { return p.fecha >= v.hasta - 3600000; }).length;
    var todas = D.filtrar(ER.consulta({ desde: v.desde, hasta: v.hasta, clasificacion: "todas" }));
    var descartadas = todas.filter(function (p) { return p.emergencia === false; }).length;

    var porCat = {}, porCiudad = {};
    actual.forEach(function (p) {
      porCat[p.categoria] = (porCat[p.categoria] || 0) + 1;
      if (p.ciudad !== D.SIN_UBICACION) porCiudad[p.ciudad] = (porCiudad[p.ciudad] || 0) + 1;
    });
    var mayor = function (m) { return Object.keys(m).sort(function (a, b) { return m[b] - m[a]; })[0]; };
    var cat = mayor(porCat), ciudad = mayor(porCiudad);

    var cambio = previo.length ? Math.round((actual.length - previo.length) / previo.length * 100) : null;
    var tendencia = cambio === null ? "Sin datos de las 24 h previas para comparar"
      : '<span class="' + (cambio > 0 ? "sube" : cambio < 0 ? "baja" : "") + '">' + window.icon(cambio >= 0 ? "trending-up" : "trending-down") +
        (cambio > 0 ? "+" : "") + cambio + " %</span> frente a las 24 h previas";
    var clase = { emergencias: "Emergencias", todas: "Posts", descartadas: "Descartadas" }[ER.filtros.clasificacion];

    var tiles = [
      { id: "r24", lbl: clase + " · 24 h", valor: actual.length, sub: tendencia },
      { id: "r1h", lbl: "Última hora", valor: ultimaHora, sub: ultimaHora ? "posts en los últimos 60 minutos" : "Sin reportes en la última hora" },
      { id: "rcat", lbl: "Categoría con más reportes", texto: cat ? D.categoria(cat).nombre : "–",
        color: cat ? D.categoria(cat).color : null, sub: cat ? ER.fmtNum(porCat[cat]) + " de " + ER.fmtNum(actual.length) + " posts" : "Sin reportes" },
      { id: "rzona", lbl: "Zona más activa", texto: ciudad || "–", sub: ciudad ? ER.fmtNum(porCiudad[ciudad]) + " posts ubicados" : "Sin posts ubicados" },
      { id: "rmod", lbl: "Filtradas por el modelo", valor: descartadas,
        sub: todas.length ? "de " + ER.fmtNum(todas.length) + " posts analizados no eran emergencias" : "Sin posts analizados" }
    ];
    var el = document.getElementById("resumen");
    el.innerHTML = tiles.map(function (t) {
      var cuerpo = "valor" in t
        ? '<b class="r-val" data-id="' + t.id + '">' + ER.fmtNum(previoResumen[t.id] || 0) + "</b>"
        : '<b class="r-val r-texto">' + (t.color ? '<i style="background:' + t.color + '"></i>' : "") + ER.escapar(t.texto) + "</b>";
      return '<div class="r-tile"><span class="r-lbl">' + t.lbl + "</span>" + cuerpo + '<span class="r-sub">' + t.sub + "</span></div>";
    }).join("");
    tiles.forEach(function (t) {
      if (!("valor" in t)) return;
      ER.animarNumero(el.querySelector('[data-id="' + t.id + '"]'), t.valor);
      previoResumen[t.id] = t.valor;
    });
  }

  // ================= Ciclo de vida =================
  var refrescoTimer;
  function refrescoDiferido() {
    clearTimeout(refrescoTimer);
    refrescoTimer = setTimeout(function () { pintarResumen(); pintarAlertas(); pintarFrecuencia(); }, 400);
  }

  function pintarTodo(ajustar) {
    pintarChips();
    pintarResumen();
    pintarMapa(ajustar);
    pintarPosts();
    pintarAlertas();
    pintarFrecuencia();
  }

  ER.registrarVista("principal", {
    iniciar: function () {
      opcionesCiudad(document.getElementById("selCiudadMapa"));
      opcionesCiudad(document.getElementById("selCiudadAlertas"));
      iniciarFiltroMapa();
      iniciarMapa();
      iniciarAlertas();
      iniciarFrecuencia();
      document.getElementById("pillNuevos").addEventListener("click", mostrarPendientes);
      document.getElementById("btnVerTodo").addEventListener("click", verTodo);
      // Clic en el texto de un post: lo muestra completo o lo vuelve a recortar.
      document.addEventListener("click", function (ev) {
        var t = ev.target.closest(".post-texto");
        if (t && !ev.target.closest("a")) t.classList.toggle("completo");
      });
      pintarTodo(true);
    },
    mostrar: function () {
      var ajustar = this._pendiente;
      if (this._pendiente) { this._pendiente = false; pintarTodo(); }
      setTimeout(function () {
        mapa.invalidateSize();
        if (ajustar) pintarMapa(true);
        programarSpotlights();
      }, 0);
    },
    actualizar: function (tipo, p) {
      if (tipo === "rango" || tipo === "filtros") { pintarTodo(true); return; }
      if (tipo === "nueva") {
        st.pendientes.unshift(p);
        pintarPildora();
        if (coincide(p) && p.lat !== null) {
          capaGrupos.addLayer(crearMarcador(p, true));
          capaCalor.addLatLng([p.lat, p.lng, pesoCalor(p)]);
          pintarLeyendaMapa((pintarLeyendaMapa._t || 0) + 1);
        }
        refrescoDiferido();
      }
    }
  });
})();

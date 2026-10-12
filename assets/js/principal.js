/*
 * Emergency Radar · vista Principal
 * Mapa de geolocalización, posts recientes,
 * pre-alertas y frecuencia de publicaciones con detección de picos.
 */
(function () {
  "use strict";

  var D = window.ER_DATA;
  var ER = window.ER;

  // Los filtros (categorías, ciudad, clasificación del modelo) viven en ER.filtros
  // y se comparten con Histórico y Estadísticas.
  var st = {
    alertas: { horas: 6, abiertas: {} },
    pendientes: []
  };

  var mapa, capaGrupos, capaNuevos, spotlights = [], chart;

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

  // Etiqueta fija de un grupo: el ícono es el de la categoría más reportada en el grupo
  // (no el del último post) y el tiempo es el del reporte más reciente.
  function etiquetaGrupo(info) {
    if (!info.total || info.total < 2) return etiquetaMini(info.post);
    var id = Object.keys(info.porCat).sort(function (a, b) { return info.porCat[b] - info.porCat[a]; })[0];
    var c = D.categoria(id), g = ER.severidad(info.post).nivel;
    return '<span class="mini-ic" style="--g:' + g.color + '" title="Más reportado: ' + c.nombre + " (" + info.porCat[id] + " de " + info.total + ')">' +
      window.icon(c.icono) + "</span>" + '<span class="mini-hace">' + ER.haceCorto(info.post.fecha) + "</span>";
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
    // Categorías de mayor a menor cantidad.
    var chips = D.CATEGORIAS.filter(function (x) { return porCat && porCat[x.id]; }).sort(function (a, b) { return porCat[b.id] - porCat[a.id]; }).map(function (x) {
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
      (p.url ? '<a class="link-x" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">' + "Ver en" + window.icon("brand-x") + "</a>" : "") +
      "</div></div>";
  }

  function iconoGrupo(cluster) {
    var n = cluster.getChildCount();
    // Manchas suaves, más grandes cuantos más reportes agrupan.
    var s = n < 10 ? 76 : n < 50 ? 88 : n < 200 ? 100 : 112;
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
        className: "er-point er-" + g.id + (fresco ? " fresh" : "") + (reciente ? " reciente" : ""), iconSize: [60, 60] }),
      keyboard: false
    });
    m._erPost = p;
    m.bindPopup(popupPost(p), { maxWidth: 320 });
    m.bindTooltip(function () { return etiquetaPunto(p); }, { direction: "top", className: "er-mini", offset: [0, -20] });
    return m;
  }

  // Post recién llegado: ondas de radar del color de su gravedad durante 2 minutos y una
  // etiqueta "Nuevo" durante 15 segundos. Clic en las ondas abre el post.
  var DESTAQUE_MS = 120000, ETIQUETA_MS = 15000;
  function destacarNuevo(p) {
    var g = ER.severidad(p).nivel, c = D.categoria(p.categoria), color = ER.CALOR[g.id].color;
    var m = L.marker([p.lat, p.lng], {
      pane: "erNuevos", keyboard: false,
      icon: L.divIcon({ className: "er-ping", iconSize: [84, 84], html: '<span style="--p:' + color + '"></span><span style="--p:' + color + '"></span>' })
    });
    m.bindPopup(popupPost(p), { maxWidth: 320 });
    m.bindTooltip('<span class="mini-ic" style="--g:' + g.color + '">' + window.icon(c.icono) + '</span><b>Nuevo</b><span class="mini-hace">' + ER.escapar(p.ciudad) + "</span>",
      { permanent: true, direction: "top", className: "er-mini er-nuevo", offset: [0, -30] });
    capaNuevos.addLayer(m);
    setTimeout(function () { m.closeTooltip(); m.unbindTooltip(); }, ETIQUETA_MS);
    setTimeout(function () { capaNuevos.removeLayer(m); }, DESTAQUE_MS);
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
  // Etiquetas y tarjetas sobre los grupos se dibujan en una capa propia, ubicadas con la posición
  // real del ícono en pantalla (las de Leaflet podían quedar en una esquina con los grupos).
  var capaEtiquetas = null;
  function posicionar(el, icono, alto) {
    if (!icono || !icono.isConnected) { el.style.display = "none"; return false; }
    var r = icono.getBoundingClientRect(), c = mapa.getContainer().getBoundingClientRect();
    if (!r.width) { el.style.display = "none"; return false; }
    el.style.display = "";
    // Se centra con el tamaño real de la etiqueta (sin transform, que las animaciones pisaban).
    el.style.left = Math.round(r.left - c.left + r.width / 2 - el.offsetWidth / 2) + "px";
    el.style.top = Math.round(r.top - c.top + r.height / 2 - alto - el.offsetHeight) + "px";
    return true;
  }
  function etiquetaFlotante(clase, html) {
    var el = document.createElement("div");
    el.className = "er-et " + clase;
    el.innerHTML = html;
    capaEtiquetas.appendChild(el);
    return el;
  }
  function reposicionarEtiquetas() {
    spotlights.forEach(function (s) { posicionar(s.el, s.capa._icon, 24); });
    if (tarjetaHover) posicionar(tarjetaHover.el, tarjetaHover.capa._icon, 26);
  }
  var tarjetaHover = null;

  function refrescarSpotlights() {
    spotlights.forEach(function (s) { s.el.remove(); s.capa._erSpot = false; });
    spotlights = [];
    if (!mapa || !capaEtiquetas || mapa.getContainer().classList.contains("en-zoom")) return;
    var limites = mapa.getBounds().pad(-0.08);
    var vistos = [];
    var marcadores = capaGrupos.getLayers().slice().sort(function (a, b) { return b._erPost.fecha - a._erPost.fecha; });
    for (var i = 0; i < marcadores.length && spotlights.length < 5; i++) {
      var padre = capaGrupos.getVisibleParent(marcadores[i]);
      if (!padre || vistos.indexOf(padre) >= 0) continue;
      // Solo grupos o puntos dibujados en el mapa.
      if (!padre._icon || !mapa.hasLayer(padre)) continue;
      var ll = padre.getLatLng();
      if (!limites.contains(ll)) continue;
      var pt = mapa.latLngToContainerPoint(ll);
      if (pt.y < 60) continue;
      // La etiqueta ocupa unos 60 x 20 px por encima del punto: se evita que choque con otra.
      var choca = spotlights.some(function (s) {
        var q = mapa.latLngToContainerPoint(s.capa.getLatLng());
        return Math.abs(q.x - pt.x) < 70 && Math.abs(q.y - pt.y) < 30;
      });
      vistos.push(padre);
      if (choca) continue;
      var el = etiquetaFlotante("er-mini er-fija", etiquetaGrupo(ultimoDe(padre)));
      if (!posicionar(el, padre._icon, 24)) { el.remove(); continue; }
      padre._erSpot = true;
      spotlights.push({ capa: padre, el: el });
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
    // Mapas base sin API key. Por defecto "Calles" (OpenStreetMap); se puede cambiar desde el
    // control de capas (abajo a la izquierda) y la elección se recuerda en este navegador.
    var osm = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
    var bases = {
      "Calles": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: osm, maxZoom: 19 }),
      "Humanitario": L.tileLayer("https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png", {
        attribution: osm + ', estilo <a href="https://www.hotosm.org/">HOT</a>', subdomains: "abc", maxZoom: 19 }),
      "Gris": L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: osm, maxZoom: 19, className: "tiles-gris" }),
      "Satélite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Imágenes &copy; Esri", maxZoom: 19 })
    };
    var elegida = "Calles";
    try { if (bases[localStorage.getItem("er-mapa-base-v3")]) elegida = localStorage.getItem("er-mapa-base-v3"); } catch (e) { /* sin almacenamiento */ }
    bases[elegida].addTo(mapa);
    L.control.layers(bases, null, { position: "bottomleft", collapsed: true }).addTo(mapa);
    mapa.on("baselayerchange", function (e) {
      try { localStorage.setItem("er-mapa-base-v3", e.name); } catch (err) { /* sin almacenamiento */ }
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
    // Tarjeta al pasar el cursor por un grupo. Se cierra siempre al salir, al mover o hacer zoom y
    // cuando los grupos se reorganizan: así no queda "huérfana" dibujada en una esquina del mapa.
    capaEtiquetas = L.DomUtil.create("div", "er-etiquetas", mapa.getContainer());
    function cerrarTarjetaGrupo() {
      if (tarjetaHover) { tarjetaHover.el.remove(); tarjetaHover = null; }
      spotlights.forEach(function (s) { s.el.style.visibility = ""; });
    }
    capaGrupos.on("clustermouseover", function (e) {
      var c = e.layer;
      cerrarTarjetaGrupo();
      if (!c._icon || !mapa.hasLayer(c)) return;
      var info = ultimoDe(c);
      var el = etiquetaFlotante("er-card", tarjeta(info.post, info.total, info.porCat));
      if (!posicionar(el, c._icon, 26)) { el.remove(); return; }
      tarjetaHover = { capa: c, el: el };
      // La etiqueta fija de ese grupo se oculta mientras se ve la tarjeta.
      spotlights.forEach(function (s) { if (s.capa === c) s.el.style.visibility = "hidden"; });
    });
    capaGrupos.on("clustermouseout", cerrarTarjetaGrupo);
    // Durante el zoom los grupos se rearman y las etiquetas podían quedar dibujadas fuera de lugar
    // un instante (en una esquina): se ocultan mientras dura la animación y se recrean al final.
    var contenedor = mapa.getContainer(), finZoom;
    mapa.on("zoomstart", function () {
      clearTimeout(finZoom);
      contenedor.classList.add("en-zoom");
      cerrarTarjetaGrupo();
      spotlights.forEach(function (s) { s.el.remove(); s.capa._erSpot = false; });
      spotlights = [];
    });
    var mostrarEtiquetas = function () {
      clearTimeout(finZoom);
      finZoom = setTimeout(function () { contenedor.classList.remove("en-zoom"); programarSpotlights(); }, 350);
    };
    mapa.on("zoomend", mostrarEtiquetas);
    capaGrupos.on("animationend", mostrarEtiquetas);
    capaGrupos.on("animationstart spiderfied unspiderfied", cerrarTarjetaGrupo);
    mapa.on("zoomstart popupopen", cerrarTarjetaGrupo);
    // Al arrastrar el mapa las etiquetas acompañan a sus grupos. Además se reajustan cada
    // 200 ms porque los grupos terminan de acomodarse un poco después de cada zoom.
    mapa.on("move", reposicionarEtiquetas);
    capaGrupos.on("animationend", reposicionarEtiquetas);
    setInterval(function () { if (!document.hidden && (spotlights.length || tarjetaHover)) reposicionarEtiquetas(); }, 200);
    mapa.getContainer().addEventListener("mouseleave", cerrarTarjetaGrupo);
    capaGrupos.on("animationend", programarSpotlights);
    mapa.on("moveend", programarSpotlights);

    mapa.addLayer(capaGrupos);
    // Capa propia (por encima de los grupos) para destacar los posts que van llegando.
    mapa.createPane("erNuevos").style.zIndex = 640;
    capaNuevos = L.layerGroup().addTo(mapa);
    pintarLeyendaMapa();
  }

  function pintarLeyendaMapa(total) {
    if (typeof total === "number") pintarLeyendaMapa._t = total;
    total = pintarLeyendaMapa._t || 0;
    var el = document.getElementById("mapLegend");
    var base = "<span>" + ER.fmtNum(total) + (ER.estado.personalizado ? " publicaciones geolocalizadas en el periodo elegido" : " publicaciones geolocalizadas en las últimas 48 horas") + "</span>";
    var G = ER.CALOR;
    var escala = '<span class="ley-grav"><b>Gravedad</b>' + [G.baja, G.media, G.alta].map(function (g) {
      return '<span><i class="dot-grav" style="background:' + g.color + '"></i>' + g.corto + "</span>";
    }).join("") + "</span>";
    var cats = '<span class="ley-cats">' + D.CATEGORIAS.filter(function (c) { return ER.filtros.categorias.indexOf(c.id) >= 0; }).map(function (c) {
      return '<span title="' + c.nombre + '">' + window.icon(c.icono) + c.nombre + "</span>";
    }).join("") + "</span>";
    el.innerHTML = escala + cats + '<span class="ley-grupos">Grupos: amarillo menos de 5 reportes, naranja de 5 a 14, rojo 15 o más</span>' + base;
  }

  // `ajustar`: centra el mapa en los resultados (al cambiar filtros o fechas, no con cada publicación en vivo).
  // El mapa muestra solo las emergencias de las últimas 48 horas (dentro del rango elegido).
  var MAPA_HORAS = 48;
  function pintarMapa(ajustar) {
    var f = filtroBase(); f.soloGeo = true;
    // Con un rango de fechas elegido se muestra todo ese periodo; si no, las últimas 48 horas.
    if (!ER.estado.personalizado) {
      var fin = Math.min(Date.now(), +ER.estado.hasta);
      f.desde = new Date(Math.max(+ER.estado.desde, fin - MAPA_HORAS * 3600000));
    }
    document.getElementById("mapaSub").textContent = ER.estado.personalizado
      ? "Emergencias del " + ER.textoRango() + " (filtro de fechas)" : "Solo las emergencias de las últimas 48 horas";
    var posts = D.filtrar(f);
    if (ajustar && posts.length) {
      mapa.fitBounds(L.latLngBounds(posts.map(function (p) { return [p.lat, p.lng]; })), { padding: [60, 60], maxZoom: 12 });
    }
    spotlights.forEach(function (s) { s.el.remove(); s.capa._erSpot = false; });
    spotlights = [];
    if (tarjetaHover) { tarjetaHover.el.remove(); tarjetaHover = null; }
    capaGrupos.clearLayers();
    capaGrupos.addLayers(posts.map(function (p) { return crearMarcador(p, false); }));
    pintarLeyendaMapa(posts.length);
    programarSpotlights();
  }

  // ================= Posts recientes =================
  // Solo los posts de las últimas 24 horas, con los filtros globales.
  function pintarPosts() {
    var excluidos = {};
    st.pendientes.forEach(function (p) { excluidos[p.id] = true; });
    // Con un rango de fechas elegido se listan los posts de todo ese periodo; si no, las últimas 24 horas.
    var pers = ER.estado.personalizado, v = ER.ventana24h();
    var todos = D.filtrar(pers ? ER.consulta() : ER.consulta({ desde: v.desde, hasta: v.hasta }));
    var lista = todos.filter(function (p) { return !excluidos[p.id]; });
    var cont = document.getElementById("posts");
    cont.innerHTML = lista.length ? lista.slice(0, 150).map(function (p) { return htmlPost(p); }).join("") :
      '<div class="empty">' + ER.mensajeSinDatos(pers ? "No hubo posts en el periodo elegido con estos filtros." : "No hubo posts en las últimas 24 horas con estos filtros.") + "</div>";
    document.getElementById("conteoPosts").textContent = ER.fmtNum(todos.length) + (todos.length === 1 ? " post" : " posts") + (pers ? " · del " + ER.textoRango() : " · últimas 24 horas");
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

  // Mini gráfico de líneas de la ventana (24 tramos), con el área bajo la línea en tono suave.
  function sparkline(serie, color, horas) {
    var max = Math.max.apply(null, serie) || 1;
    var paso = 72 / (serie.length - 1 || 1);
    var pts = serie.map(function (n, i) { return [+(i * paso).toFixed(2), +(20.5 - n / max * 18).toFixed(2)]; });
    var linea = pts.map(function (p, i) { return (i ? "L" : "M") + p[0] + " " + p[1]; }).join(" ");
    var area = linea + " L72 22 L0 22 Z";
    var ult = pts[pts.length - 1];
    var tramo = horas * 60 / 24;
    return '<svg class="spark" viewBox="0 0 72 22" width="58" height="22" preserveAspectRatio="none" role="img" aria-label="Posts por tramo de ' +
      Math.round(tramo) + ' minutos"><title>Posts por tramo de ' + Math.round(tramo) + " minutos (máximo " + max + ")</title>" +
      '<path d="' + area + '" fill="' + color + '" fill-opacity=".12"/>' +
      '<path d="' + linea + '" fill="none" stroke="' + color + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' +
      '<circle cx="' + ult[0] + '" cy="' + ult[1] + '" r="1.8" fill="' + color + '"/></svg>';
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
    document.getElementById("alertasSub").textContent = (horas === 1 ? "Última hora" : "Últimas " + horas + " horas") +
      (ER.estado.personalizado ? " hasta el " + ER.fmtLarga(ER.ventana24h().hasta) : "") + " frente a lo habitual";
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
        window.icon(z.categoria.icono) + "<b>" + ER.escapar(z.categoria.nombre) + " en " + ER.escapar(z.ciudad) + "</b>" +
        "<span>" + z.observado + " posts · " + textoBase(z.base, horas) + "</span>" + pastilla(z.nivel) + "</button>";
    }).join("");
    // Dos niveles distintos: "Por zonas" mira una ciudad y un tipo de emergencia a la vez;
    // "Por tipo de emergencia" (en index.html) mira cada tipo de emergencia en todo el país.
    document.getElementById("alertasResumen").innerHTML = banner;
    document.getElementById("alertasZonas").innerHTML = (zonas ? '<section class="zonas"><div class="al-sec">' + window.icon("map-pin") + "<b>Por zonas</b></div>" +
        '<p class="al-ayuda">Ciudades donde un tipo de emergencia se concentra más de lo normal. Toca una para verla en el mapa.</p>' + zonas + "</section>" : "");

    document.getElementById("alertsBody").innerHTML = r.categorias.map(function (c) {
      var abierta = !!st.alertas.abiertas[c.categoria.id];
      var titulo = c.observado + " posts en " + nombreVentana(horas) + "; " + textoBase(c.base, horas) +
        (c.z !== null ? ". Puntaje z = " + fmtDecimal(c.z) : "");
      // Detalle corto: lo habitual en una línea y hace cuánto llegó el último post en la siguiente.
      var meta = [textoBase(c.base, horas)];
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
          (p.url ? '<a class="link-x" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">' + "Ver en" + window.icon("brand-x") + "</a>" : "") + "</li>";
      }).join("") : '<li class="d-vacio">Sin posts en ' + nombreVentana(horas) + ".</li>";
      return '<li class="alerta-fila alerta-' + c.nivel.id + (abierta ? " abierta" : "") + '" data-cat="' + c.categoria.id + '">' +
        '<button type="button" class="alerta-cabecera" aria-expanded="' + abierta + '">' +
          '<span class="alerta-icono" title="' + c.categoria.nombre + '">' + window.icon(c.categoria.icono) + "</span>" +
          '<span class="alerta-nombre"><b>' + c.categoria.nombre + '</b><small>' + meta.join("<br>") + "</small></span>" +
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
  // Línea de tiempo por gravedad, con detección de picos. El patrón por hora del día vive en Estadísticas.
  var RANGOS = { "6h": { horas: 6, paso: 15 }, "24h": { horas: 24, paso: 60 }, "3d": { horas: 72, paso: 180 }, "7d": { horas: 168, paso: 360 } };
  var COL = { alta: "#d03b3b", media: "#f0a400", baja: "#2f9e44" };
  var freq = { rango: "24h", sel: null, bins: [], picos: [], paso: 60 };

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
    // Las franjas empiezan en múltiplos del paso en hora de Ecuador (13:00, 13:15... y los
    // días a medianoche de Ecuador) para que se lean fácil.
    var inicio = Math.floor((+ini + ER.DESFASE) / ms) * ms - ER.DESFASE, n = Math.ceil((fin - inicio) / ms);
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
    var dia = ER.fmtDiaMes(d);
    if (paso >= 1440) return dia;
    return dia + " " + ER.fmtHora(d) + "–" + ER.fmtHora(h);
  }

  function etiquetasEje(bins, paso) {
    return bins.map(function (b, k) {
      var d = b.desde;
      if (paso >= 1440) return ER.fmtDiaMes(d);
      var cambioDia = k === 0 || ER.ec(d).d !== ER.ec(bins[k - 1].desde).d;
      return cambioDia ? [ER.fmtHora(d), ER.fmtDiaMes(d)] : ER.fmtHora(d);
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
      if (!freq.picos.length) return;
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

  function tooltipExterno(ctx) {
    var tip = document.getElementById("tipFreq");
    var t = ctx.tooltip;
    if (!t || t.opacity === 0) { tip.hidden = true; return; }
    var i = t.dataPoints[0].dataIndex, html;
    var b = freq.bins[i], cat = categoriaPrincipal(b.porCat);
      html = '<div class="h">' + fmtFranja(b, freq.paso) + "</div>" +
        '<div class="v"><b>' + ER.fmtNum(b.total) + (b.total === 1 ? " post" : " posts") + "</b>" + (freq.picos.indexOf(i) >= 0 ?  ' <span class="tip-pico">' + window.icon("chart-line") + "pico</span>" : "") + "</div>" +
        (b.total ? '<div class="tip-grav"><span><i style="background:' + COL.alta + '"></i>' + b.alta + ' alta</span><span><i style="background:' + COL.media + '"></i>' + b.media +
          ' media</span><span><i style="background:' + COL.baja + '"></i>' + b.baja + " baja</span></div>" : "") +
        (b.nProb ? '<div class="v prev">Confianza media del modelo: ' + Math.round(b.prob / b.nProb * 100) + " %</div>" : "") +
        (cat ? '<div class="v prev">Más reportado: ' + cat.nombre + " (" + b.porCat[cat.id] + " de " + b.total + ")</div>" : "") +
        (b.total ? '<div class="v prev tip-ayuda">Clic para ver los posts</div>' : "");
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
  }

  function seleccionarFranja(k) {
    freq.sel = freq.sel === k ? null : k;
    freq.catDetalle = null;
    chart.update("none");
    document.querySelectorAll("#freqPicos [data-pico]").forEach(function (b) {
      var sel = +b.getAttribute("data-pico") === freq.sel;
      b.classList.toggle("sel", sel);
      b.setAttribute("aria-pressed", sel ? "true" : "false");
    });
    pintarDetalleFranja();
  }

  // Lista de picos: una fila por pico con la franja, la categoría principal y el total.
  function htmlPicos(paso) {
    var media = freq.media || 0;
    var unidad = paso >= 1440 ? "día" : paso >= 60 ? (paso === 60 ? "hora" : "franja de " + paso / 60 + " h") : "franja de " + paso + " min";
    var cab = '<div class="picos-cab"><span class="pop-title">' + window.icon("chart-line") + "Picos detectados</span>" +
      "<small>Lo normal: " + ER.fmtNum(Math.round(media * 10) / 10) + " posts por " + unidad + "</small></div>";
    var filas = freq.picos.map(function (k) {
      var b = freq.bins[k], cat = categoriaPrincipal(b.porCat);
      var veces = media > 0 ? b.total / media : null;
      var d = b.desde, dia = ER.fmtDiaMes(d);
      var hora = paso >= 1440 ? dia : ER.fmtHora(d) + "–" + ER.fmtHora(b.hasta);
      return '<li><button type="button" class="pico-fila' + (freq.sel === k ? " sel" : "") + '" data-pico="' + k + '" aria-pressed="' + (freq.sel === k) + '">' +
        '<span class="pf-hora"><b>' + hora + "</b>" + (paso >= 1440 ? "" : "<small>" + dia + "</small>") + "</span>" +
        '<span class="pf-cat" title="Categoría más reportada en esta franja">' + (cat ? window.icon(cat.icono) + "<span>" + cat.nombre +
          ' <small>' + b.porCat[cat.id] + " de " + b.total + "</small></span>" : "") + "</span>" +
        '<span class="pf-num"><b>' + ER.fmtNum(b.total) + "</b> posts" +
        (veces ? '<em title="Veces sobre lo normal">× ' + veces.toFixed(1).replace(".", ",") + "</em>" : "") + "</span>" +
        window.icon("chevron-right", "pf-ir") + "</button></li>";
    }).join("");
    return cab + '<ul class="picos-lista">' + filas + "</ul>";
  }


  // Detalle de una franja: cuántos posts hay de cada categoría y la lista completa,
  // con la categoría más reportada primero (antes se mostraban solo los 5 más graves y
  // eso podía contradecir la categoría principal del pico).
  function pintarDetalleFranja() {
    var el = document.getElementById("freqDetalle");
    var b = freq.sel !== null ? freq.bins[freq.sel] : null;
    if (!b || !b.total) { el.hidden = true; el.innerHTML = ""; freq.catDetalle = null; return; }
    var orden = Object.keys(b.porCat).sort(function (x, y) { return b.porCat[y] - b.porCat[x]; });
    if (freq.catDetalle && !b.porCat[freq.catDetalle]) freq.catDetalle = null;
    var lista = b.posts.filter(function (p) { return !freq.catDetalle || p.categoria === freq.catDetalle; })
      .sort(function (x, y) { return orden.indexOf(x.categoria) - orden.indexOf(y.categoria) || y.fecha - x.fecha; });
    var chip = function (id, icono, nombre, n) {
      var on = (freq.catDetalle || null) === id;
      return '<button type="button" class="fd-cat' + (on ? " on" : "") + '" data-fdcat="' + (id || "") + '" aria-pressed="' + on + '">' +
        (icono ? window.icon(icono) : "") + nombre + " <b>" + n + "</b></button>";
    };
    el.innerHTML = '<div class="fd-cab"><b>' + fmtFranja(b, freq.paso) + "</b> · " + b.total + (b.total === 1 ? " post" : " posts") +
      '<button type="button" class="icon-btn small" id="fdCerrar" aria-label="Cerrar">' + window.icon("x") + "</button></div>" +
      '<div class="fd-cats">' + (orden.length > 1 ? chip(null, null, "Todas", b.total) : "") + orden.map(function (id) {
        var c = D.categoria(id);
        return chip(id, c.icono, c.nombre, b.porCat[id]);
      }).join("") + "</div>" +
      "<ul>" + lista.map(function (p) {
        var g = ER.severidad(p).nivel, c = D.categoria(p.categoria);
        return '<li><span class="mini-ic" style="--g:' + g.color + '" title="Gravedad ' + g.nombre.toLowerCase() + '">' + window.icon(c.icono) + "</span>" +
          '<div><span class="fd-meta"><b>' + c.nombre + "</b> · " + ER.escapar(p.ciudad) + " · " + ER.htmlHace(p.fecha) +
          (typeof p.prob === "number" ? " · " + Math.round(p.prob * 100) + " %" : "") + "</span>" +
          '<span class="fd-texto">' + ER.escapar(p.texto.length > 160 ? p.texto.slice(0, 160) + "…" : p.texto) + "</span></div>" +
          (p.url ? '<a class="link-x" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">' + "Ver en" + window.icon("brand-x") + "</a>" : "") + "</li>";
      }).join("") + "</ul>";
    el.hidden = false;
    document.getElementById("fdCerrar").addEventListener("click", function () { seleccionarFranja(freq.sel); });
    el.querySelectorAll("[data-fdcat]").forEach(function (btn) {
      btn.addEventListener("click", function () { freq.catDetalle = btn.getAttribute("data-fdcat") || null; pintarDetalleFranja(); });
    });
  }

  function iniciarFrecuencia() {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = "#8a90a2";
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
    if (!chart) crearGrafico();
    document.querySelectorAll("#freqRango button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-rango") === freq.rango); });
    var sub = document.getElementById("freqSub"), ley = document.getElementById("freqLeyenda"), picosEl = document.getElementById("freqPicos");

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
      { id: "r24", icono: "alert-triangle", lbl: clase + " · 24&nbsp;h", valor: actual.length, sub: tendencia },
      { id: "r1h", icono: "clock", lbl: "Última hora", valor: ultimaHora, sub: ultimaHora ? "posts en los últimos 60 minutos" : "Sin reportes en la última hora" },
      { id: "rcat", icono: cat ? D.categoria(cat).icono : "chart-bar", lbl: "Categoría con más reportes", texto: cat ? D.categoria(cat).nombre : "–",
        sub: cat ? ER.fmtNum(porCat[cat]) + " de " + ER.fmtNum(actual.length) + " posts" : "Sin reportes" },
      { id: "rzona", icono: "map-pin", lbl: "Zona más activa", texto: ciudad || "–", sub: ciudad ? ER.fmtNum(porCiudad[ciudad]) + " posts ubicados" : "Sin posts ubicados" }
    ];
    var el = document.getElementById("resumen");
    el.innerHTML = tiles.map(function (t) {
      var cuerpo = "valor" in t
        ? '<b class="r-val" data-id="' + t.id + '">' + ER.fmtNum(previoResumen[t.id] || 0) + "</b>"
        : '<b class="r-val r-texto">' + ER.escapar(t.texto) + "</b>";
      return '<div class="r-tile"><span class="r-lbl">' + window.icon(t.icono) + t.lbl + "</span>" + cuerpo + '<span class="r-sub">' + t.sub + "</span></div>";
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
    refrescoTimer = setTimeout(function () { pintarActualizacion(); pintarResumen(); pintarAlertas(); pintarFrecuencia(); }, 400);
  }

  // Fecha y hora (Ecuador) de la última actualización de posts, en el mapa y en Posts recientes.
  function pintarActualizacion() {
    var a = D.actualizado();
    var txt = a ? "Actualizado " + ER.fmtLarga(a) + " (hora de Ecuador)" : "";
    document.querySelectorAll(".act-posts").forEach(function (el) { el.textContent = txt; el.title = a ? "Última captura de posts de X (hora de Ecuador)" : ""; });
  }

  function pintarTodo(ajustar) {
    pintarActualizacion();
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
      document.getElementById("btnQuitarRango").addEventListener("click", function () { ER.quitarRango(); });
      document.getElementById("btnVerTodo").addEventListener("click", verTodo);
      // Clic en el texto de un post: lo muestra completo o lo vuelve a recortar.
      document.addEventListener("click", function (ev) {
        var t = ev.target.closest(".post-texto");
        if (t && !ev.target.closest("a")) t.classList.toggle("completo");
      });
      pintarTodo(true);
      // En vivo el archivo se relee cada minuto: la fecha de actualización se refresca a la par.
      setInterval(pintarActualizacion, 60000);
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
      if (tipo === "rango") {
        // Frecuencia de posts sigue al filtro de fechas: con un rango elegido muestra ese periodo.
        if (ER.estado.personalizado) { freq.rango = "periodo"; freq.porRango = true; }
        else if (freq.porRango) { freq.rango = "24h"; freq.porRango = false; }
        freq.sel = null;
      }
      if (tipo === "rango" || tipo === "filtros") { pintarTodo(true); return; }
      if (tipo === "nueva") {
        st.pendientes.unshift(p);
        pintarPildora();
        if (coincide(p) && p.lat !== null) {
          capaGrupos.addLayer(crearMarcador(p, true));
          destacarNuevo(p);
          pintarLeyendaMapa((pintarLeyendaMapa._t || 0) + 1);
        }
        refrescoDiferido();
      }
    }
  });
})();

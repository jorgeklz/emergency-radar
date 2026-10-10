/*
 * Emergency Radar · vista Principal
 * Mapa (geolocalización / mapa de calor), posts recientes,
 * pre alertas y frecuencia de publicaciones por hora del día.
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
  function htmlPost(p, nuevo) {
    var cat = D.categoria(p.categoria);
    var g = ER.severidad(p).nivel;
    return '<article class="post grav-borde-' + g.id + (nuevo ? " nuevo" : "") + '">' +
      '<div class="post-head">' +
        '<div class="avatar" style="background:' + p.autor.color + '">' + ER.iniciales(p.autor.nombre) + "</div>" +
        '<div class="who"><b>' + ER.escapar(p.autor.nombre) +
          (p.autor.verificado ? ' <span class="verified" title="Cuenta verificada">' + CHECK + "</span>" : "") +
          "</b><small>@" + ER.escapar(p.autor.usuario) + "</small></div>" +
        (p.url
          ? '<a class="post-src" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener" title="Ver publicación original">' + iconoX() + "</a>"
          : '<span class="post-src">' + iconoX() + "</span>") +
      "</div>" +
      "<p>" + textoEnriquecido(p.texto) + "</p>" +
      '<div class="post-foot">' + ER.htmlHace(p.fecha) +
        (p.url ? '<span>·</span><a class="client" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">Ver en X</a>' : "") +
        '<span class="cat"><i style="background:' + cat.color + '"></i>' + cat.nombre + " · " + ER.escapar(p.ciudad) + "</span>" +
      "</div>" +
      (p.emergencia !== null ? '<div class="post-modelo">' + etiquetaModelo(p) + "</div>" : "") +
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
  // Etiqueta mínima: punto de gravedad, categoría y hace cuánto. Es lo que queda fijo en el mapa.
  function etiquetaMini(p, total) {
    var g = ER.severidad(p).nivel;
    return '<span class="mini-dot" style="background:' + g.color + '"></span><b>' + D.categoria(p.categoria).nombre + "</b>" +
      '<span class="mini-hace">' + ER.hace(p.fecha).replace("hace ", "") + "</span>" +
      (total > 1 ? '<span class="mini-n">+' + (total - 1) + "</span>" : "");
  }

  // Detalle breve al pasar el cursor: cuántos reportes, de qué y el más reciente.
  function tarjeta(p, total, porCat) {
    var g = ER.severidad(p).nivel;
    var desglose = "";
    if (total > 1 && porCat) {
      desglose = '<div class="desglose">' + D.CATEGORIAS.filter(function (x) { return porCat[x.id]; }).map(function (x) {
        return '<span><i style="background:' + x.color + '"></i>' + porCat[x.id] + " " + x.nombre.toLowerCase() + "</span>";
      }).join("") + "</div>";
    }
    return (total > 1 ? '<div class="count"><b>' + total + " reportes</b> en esta zona</div>" + desglose : "") +
      '<div class="ultimo"><span class="mini-dot" style="background:' + g.color + '" title="' + g.nombre + '"></span>' +
      (total > 1 ? "Último: " : "") + "<b>" + D.categoria(p.categoria).nombre + "</b> · " + ER.hace(p.fecha) + "</div>" +
      '<div class="extracto">' + ER.escapar(p.texto.length > 90 ? p.texto.slice(0, 90) + "…" : p.texto) + "</div>";
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
        className: "er-point er-" + g.id + (fresco ? " fresh" : "") + (reciente ? " reciente" : ""), iconSize: [30, 30] }),
      keyboard: false
    });
    m._erPost = p;
    m.bindPopup(popupPost(p), { maxWidth: 320 });
    m.bindTooltip(function () { return etiquetaMini(p, 1); }, { direction: "top", className: "er-mini", offset: [0, -14] });
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
    for (var i = 0; i < marcadores.length && spotlights.length < 3; i++) {
      var padre = capaGrupos.getVisibleParent(marcadores[i]);
      if (!padre || vistos.indexOf(padre) >= 0) continue;
      var ll = padre.getLatLng();
      if (!limites.contains(ll)) continue;
      var pt = mapa.latLngToContainerPoint(ll);
      if (pt.y < 60) continue;
      // La etiqueta ocupa unos 180 x 30 px por encima del punto: se evita que choque con otra.
      var choca = spotlights.some(function (s) {
        var q = mapa.latLngToContainerPoint(s.getLatLng());
        return Math.abs(q.x - pt.x) < 190 && Math.abs(q.y - pt.y) < 44;
      });
      vistos.push(padre);
      if (choca) continue;
      var info = ultimoDe(padre);
      // Las tarjetas fijas van compactas; el desglose por categoría se ve al pasar el cursor.
      padre.bindTooltip(etiquetaMini(info.post, info.total), {
        permanent: true, direction: "top", className: "er-mini er-fija", offset: [0, -20], interactive: false
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
    // Mapas base sin API key. "Calles" es el de OpenStreetMap a color; se puede
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
    var elegida = "Calles";
    try { if (bases[localStorage.getItem("er-mapa-base")]) elegida = localStorage.getItem("er-mapa-base"); } catch (e) { /* sin almacenamiento */ }
    bases[elegida].addTo(mapa);
    L.control.layers(bases, null, { position: "topright", collapsed: true }).addTo(mapa);
    mapa.on("baselayerchange", function (e) {
      try { localStorage.setItem("er-mapa-base", e.name); } catch (err) { /* sin almacenamiento */ }
    });
    mapa.zoomControl.setPosition("bottomright");

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
        c.bindTooltip(etiquetaMini(info.post, info.total), { permanent: true, direction: "top", className: "er-mini er-fija", offset: [0, -20] }).openTooltip();
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
    capaCalor = L.heatLayer([], {
      radius: 26, blur: 22, maxZoom: 12, max: 6, minOpacity: 0.25,
      gradient: { 0.15: "#a8e0b0", 0.4: "#2f9e44", 0.6: "#f0a400", 0.8: "#ec6a2c", 1: "#c92a2a" }
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
    var G = ER.GRAVEDAD;
    var escala = '<span class="ley-grav"><b>Gravedad</b>' + [G.baja, G.media, G.alta].map(function (g) {
      return '<span><i class="dot-grav" style="background:' + g.color + '"></i>' + g.corto + "</span>";
    }).join("") + "</span>";
    var cats = '<span class="ley-cats">' + D.CATEGORIAS.filter(function (c) { return ER.filtros.categorias.indexOf(c.id) >= 0; }).map(function (c) {
      return '<span title="' + c.nombre + '">' + window.icon(c.icono) + c.nombre + "</span>";
    }).join("") + "</span>";
    el.innerHTML = st.modo === "geo"
      ? escala + cats + '<span class="ley-grupos">Grupos: verde menos de 5 reportes, amarillo de 5 a 14, rojo 15 o más</span>' + base
      : "<span>Densidad de reportes: baja<i class=\"ramp\"></i>alta</span>" + base;
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
    capaCalor.setLatLngs(posts.map(function (p) { return [p.lat, p.lng, 1]; }));
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
          '<span class="alerta-icono" style="color:' + c.categoria.color + '">' + window.icon(c.categoria.icono) + "</span>" +
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
      '<div class="v"><i></i>' + ER.fmtNum(ds[0].data[i]) + " posts</div>" +
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
    var previo = D.filtrar(ER.consulta({ desde: ant.desde, hasta: ant.hasta }));
    chart.data.datasets[0].data = porFranja(actual);
    chart.data.datasets[1].data = porFranja(previo);
    chart.update();
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
          capaCalor.addLatLng([p.lat, p.lng, 1]);
          pintarLeyendaMapa((pintarLeyendaMapa._t || 0) + 1);
        }
        refrescoDiferido();
      }
    }
  });
})();

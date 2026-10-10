/*
 * Emergency Radar · vista Estadísticas
 * Indicadores, distribución por categoría, ciudades, actividad por día/hora, ubicación y autores.
 */
(function () {
  "use strict";

  var D = window.ER_DATA;
  var ER = window.ER;
  var chartCat, chartCiud;
  var DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  function contarPor(posts, clave) {
    var m = {};
    posts.forEach(function (p) { var k = clave(p); m[k] = (m[k] || 0) + 1; });
    return m;
  }
  function maximo(m) {
    var mejor = null;
    Object.keys(m).forEach(function (k) { if (mejor === null || m[k] > m[mejor]) mejor = k; });
    return mejor;
  }
  function pct(a, b) { return b ? Math.round((a / b) * 1000) / 10 : 0; }

  // Escala de mapa de calor: blanco (sin actividad), amarillo, anaranjado y rojo (máxima).
  var PASOS = [[248, 249, 251], [255, 212, 59], [255, 146, 43], [224, 49, 49]];
  function colorSecuencial(t) {
    t = Math.max(0, Math.min(1, t)) * (PASOS.length - 1);
    var i = Math.min(Math.floor(t), PASOS.length - 2), f = t - i, a = PASOS[i], b = PASOS[i + 1];
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(",") + ")";
  }

  function pintarKpis(posts, previos) {
    var total = posts.length;
    var geo = posts.filter(function (p) { return p.lat !== null; }).length;
    var cambio = previos.length ? ((total - previos.length) / previos.length) * 100 : 0;
    var porCat = contarPor(posts, function (p) { return p.categoria; });
    var topCat = maximo(porCat);
    var porCiudad = contarPor(posts.filter(function (p) { return p.ciudad !== D.SIN_UBICACION; }), function (p) { return p.ciudad; });
    var topCiudad = maximo(porCiudad);
    var sube = cambio > 0;
    // Sin publicaciones en el periodo anterior no hay con qué comparar.
    var subTotal = previos.length
      ? '<span class="ic-wrap">' + window.icon(sube ? "trending-up" : "trending-down") + "</span>" +
        (sube ? "+" : "") + cambio.toFixed(1).replace(".", ",") + " % frente al periodo anterior"
      : "Sin capturas del periodo anterior para comparar";
    var kpis = [
      { lbl: "Publicaciones", val: ER.fmtNum(total), sub: subTotal, subCls: previos.length && sube ? "up" : "" },
      { lbl: "Geolocalizadas", val: ER.fmtNum(geo), sub: pct(geo, total).toString().replace(".", ",") + " % del total" },
      { lbl: "Categoría principal", val: topCat ? D.categoria(topCat).nombre : "–", sm: true, sub: topCat ? ER.fmtNum(porCat[topCat]) + " menciones" : "" },
      { lbl: "Ciudad con más reportes", val: topCiudad || "–", sm: true, sub: topCiudad ? ER.fmtNum(porCiudad[topCiudad]) + " reportes" : "" }
    ];
    document.getElementById("kpis").innerHTML = kpis.map(function (k) {
      return '<article class="card kpi"><div class="lbl">' + k.lbl + '</div><div class="val' + (k.sm ? " sm" : "") + '">' + k.val +
        '</div><div class="sub ' + (k.subCls || "") + '">' + k.sub + "</div></article>";
    }).join("");
  }

  function pintarCategorias(posts) {
    var porCat = contarPor(posts, function (p) { return p.categoria; });
    var datos = D.CATEGORIAS.map(function (c) { return porCat[c.id] || 0; });
    chartCat.data.labels = D.CATEGORIAS.map(function (c) { return c.nombre; });
    chartCat.data.datasets[0].data = datos;
    chartCat.data.datasets[0].backgroundColor = D.CATEGORIAS.map(function (c) { return c.color; });
    chartCat.update();
    document.getElementById("legendCat").innerHTML = D.CATEGORIAS.map(function (c, i) {
      return '<li><i class="sw" style="background:' + c.color + '"></i>' + window.icon(c.icono) + "<span>" + c.nombre + '</span><span class="n">' +
        ER.fmtNum(datos[i]) + '</span><span class="p">' + pct(datos[i], posts.length).toString().replace(".", ",") + " %</span></li>";
    }).join("");
  }

  function pintarCiudades(posts) {
    // Las publicaciones sin ubicación se cuentan aparte, en "Ubicación de las publicaciones".
    var m = contarPor(posts.filter(function (p) { return p.ciudad !== D.SIN_UBICACION; }), function (p) { return p.ciudad; });
    var top = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 10);
    chartCiud.data.labels = top;
    chartCiud.data.datasets[0].data = top.map(function (k) { return m[k]; });
    chartCiud.update();
  }

  // En pantallas angostas la cuadrícula se transpone (días en columnas, horas en filas) para no desbordarse.
  var vertical = window.matchMedia("(max-width: 640px)");
  var ultimosHeat = null;
  function pintarHeatgrid(posts) {
    ultimosHeat = posts;
    var g = DIAS.map(function () { return new Array(24).fill(0); });
    posts.forEach(function (p) { g[(p.fecha.getDay() + 6) % 7][p.fecha.getHours()]++; });
    var max = Math.max.apply(null, g.map(function (r) { return Math.max.apply(null, r); })) || 1;
    var celda = function (d, h) {
      var v = g[d][h];
      return '<td style="background:' + colorSecuencial(v / max) + '" title="' + DIAS[d] + " " + ER.pad(h) + ":00 · " + ER.fmtNum(v) + ' publicaciones"></td>';
    };
    var html = "<table><thead><tr><th></th>", d, h;
    if (vertical.matches) {
      DIAS.forEach(function (dia) { html += "<th>" + dia + "</th>"; });
      html += "</tr></thead><tbody>";
      for (h = 0; h < 24; h++) {
        html += '<tr><th class="row">' + ER.pad(h) + "h</th>";
        for (d = 0; d < 7; d++) html += celda(d, h);
        html += "</tr>";
      }
    } else {
      for (h = 0; h < 24; h++) html += "<th>" + (h % 3 === 0 ? ER.pad(h) + "h" : "") + "</th>";
      html += "</tr></thead><tbody>";
      for (d = 0; d < 7; d++) {
        html += '<tr><th class="row">' + DIAS[d] + "</th>";
        for (h = 0; h < 24; h++) html += celda(d, h);
        html += "</tr>";
      }
    }
    var el = document.getElementById("heatgrid");
    el.classList.toggle("vertical", vertical.matches);
    el.innerHTML = html + "</tbody></table>";
  }
  var alCambiar = function () { if (ultimosHeat) pintarHeatgrid(ultimosHeat); };
  if (vertical.addEventListener) vertical.addEventListener("change", alCambiar); else vertical.addListener(alCambiar);

  // Cuántas publicaciones pudieron ubicarse en el mapa y cuántas no.
  function pintarUbicacion(posts) {
    var total = posts.length;
    var geo = posts.filter(function (p) { return p.lat !== null; }).length;
    var filas = [
      ["map-pin", "En el mapa", geo, "#2f7be5"],
      ["map-pin-off", "Sin ubicación", total - geo, "#c4ccdb"]
    ];
    document.getElementById("sourceBars").innerHTML = filas.map(function (f) {
      return '<div><div class="row-h"><span>' + window.icon(f[0]) + "<b>" + f[1] + "</b></span><small>" +
        ER.fmtNum(f[2]) + " · " + pct(f[2], total).toString().replace(".", ",") + ' %</small></div><div class="track"><div class="fill" style="width:' +
        pct(f[2], total) + "%;background:" + f[3] + '"></div></div></div>';
    }).join("") + '<p class="hint" style="max-width:none">Se ubican por coordenadas, por el lugar etiquetado en X o por la ciudad mencionada en el texto.</p>';
  }

  function pintarAutores(posts) {
    var m = {}, info = {};
    posts.forEach(function (p) { m[p.autor.usuario] = (m[p.autor.usuario] || 0) + 1; info[p.autor.usuario] = p.autor; });
    var top = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 6);
    document.getElementById("rankAutores").innerHTML = top.map(function (u) {
      var a = info[u];
      return '<li><div class="avatar" style="width:30px;height:30px;font-size:11px;background:' + a.color + '">' + ER.iniciales(a.nombre) + "</div>" +
        '<div class="who"><b>' + ER.escapar(a.nombre) + '</b><small><a href="https://x.com/' + encodeURIComponent(u) + '" target="_blank" rel="noopener">@' +
        ER.escapar(u) + '</a></small></div><span class="n">' + ER.fmtNum(m[u]) + "</span></li>";
    }).join("") || '<li class="empty" style="justify-content:center">' + ER.mensajeSinDatos("Sin publicaciones en el periodo.") + "</li>";
  }

  // Etiqueta el valor al final de cada barra horizontal.
  var valoresBarra = {
    id: "valoresBarra",
    afterDatasetsDraw: function (c) {
      var ctx = c.ctx, meta = c.getDatasetMeta(0);
      ctx.save();
      ctx.font = "600 12px " + Chart.defaults.font.family;
      ctx.fillStyle = "#4a5063";
      ctx.textBaseline = "middle";
      meta.data.forEach(function (bar, i) { ctx.fillText(ER.fmtNum(c.data.datasets[0].data[i]), bar.x + 6, bar.y); });
      ctx.restore();
    }
  };

  // Desempeño del modelo (validación cruzada sobre el corpus) y lo que decidió en el periodo.
  function pintarModelo() {
    var m = D.modelo();
    var el = document.getElementById("modeloInfo");
    if (!m) {
      el.innerHTML = '<p class="hint" style="max-width:none">' + ER.mensajeSinDatos("Las publicaciones todavía no se clasificaron con el modelo.") + "</p>";
      return;
    }
    var todas = D.filtrar(consulta({ clasificacion: "todas" }));
    var emerg = todas.filter(function (p) { return p.emergencia === true; }).length;
    var desc = todas.filter(function (p) { return p.emergencia === false; }).length;
    var met = m.metricas || {};
    var fmt = function (v) { return typeof v === "number" ? (v * 100).toFixed(1).replace(".", ",") + " %" : "–"; };
    var tiles = [
      ["Exactitud", fmt(met.accuracy)], ["Precisión", fmt(met.precision)], ["Sensibilidad", fmt(met.recall)],
      ["Especificidad", fmt(met.specificity)], ["F1", typeof met.f1 === "number" ? met.f1.toFixed(3).replace(".", ",") : "–"],
      ["Kappa con anotadores", typeof m.kappa_light === "number" ? m.kappa_light.toFixed(2).replace(".", ",") : "–"]
    ];
    el.innerHTML =
      '<p class="modelo-desc"><b>' + ER.escapar(m.descripcion || "") + "</b> · corpus de " + ER.fmtNum(m.corpus || 0) +
      " publicaciones etiquetadas por 9 anotadores · validación cruzada 5 × 5</p>" +
      '<div class="modelo-tiles">' + tiles.map(function (t) {
        return '<div><span>' + t[0] + "</span><b>" + t[1] + "</b></div>";
      }).join("") + "</div>" +
      '<p class="modelo-desc">En el periodo y con los filtros actuales, el modelo marcó <b>' + ER.fmtNum(emerg) +
      "</b> publicaciones como emergencia y descartó <b>" + ER.fmtNum(desc) + "</b>.</p>";
  }

  // ---------- Filtros propios de esta pestaña ----------
  // Son independientes de los filtros globales y del rango de la barra superior.
  var HORA = 3600000;
  var PRESETS = { "24h": 24 * HORA, "7d": 7 * 24 * HORA, "30d": 30 * 24 * HORA };
  var fe = { preset: "7d", desde: null, hasta: null, categoria: "", ciudad: "", clasificacion: "emergencias" };

  function primeraFecha() {
    var todas = D.filtrar({ clasificacion: "todas" });
    return todas.reduce(function (m, p) { return !m || p.fecha < m ? p.fecha : m; }, null) || ER.estado.desde;
  }
  // Con un periodo rápido el rango se recalcula en cada repintado, así sigue incluyendo lo más reciente.
  function rangoActual() {
    if (fe.preset) {
      var ahora = new Date();
      fe.hasta = ahora;
      fe.desde = fe.preset === "todo" ? primeraFecha() : new Date(ahora - PRESETS[fe.preset]);
    }
    return { desde: fe.desde, hasta: fe.hasta };
  }
  function consulta(extra) {
    var r = rangoActual();
    var o = {
      desde: r.desde, hasta: r.hasta, ciudad: fe.ciudad || null, clasificacion: fe.clasificacion,
      categorias: fe.categoria ? [fe.categoria] : D.CATEGORIAS.map(function (c) { return c.id; })
    };
    Object.keys(extra || {}).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function aLocal(d) {
    return d.getFullYear() + "-" + ER.pad(d.getMonth() + 1) + "-" + ER.pad(d.getDate()) + "T" + ER.pad(d.getHours()) + ":" + ER.pad(d.getMinutes());
  }
  function deLocal(v) { var d = v ? new Date(v) : null; return d && !isNaN(d) ? d : null; }

  function pintarControles() {
    var r = rangoActual();
    document.getElementById("estDesde").value = aLocal(r.desde);
    document.getElementById("estHasta").value = aLocal(r.hasta);
    document.querySelectorAll("#estPresets button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-preset") === fe.preset); });
    var sel = document.getElementById("estCiudad"), actual = fe.ciudad;
    sel.innerHTML = '<option value="">Todas las ciudades</option>' + D.ciudadesPresentes().map(function (c) {
      return '<option value="' + ER.escapar(c.nombre) + '">' + ER.escapar(c.nombre) + "</option>";
    }).join("");
    sel.value = actual;
    document.getElementById("estCategoria").value = fe.categoria;
    document.getElementById("estClase").value = fe.clasificacion;
  }

  function iniciarFiltros() {
    document.getElementById("estCategoria").innerHTML = '<option value="">Todas las categorías</option>' +
      D.CATEGORIAS.map(function (c) { return '<option value="' + c.id + '">' + c.nombre + "</option>"; }).join("");
    document.querySelectorAll("#estPresets button").forEach(function (b) {
      b.addEventListener("click", function () { fe.preset = b.getAttribute("data-preset"); pintarTodo(); });
    });
    ["estDesde", "estHasta"].forEach(function (id) {
      document.getElementById(id).addEventListener("change", function () {
        var d = deLocal(document.getElementById("estDesde").value), h = deLocal(document.getElementById("estHasta").value);
        if (!d || !h) return;
        if (d > h) { var t = d; d = h; h = t; }
        fe.preset = null; fe.desde = d; fe.hasta = h;
        pintarTodo();
      });
    });
    document.getElementById("estCategoria").addEventListener("change", function (e) { fe.categoria = e.target.value; pintarTodo(); });
    document.getElementById("estCiudad").addEventListener("change", function (e) { fe.ciudad = e.target.value; pintarTodo(); });
    document.getElementById("estClase").addEventListener("change", function (e) { fe.clasificacion = e.target.value; pintarTodo(); });
    document.getElementById("estLimpiar").addEventListener("click", function () {
      fe = { preset: "7d", desde: null, hasta: null, categoria: "", ciudad: "", clasificacion: "emergencias" };
      pintarTodo();
    });
  }

  function pintarResumenFiltros(total) {
    var r = rangoActual();
    var f = function (d) { return ER.fmtFechaCorta(d) + " " + ER.fmtHora(d); };
    document.getElementById("resumenFiltros").innerHTML = "<b>" + ER.fmtNum(total) + (total === 1 ? " publicación" : " publicaciones") +
      "</b> entre el " + f(r.desde) + " y el " + f(r.hasta) + ". Estos filtros solo aplican en Estadísticas.";
  }

  function pintarTodo() {
    var o = consulta();
    var posts = D.filtrar(o);
    var dur = o.hasta - o.desde;
    var previos = D.filtrar(consulta({ desde: new Date(o.desde - dur - 1), hasta: new Date(o.desde - 1) }));
    pintarControles();
    pintarModelo();
    pintarResumenFiltros(posts.length);
    pintarKpis(posts, previos);
    pintarCategorias(posts);
    pintarCiudades(posts);
    pintarHeatgrid(posts);
    pintarUbicacion(posts);
    pintarAutores(posts);
  }

  ER.registrarVista("estadisticas", {
    iniciar: function () {
      chartCat = new Chart(document.getElementById("chartCat"), {
        type: "doughnut",
        data: { labels: [], datasets: [{ data: [], borderColor: "#fff", borderWidth: 2, hoverOffset: 4 }] },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: "66%",
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#fff", titleColor: "#1d2130", bodyColor: "#4a5063", borderColor: "#e2e5ee", borderWidth: 1, padding: 10,
              callbacks: { label: function (i) { return " " + ER.fmtNum(i.parsed) + " menciones"; } }
            }
          }
        }
      });
      chartCiud = new Chart(document.getElementById("chartCiudades"), {
        type: "bar",
        data: { labels: [], datasets: [{ label: "Reportes", data: [], backgroundColor: "#2f7be5", borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: false, barThickness: 16 }] },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false, layout: { padding: { right: 44 } },
          plugins: {
            legend: { display: false },
            tooltip: { backgroundColor: "#fff", titleColor: "#1d2130", bodyColor: "#4a5063", borderColor: "#e2e5ee", borderWidth: 1, padding: 10 }
          },
          scales: {
            x: { beginAtZero: true, grid: { color: "#eef0f5" }, border: { display: false }, ticks: { maxTicksLimit: 5, precision: 0 } },
            y: { grid: { display: false }, border: { display: false }, ticks: { color: "#1d2130", font: { size: 13 } } }
          }
        },
        plugins: [valoresBarra]
      });
      iniciarFiltros();
      pintarTodo();
    },
    mostrar: function () {
      if (this._pendiente) { this._pendiente = false; pintarTodo(); }
    },
    actualizar: function (tipo) {
      // Repintar es seguro ante cualquier evento: esta pestaña usa solo sus propios filtros.
      clearTimeout(this._t);
      if (tipo === "nueva") this._t = setTimeout(pintarTodo, 600);
      else pintarTodo();
    }
  });
})();

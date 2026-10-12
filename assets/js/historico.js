/*
 * Emergency Radar · vista Histórico
 * Publicaciones por día (barras apiladas por categoría) y registro paginado con exportación CSV.
 * Categoría, ciudad y clasificación son los filtros globales (ER.filtros); la búsqueda es propia de esta vista.
 */
(function () {
  "use strict";

  var D = window.ER_DATA;
  var ER = window.ER;
  var POR_PAGINA = 10;
  var st = { pagina: 0, resultados: [] };
  var chart;

  function val(id) { return document.getElementById(id).value; }

  function filtrar() {
    return D.filtrar(ER.consulta({ texto: val("histBuscar").trim() }));
  }

  // Refleja los filtros globales en los selectores de esta vista.
  function sincronizarSelectores() {
    var f = ER.filtros;
    var selCat = document.getElementById("histCategoria");
    // La opción "N categorías elegidas" solo existe mientras hay una selección parcial
    // (hecha en el mapa). Algunos navegadores muestran las opciones ocultas como una línea vacía.
    var parcial = selCat.querySelector('option[value="__sel"]');
    if (parcial) parcial.remove();
    if (f.categorias.length === D.CATEGORIAS.length) selCat.value = "";
    else if (f.categorias.length === 1) selCat.value = f.categorias[0];
    else {
      parcial = document.createElement("option");
      parcial.value = "__sel";
      parcial.textContent = f.categorias.length + " categorías elegidas";
      selCat.appendChild(parcial);
      selCat.value = "__sel";
    }
    document.getElementById("histClase").value = f.clasificacion;
  }

  function pintarGrafico(posts) {
    var dias = [], indice = {};
    for (var d = ER.inicioDia(ER.estado.desde); d <= ER.estado.hasta; d = ER.sumarDias(d, 1)) {
      indice[ER.isoDia(d)] = dias.length;
      dias.push(new Date(d));
    }
    var series = D.CATEGORIAS.map(function () { return new Array(dias.length).fill(0); });
    var pos = {};
    D.CATEGORIAS.forEach(function (c, i) { pos[c.id] = i; });
    posts.forEach(function (p) {
      var k = indice[ER.isoDia(p.fecha)];
      if (k !== undefined) series[pos[p.categoria]][k]++;
    });
    chart.data.labels = dias.map(function (x) { var e = ER.ec(x); return ER.pad(e.d) + "/" + ER.pad(e.m + 1); });
    chart.data.datasets = D.CATEGORIAS.map(function (c, i) {
      return {
        label: c.nombre, data: series[i], backgroundColor: c.color,
        borderColor: "#ffffff", borderWidth: { top: 2 }, borderSkipped: false,
        borderRadius: i === D.CATEGORIAS.length - 1 ? { topLeft: 4, topRight: 4 } : 0,
        maxBarThickness: 28
      };
    });
    chart.update();
  }

  function pintarTabla() {
    var r = st.resultados;
    var total = r.length;
    var paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    st.pagina = Math.min(st.pagina, paginas - 1);
    var ini = st.pagina * POR_PAGINA;
    var filas = r.slice(ini, ini + POR_PAGINA);
    document.getElementById("histBody").innerHTML = filas.length ? filas.map(function (p) {
      var c = D.categoria(p.categoria);
      return "<tr>" +
        '<td class="nowrap h-fecha">' + ER.fmtFechaCorta(p.fecha) + "<br><small style=\"color:#8a90a2\">" + ER.fmtHora(p.fecha) + " · " + ER.htmlHace(p.fecha) + "</small></td>" +
        '<td class="h-cat"><span class="tag-cat">' + window.icon(c.icono) + c.nombre + "</span></td>" +
        '<td class="nowrap h-ciudad">' + ER.escapar(p.ciudad) + (p.lat === null ? "" : ' <span title="Geolocalizada" style="color:#2f7be5">' + window.icon("map-pin", "") + "</span>") + "</td>" +
        '<td class="nowrap h-autor"><b>' + ER.escapar(p.autor.nombre) + '</b><br><small style="color:#8a90a2">@' + ER.escapar(p.autor.usuario) + "</small></td>" +
        '<td class="txt">' + ER.escapar(p.texto) + "</td>" +
        '<td class="nowrap h-modelo">' + (ER.etiquetaModelo(p) || '<span class="modelo">Sin clasificar</span>') + "</td>" +
        '<td class="nowrap h-link">' + (p.url ? '<a class="link-x" href="' + ER.escapar(p.url) + '" target="_blank" rel="noopener">' + "Ver en" + window.icon("brand-x") + "</a>" : "") + "</td></tr>";
    }).join("") : '<tr><td colspan="7" class="empty">' + ER.mensajeSinDatos("No hay publicaciones para los filtros seleccionados.") + "</td></tr>";
    document.querySelectorAll("#histBody .ic").forEach(function (i) { i.style.width = i.style.height = "14px"; });
    document.getElementById("histInfo").textContent = total
      ? (ini + 1) + "–" + Math.min(ini + POR_PAGINA, total) + " de " + ER.fmtNum(total) + " publicaciones"
      : "0 publicaciones";
    document.getElementById("histPrev").disabled = st.pagina === 0;
    document.getElementById("histNext").disabled = st.pagina >= paginas - 1;
    pintarPaginas(paginas);
  }

  // Números de página: la primera, la última y dos a cada lado de la actual.
  function pintarPaginas(paginas) {
    var actual = st.pagina, html = [], anterior = -1;
    for (var i = 0; i < paginas; i++) {
      if (i !== 0 && i !== paginas - 1 && Math.abs(i - actual) > 2) continue;
      if (anterior >= 0 && i - anterior > 1) html.push('<span class="pag-sep">…</span>');
      html.push('<button type="button" class="pag' + (i === actual ? " activa" : "") + '" data-pag="' + i + '"' +
        (i === actual ? ' aria-current="page"' : "") + ">" + (i + 1) + "</button>");
      anterior = i;
    }
    var cont = document.getElementById("histPaginas");
    cont.innerHTML = paginas > 1 ? html.join("") : "";
    cont.querySelectorAll("[data-pag]").forEach(function (b) {
      b.addEventListener("click", function () { st.pagina = +b.getAttribute("data-pag"); pintarTabla(); });
    });
  }

  // Las ciudades del filtro salen de los datos capturados, con su número de publicaciones.
  function opcionesCiudad() {
    var sel = document.getElementById("histCiudad");
    sel.innerHTML = '<option value="">Todas las ciudades</option>' + D.ciudadesPresentes().map(function (c) {
      return '<option value="' + ER.escapar(c.nombre) + '">' + ER.escapar(c.nombre) + " (" + c.total + ")</option>";
    }).join("");
    sel.value = ER.filtros.ciudad;
  }

  // Aviso con los filtros activos (fechas, categorías, ciudad, modelo y búsqueda).
  function pintarAviso() {
    var f = ER.filtros, partes = [];
    if (ER.estado.personalizado) partes.push("fechas del " + ER.textoRango());
    if (f.categorias.length !== D.CATEGORIAS.length)
      partes.push(f.categorias.length ? f.categorias.map(function (id) { return D.categoria(id).nombre; }).join(", ") : "ninguna categoría");
    if (f.ciudad) partes.push(f.ciudad);
    if (f.clasificacion !== "emergencias") partes.push(f.clasificacion === "todas" ? "incluye descartadas por el modelo" : "solo descartadas por el modelo");
    var q = val("histBuscar").trim();
    if (q) partes.push("búsqueda «" + q + "»");
    document.getElementById("avisoHist").hidden = !partes.length;
    document.getElementById("avisoHistTexto").textContent = partes.join(" · ");
  }

  function pintarTodo() {
    opcionesCiudad();
    sincronizarSelectores();
    pintarAviso();
    st.resultados = filtrar();
    pintarGrafico(st.resultados);
    pintarTabla();
  }

  function exportarCSV() {
    var cab = ["id", "fecha", "categoria", "ciudad", "lat", "lng", "autor", "usuario", "texto", "url", "emergencia_modelo", "prob_emergencia"];
    var lineas = [cab.join(",")].concat(st.resultados.map(function (p) {
      return [p.id, p.fecha.toISOString(), D.categoria(p.categoria).nombre, p.ciudad, p.lat === null ? "" : p.lat.toFixed(5),
        p.lng === null ? "" : p.lng.toFixed(5), p.autor.nombre, p.autor.usuario, p.texto, p.url || "",
        p.emergencia === null ? "" : (p.emergencia ? "si" : "no"), p.prob === null ? "" : p.prob]
        .map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(",");
    }));
    var blob = new Blob(["﻿" + lineas.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "emergency-radar_" + ER.isoDia(ER.estado.desde) + "_" + ER.isoDia(ER.estado.hasta) + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    ER.toast("Se exportaron " + ER.fmtNum(st.resultados.length) + " publicaciones");
  }

  ER.registrarVista("historico", {
    iniciar: function () {
      document.getElementById("histCategoria").innerHTML = '<option value="">Todas las categorías</option>' +
        D.CATEGORIAS.map(function (c) { return '<option value="' + c.id + '">' + c.nombre + "</option>"; }).join("");
      document.getElementById("legendHist").innerHTML = D.CATEGORIAS.map(function (c) {
        return '<span><i class="sw" style="background:' + c.color + '"></i>' + window.icon(c.icono) + c.nombre + "</span>";
      }).join("");

      chart = new Chart(document.getElementById("chartHist"), {
        type: "bar",
        data: { labels: [], datasets: [] },
        options: {
          responsive: true, maintainAspectRatio: false, animation: { duration: 300 },
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "#fff", titleColor: "#1d2130", bodyColor: "#4a5063", borderColor: "#e2e5ee", borderWidth: 1,
              padding: 10, boxPadding: 4, usePointStyle: true,
              callbacks: {
                footer: function (items) {
                  var t = items.reduce(function (s, i) { return s + i.parsed.y; }, 0);
                  return "Total: " + ER.fmtNum(t);
                }
              },
              footerColor: "#1d2130"
            }
          },
          scales: {
            x: { stacked: true, grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12 } },
            y: { stacked: true, beginAtZero: true, border: { display: false }, grid: { color: "#eef0f5" }, ticks: { maxTicksLimit: 6, precision: 0 } }
          }
        }
      });

      var reiniciar = function () { st.pagina = 0; pintarTodo(); };
      var t;
      document.getElementById("histBuscar").addEventListener("input", function () { clearTimeout(t); t = setTimeout(reiniciar, 200); });
      document.getElementById("btnQuitarHist").addEventListener("click", function () {
        document.getElementById("histBuscar").value = "";
        ER.cambiarFiltros({ categorias: D.CATEGORIAS.map(function (c) { return c.id; }), ciudad: "", clasificacion: "emergencias" });
        if (ER.estado.personalizado) ER.quitarRango();
        ER.toast("Se quitaron los filtros");
      });
      // Estos selectores cambian los filtros globales: aplican también en Principal y Estadísticas.
      document.getElementById("histCategoria").addEventListener("change", function () {
        var v = this.value;
        if (v === "__sel") return;
        ER.cambiarFiltros({ categorias: v ? [v] : D.CATEGORIAS.map(function (c) { return c.id; }) });
      });
      document.getElementById("histCiudad").addEventListener("change", function () { ER.cambiarFiltros({ ciudad: this.value }); });
      document.getElementById("histClase").addEventListener("change", function () { ER.cambiarFiltros({ clasificacion: this.value }); });
      document.getElementById("histPrev").addEventListener("click", function () { st.pagina--; pintarTabla(); });
      document.getElementById("histNext").addEventListener("click", function () { st.pagina++; pintarTabla(); });
      document.getElementById("histExportar").addEventListener("click", exportarCSV);
      pintarTodo();
    },
    mostrar: function () {
      if (this._pendiente) { this._pendiente = false; pintarTodo(); }
    },
    actualizar: function (tipo) {
      // Las publicaciones en vivo no reinician la página que el usuario está leyendo.
      if (tipo === "nueva") { clearTimeout(this._t); this._t = setTimeout(function () { opcionesCiudad(); st.resultados = filtrar(); pintarGrafico(st.resultados); pintarTabla(); }, 800); }
      else { st.pagina = 0; pintarTodo(); }
    }
  });
})();

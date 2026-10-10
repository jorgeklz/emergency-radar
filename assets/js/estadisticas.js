/*
 * Emergency Radar · vista Estadísticas
 * Indicadores, distribución por categoría, ciudades, actividad por día/hora, fuentes y autores.
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

  // Escala secuencial de un solo tono (azul claro a índigo).
  var PASOS = [[238, 244, 254], [156, 194, 245], [47, 123, 229], [46, 49, 146]];
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
    var porCiudad = contarPor(posts, function (p) { return p.ciudad; });
    var topCiudad = maximo(porCiudad);
    var sube = cambio > 0;
    var kpis = [
      { lbl: "Publicaciones", val: ER.fmtNum(total),
        sub: '<span class="ic-wrap">' + window.icon(sube ? "trending-up" : "trending-down") + "</span>" +
          (sube ? "+" : "") + cambio.toFixed(1).replace(".", ",") + " % frente al periodo anterior", subCls: sube ? "up" : "" },
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
      return '<li><i class="sw" style="background:' + c.color + '"></i><span>' + c.nombre + '</span><span class="n">' +
        ER.fmtNum(datos[i]) + '</span><span class="p">' + pct(datos[i], posts.length).toString().replace(".", ",") + " %</span></li>";
    }).join("");
  }

  function pintarCiudades(posts) {
    var m = contarPor(posts, function (p) { return p.ciudad; });
    var top = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 10);
    chartCiud.data.labels = top;
    chartCiud.data.datasets[0].data = top.map(function (k) { return m[k]; });
    chartCiud.update();
  }

  function pintarHeatgrid(posts) {
    var g = DIAS.map(function () { return new Array(24).fill(0); });
    posts.forEach(function (p) { g[(p.fecha.getDay() + 6) % 7][p.fecha.getHours()]++; });
    var max = Math.max.apply(null, g.map(function (r) { return Math.max.apply(null, r); })) || 1;
    var html = "<table><thead><tr><th></th>";
    for (var h = 0; h < 24; h++) html += "<th>" + (h % 3 === 0 ? ER.pad(h) + "h" : "") + "</th>";
    html += "</tr></thead><tbody>";
    g.forEach(function (fila, d) {
      html += '<tr><th class="row">' + DIAS[d] + "</th>";
      fila.forEach(function (v, h) {
        html += '<td style="background:' + colorSecuencial(v / max) + '" title="' + DIAS[d] + " " + ER.pad(h) + ":00 · " + ER.fmtNum(v) + ' publicaciones"></td>';
      });
      html += "</tr>";
    });
    document.getElementById("heatgrid").innerHTML = html + "</tbody></table>";
  }

  function pintarFuentes(posts) {
    var m = contarPor(posts, function (p) { return p.fuente; });
    var total = posts.length;
    document.getElementById("sourceBars").innerHTML = [["twitter", "Twitter", "brand-twitter", "tw"], ["facebook", "Facebook", "brand-facebook", "fb"]].map(function (f) {
      var n = m[f[0]] || 0;
      return '<div><div class="row-h"><span class="' + f[3] + '">' + window.icon(f[2]) + '<b style="color:#1d2130">' + f[1] + "</b></span><small>" +
        ER.fmtNum(n) + " · " + pct(n, total).toString().replace(".", ",") + ' %</small></div><div class="track"><div class="fill" style="width:' + pct(n, total) + '%"></div></div></div>';
    }).join("");
  }

  function pintarAutores(posts) {
    var m = {}, info = {};
    posts.forEach(function (p) { m[p.autor.usuario] = (m[p.autor.usuario] || 0) + 1; info[p.autor.usuario] = p.autor; });
    var top = Object.keys(m).sort(function (a, b) { return m[b] - m[a]; }).slice(0, 6);
    document.getElementById("rankAutores").innerHTML = top.map(function (u) {
      var a = info[u];
      return '<li><div class="avatar" style="width:30px;height:30px;font-size:11px;background:' + a.color + '">' + ER.iniciales(a.nombre) + "</div>" +
        '<div class="who"><b>' + ER.escapar(a.nombre) + "</b><small>@" + ER.escapar(u) + '</small></div><span class="n">' + ER.fmtNum(m[u]) + "</span></li>";
    }).join("");
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

  function pintarTodo() {
    var posts = D.filtrar({ desde: ER.estado.desde, hasta: ER.estado.hasta });
    var ant = ER.periodoAnterior();
    var previos = D.filtrar({ desde: ant.desde, hasta: ant.hasta });
    pintarKpis(posts, previos);
    pintarCategorias(posts);
    pintarCiudades(posts);
    pintarHeatgrid(posts);
    pintarFuentes(posts);
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
      pintarTodo();
    },
    mostrar: function () {
      if (this._pendiente) { this._pendiente = false; pintarTodo(); }
    },
    actualizar: function () {
      clearTimeout(this._t);
      this._t = setTimeout(pintarTodo, 600);
    }
  });
})();

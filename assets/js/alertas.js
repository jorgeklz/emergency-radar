/*
 * Emergency Radar · motor de pre-alertas
 * ------------------------------------------------------------------
 * Compara lo que se reporta en la ventana actual (1, 6 o 24 horas) con lo
 * habitual y asigna un nivel a cada categoría y a cada zona.
 *
 * Línea base ("lo habitual"), en este orden:
 *   1. La misma franja horaria de los días anteriores con datos (hasta 7),
 *      para respetar que de noche se reporta menos que de día.
 *   2. Si todavía no hay días completos, la ventana inmediatamente anterior.
 *   3. Si tampoco hay, no hay referencia y se indica así.
 *
 * Puntaje: z = (observado - esperado) / raíz(esperado + 1), una
 * aproximación de Poisson pensada para conteos pequeños.
 *   Alerta alta: z ≥ 3 y al menos 5 posts
 *   Alerta:      z ≥ 2 y al menos 3 posts
 *   Atención:    z ≥ 1 y al menos 2 posts, o se está acelerando, o hay
 *                3 o más posts que mencionan heridos o fallecidos
 *   Normal:      lo demás
 *
 * Funciones puras: no tocan el DOM, así se pueden probar en Node.
 */
(function (raiz) {
  "use strict";

  var HORA = 3600 * 1000;
  var DIA = 24 * HORA;

  var NIVELES = {
    normal: { id: "normal", orden: 0, nombre: "Normal", icono: "circle-check", color: "#0ca30c" },
    atencion: { id: "atencion", orden: 1, nombre: "Atención", icono: "alert-triangle", color: "#fab219" },
    alerta: { id: "alerta", orden: 2, nombre: "Alerta", icono: "bell-ringing", color: "#ec835a" },
    alta: { id: "alta", orden: 3, nombre: "Alerta alta", icono: "alert-octagon", color: "#d03b3b" },
    sinbase: { id: "sinbase", orden: -1, nombre: "Sin referencia", icono: "info-circle", color: "#8a90a2" }
  };

  // Menciones de personas afectadas: señal de gravedad.
  var GRAVEDAD = /(herid|fallec|muert|muri[oó]|v[ií]ctima|lesionad|cad[aá]ver|asesinad|sin vida|atrapad|desaparecid|ahogad|calcinad)/i;

  function contar(posts, desde, hasta) {
    var n = 0;
    for (var i = 0; i < posts.length; i++) if (posts[i].fecha >= desde && posts[i].fecha < hasta) n++;
    return n;
  }

  // Lo habitual para la ventana [ini, fin) según los datos disponibles desde `inicioDatos`.
  function lineaBase(posts, ini, fin, inicioDatos) {
    var largo = fin - ini, conteos = [];
    for (var d = 1; d <= 7; d++) {
      var a = ini - d * DIA;
      if (a < inicioDatos) break;
      conteos.push(contar(posts, a, a + largo));
    }
    if (conteos.length) {
      var suma = conteos.reduce(function (s, x) { return s + x; }, 0);
      return { esperado: suma / conteos.length, tipo: "dias", n: conteos.length };
    }
    if (ini - largo >= inicioDatos) return { esperado: contar(posts, ini - largo, ini), tipo: "previo", n: 1 };
    return { esperado: null, tipo: "ninguna", n: 0 };
  }

  // ¿El último cuarto de la ventana tiene al menos el doble que el promedio de los otros tres?
  function aceleracion(posts, ini, fin) {
    var cuarto = (fin - ini) / 4, partes = [];
    for (var i = 0; i < 4; i++) partes.push(contar(posts, ini + i * cuarto, ini + (i + 1) * cuarto));
    var antes = (partes[0] + partes[1] + partes[2]) / 3;
    return { ultimo: partes[3], promedioAntes: antes, acelera: partes[3] >= 3 && partes[3] >= 2 * Math.max(antes, 0.5), minutos: Math.round(cuarto / 60000) };
  }

  function nivelDe(obs, base, extra) {
    extra = extra || {};
    if (base.esperado === null) {
      return { nivel: extra.acelera || extra.graves >= 3 ? NIVELES.atencion : NIVELES.sinbase, z: null };
    }
    var z = (obs - base.esperado) / Math.sqrt(base.esperado + 1);
    var nivel = NIVELES.normal;
    if (z >= 3 && obs >= 5) nivel = NIVELES.alta;
    else if (z >= 2 && obs >= 3) nivel = NIVELES.alerta;
    else if ((z >= 1 && obs >= 2) || extra.acelera || extra.graves >= 3) nivel = NIVELES.atencion;
    return { nivel: nivel, z: z };
  }

  /*
   * posts:       publicaciones ya filtradas por los filtros globales (sin filtro de fecha)
   * opciones:    { fin: Date, horas: 1|6|24, inicioDatos: Date, categorias: [{id,...}], sinUbicacion: "..." }
   */
  function calcular(posts, opciones) {
    var fin = +opciones.fin, ini = fin - opciones.horas * HORA, inicioDatos = +opciones.inicioDatos;
    var sinUbic = opciones.sinUbicacion || "Sin ubicación";
    var enVentana = posts.filter(function (p) { return p.fecha >= ini && p.fecha < fin + 1; });

    var categorias = opciones.categorias.map(function (c) {
      var todos = posts.filter(function (p) { return p.categoria === c.id; });
      var actuales = enVentana.filter(function (p) { return p.categoria === c.id; })
        .sort(function (a, b) { return b.fecha - a.fecha; });
      var base = lineaBase(todos, ini, fin, inicioDatos);
      var acel = aceleracion(todos, ini, fin);
      var graves = actuales.filter(function (p) { return GRAVEDAD.test(p.texto); }).length;
      var verificados = actuales.filter(function (p) { return p.autor && p.autor.verificado; }).length;
      var r = nivelDe(actuales.length, base, { acelera: acel.acelera, graves: graves });
      var zonas = {};
      actuales.forEach(function (p) { if (p.ciudad !== sinUbic) zonas[p.ciudad] = (zonas[p.ciudad] || 0) + 1; });
      var serie = new Array(24).fill(0), paso = (fin - ini) / 24;
      actuales.forEach(function (p) { serie[Math.min(23, Math.floor((p.fecha - ini) / paso))]++; });
      return {
        categoria: c, observado: actuales.length, base: base, z: r.z, nivel: r.nivel,
        aceleracion: acel, graves: graves, verificados: verificados,
        zonas: Object.keys(zonas).map(function (k) { return { ciudad: k, n: zonas[k] }; }).sort(function (a, b) { return b.n - a.n; }),
        ultimo: actuales.length ? actuales[0].fecha : null,
        recientes: actuales.slice(0, 3),
        serie: serie
      };
    }).sort(function (a, b) { return b.nivel.orden - a.nivel.orden || (b.z || 0) - (a.z || 0) || b.observado - a.observado; });

    // Zonas: combinaciones ciudad + categoría con al menos 3 posts en la ventana.
    var combos = {};
    enVentana.forEach(function (p) {
      if (p.ciudad === sinUbic) return;
      var k = p.ciudad + "|" + p.categoria;
      combos[k] = (combos[k] || 0) + 1;
    });
    var zonas = Object.keys(combos).filter(function (k) { return combos[k] >= 3; }).map(function (k) {
      var partes = k.split("|");
      var cat = opciones.categorias.filter(function (c) { return c.id === partes[1]; })[0];
      var historia = posts.filter(function (p) { return p.ciudad === partes[0] && p.categoria === partes[1]; });
      var base = lineaBase(historia, ini, fin, inicioDatos);
      var r = nivelDe(combos[k], base);
      return { ciudad: partes[0], categoria: cat, observado: combos[k], base: base, z: r.z, nivel: r.nivel };
    }).filter(function (z) { return z.nivel.orden >= 1 || (z.nivel.id === "sinbase" && z.observado >= 4); })
      .sort(function (a, b) { return b.nivel.orden - a.nivel.orden || (b.z || 0) - (a.z || 0) || b.observado - a.observado; });

    return { desde: new Date(ini), hasta: new Date(fin), horas: opciones.horas, categorias: categorias, zonas: zonas };
  }

  var api = { NIVELES: NIVELES, GRAVEDAD: GRAVEDAD, calcular: calcular, lineaBase: lineaBase, nivelDe: nivelDe, aceleracion: aceleracion };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else raiz.ER_ALERTAS = api;
})(typeof window !== "undefined" ? window : this);

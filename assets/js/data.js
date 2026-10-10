/*
 * Emergency Radar · capa de datos
 * ------------------------------------------------------------------
 * Todo el resto de la aplicación consume únicamente window.ER_DATA.
 *
 * Los datos son publicaciones reales de X que el recolector
 * (collector/x-collector.mjs, ejecutado por GitHub Actions) guarda en
 * data/posts.json. La app lee ese archivo al iniciar y lo vuelve a leer
 * cada minuto mientras el modo "En vivo" está activo. La API key de X
 * nunca llega al navegador.
 *
 * Publicacion {
 *   id:        string
 *   autor:     { nombre, usuario, verificado: boolean, color }
 *   texto:     string
 *   fecha:     Date
 *   categoria: string            // id de CATEGORIAS
 *   ciudad:    string            // "Sin ubicación" si no se pudo ubicar
 *   lat, lng:  number | null     // null si la publicación no está geolocalizada
 *   url:       string | null     // enlace a la publicación en X
 *   emergencia: boolean | null   // etiqueta del modelo LSI + kNN (null si aún no se clasificó)
 *   prob:       number | null    // peso de los vecinos que son emergencia (0 a 1)
 *   vecinos:    number | null    // cuántos de los k vecinos más parecidos son emergencias
 * }
 */
(function () {
  "use strict";

  var CATEGORIAS = window.ER_CATALOGO.CATEGORIAS;
  var CIUDADES = window.ER_CATALOGO.CIUDADES;
  var COLORES_AVATAR = ["#2e3192", "#2f7be5", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#334155", "#15803d"];
  var URL_DATOS = "data/posts.json";
  var INTERVALO_MS = 60 * 1000;
  var SIN_UBICACION = "Sin ubicación";

  var publicaciones = [];
  // "cargando" | "ok" (hay datos) | "vacio" (archivo sin publicaciones) | "error" (no se pudo leer)
  var estado = "cargando";
  var actualizado = null;
  var modelo = null;

  function quitarTildes(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  function colorAutor(usuario) {
    var h = 0;
    for (var i = 0; i < usuario.length; i++) h = (h * 31 + usuario.charCodeAt(i)) | 0;
    return COLORES_AVATAR[Math.abs(h) % COLORES_AVATAR.length];
  }

  // Convierte una publicación del JSON del recolector al modelo de la app.
  function desdeJSON(p) {
    var autor = p.autor || {};
    return {
      id: String(p.id),
      autor: {
        nombre: autor.nombre || autor.usuario || "Usuario de X",
        usuario: autor.usuario || "",
        verificado: !!autor.verificado,
        color: colorAutor(autor.usuario || String(p.id))
      },
      texto: p.texto || "",
      fecha: new Date(p.fecha),
      categoria: p.categoria,
      ciudad: p.ciudad || SIN_UBICACION,
      lat: typeof p.lat === "number" ? p.lat : null,
      lng: typeof p.lng === "number" ? p.lng : null,
      url: /^https:\/\//.test(p.url || "") ? p.url : null,
      emergencia: typeof p.emergencia === "boolean" ? p.emergencia : null,
      prob: typeof p.prob_emergencia === "number" ? p.prob_emergencia : null,
      vecinos: typeof p.vecinos_emergencia === "number" ? p.vecinos_emergencia : null
    };
  }

  function validas(lista) {
    var ids = {};
    CATEGORIAS.forEach(function (c) { ids[c.id] = true; });
    return lista.filter(function (p) { return ids[p.categoria] && !isNaN(p.fecha); });
  }

  function leerJSON() {
    if (!window.fetch || location.protocol === "file:") return Promise.reject(new Error("abre el sitio desde un servidor web"));
    return fetch(URL_DATOS + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (json) {
      return {
        generado: json.generado ? new Date(json.generado) : null,
        modelo: json.modelo || null,
        lista: validas((json.publicaciones || []).map(desdeJSON))
      };
    });
  }

  function ordenar() { publicaciones.sort(function (a, b) { return b.fecha - a.fecha; }); }

  function filtrar(opts) {
    opts = opts || {};
    return publicaciones.filter(function (p) {
      if (opts.desde && p.fecha < opts.desde) return false;
      if (opts.hasta && p.fecha > opts.hasta) return false;
      if (opts.categorias && opts.categorias.indexOf(p.categoria) < 0) return false;
      if (opts.ciudad && p.ciudad !== opts.ciudad) return false;
      if (opts.soloGeo && p.lat === null) return false;
      // Clasificación del modelo: "emergencias" (por defecto), "descartadas" o "todas".
      // Lo que aún no se clasificó cuenta como emergencia para no ocultarlo.
      var clase = opts.clasificacion || "emergencias";
      if (clase === "emergencias" && p.emergencia === false) return false;
      if (clase === "descartadas" && p.emergencia !== false) return false;
      if (opts.texto) {
        var q = quitarTildes(opts.texto.toLowerCase());
        var hay = quitarTildes((p.texto + " " + p.autor.nombre + " " + p.autor.usuario + " " + p.ciudad).toLowerCase());
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  window.ER_DATA = {
    CATEGORIAS: CATEGORIAS,
    CIUDADES: CIUDADES,
    SIN_UBICACION: SIN_UBICACION,
    INTERVALO_MS: INTERVALO_MS,
    categoria: function (id) {
      for (var i = 0; i < CATEGORIAS.length; i++) if (CATEGORIAS[i].id === id) return CATEGORIAS[i];
      return null;
    },
    estado: function () { return estado; },
    // Configuración y métricas del modelo de clasificación (bloque "modelo" del JSON).
    modelo: function () { return modelo; },
    actualizado: function () { return actualizado; },
    // Carga inicial. Siempre se resuelve; el resultado queda en estado().
    cargar: function () {
      return leerJSON().then(function (res) {
        publicaciones = res.lista;
        actualizado = res.generado;
        modelo = res.modelo;
        estado = publicaciones.length ? "ok" : "vacio";
        ordenar();
      }).catch(function (e) {
        estado = "error";
        if (window.console) console.warn("No se pudo leer " + URL_DATOS + ": " + e.message);
      });
    },
    // Vuelve a leer el JSON y devuelve solo las publicaciones nuevas, de la más antigua a la más reciente.
    sincronizar: function () {
      return leerJSON().then(function (res) {
        var vistos = {};
        publicaciones.forEach(function (p) { vistos[p.id] = true; });
        var nuevas = res.lista.filter(function (p) { return !vistos[p.id]; });
        if (res.generado) actualizado = res.generado;
        if (res.modelo) modelo = res.modelo;
        // Las etiquetas del modelo pueden llegar después que la publicación.
        var porId = {}, reetiquetadas = 0;
        res.lista.forEach(function (p) { porId[p.id] = p; });
        publicaciones.forEach(function (p) {
          var r = porId[p.id];
          if (r && r.emergencia !== null && r.emergencia !== p.emergencia) {
            p.emergencia = r.emergencia; p.prob = r.prob; p.vecinos = r.vecinos;
            reetiquetadas++;
          }
        });
        if (nuevas.length) { publicaciones = publicaciones.concat(nuevas); ordenar(); }
        if (publicaciones.length) estado = "ok";
        nuevas.sort(function (a, b) { return a.fecha - b.fecha; });
        nuevas.reetiquetadas = reetiquetadas;
        return nuevas;
      }).catch(function () { return []; });
    },
    todas: function () { return publicaciones; },
    filtrar: filtrar,
    // Ciudades que aparecen en los datos, de la más reportada a la menos; "Sin ubicación" al final.
    ciudadesPresentes: function (posts) {
      var m = {};
      (posts || publicaciones).forEach(function (p) { m[p.ciudad] = (m[p.ciudad] || 0) + 1; });
      return Object.keys(m).map(function (k) { return { nombre: k, total: m[k] }; }).sort(function (a, b) {
        if (a.nombre === SIN_UBICACION) return 1;
        if (b.nombre === SIN_UBICACION) return -1;
        return b.total - a.total || a.nombre.localeCompare(b.nombre, "es");
      });
    },
    rangoDisponible: function () {
      if (!publicaciones.length) return { desde: new Date(), hasta: new Date() };
      return { desde: publicaciones[publicaciones.length - 1].fecha, hasta: publicaciones[0].fecha };
    }
  };
})();

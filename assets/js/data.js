/*
 * Emergency Radar · capa de datos (prototipo)
 * ------------------------------------------------------------------
 * Todo el resto de la aplicación consume únicamente window.ER_DATA.
 *
 * Al iniciar se intenta leer data/posts.json, que genera el recolector de X
 * (collector/x-collector.mjs, ejecutado por GitHub Actions). Si el archivo
 * existe y trae publicaciones, la app trabaja con datos reales y lo vuelve a
 * leer cada minuto en modo "En Vivo". Si no, usa datos simulados y
 * deterministas (semilla fija). La API key de X nunca llega al navegador.
 *
 * Publicacion {
 *   id:        string
 *   fuente:    "twitter" | "facebook"
 *   autor:     { nombre, usuario, verificado: boolean, color }
 *   texto:     string
 *   fecha:     Date
 *   cliente:   string            // p. ej. "Twitter for Android"
 *   categoria: string            // id de CATEGORIAS
 *   ciudad:    string            // nombre de CIUDADES
 *   lat, lng:  number | null     // null si la publicación no está geolocalizada
 *   url:       string            // opcional, enlace a la publicación original
 * }
 */
(function () {
  "use strict";

  var CATEGORIAS = window.ER_CATALOGO.CATEGORIAS;
  var CIUDADES = window.ER_CATALOGO.CIUDADES;

  // Autores ficticios (no corresponden a personas ni medios reales).
  var AUTORES = [
    { nombre: "Andrea Molina", usuario: "andremolina_ec", verificado: false },
    { nombre: "Carlos Vera", usuario: "cvera_gye", verificado: false },
    { nombre: "Radio Litoral 98", usuario: "radiolitoral98", verificado: true },
    { nombre: "Noticias del Puerto", usuario: "noticiaspuerto", verificado: true },
    { nombre: "María José Cedeño", usuario: "majo_cedeno", verificado: false },
    { nombre: "Alerta Ciudadana EC", usuario: "alertaciudadanaec", verificado: true },
    { nombre: "Luis Zambrano", usuario: "luiszambrano_", verificado: false },
    { nombre: "Paola Intriago", usuario: "paointriago", verificado: false },
    { nombre: "Tránsito al Día", usuario: "transitoaldia_ec", verificado: true },
    { nombre: "Diego Alvarado", usuario: "dalvarado90", verificado: false },
    { nombre: "Gabriela Ponce", usuario: "gaby_ponce", verificado: false },
    { nombre: "Manabí Informa", usuario: "manabiinforma", verificado: true },
    { nombre: "Jorge Mendoza", usuario: "jmendoza_uio", verificado: false },
    { nombre: "Vecinos Unidos Norte", usuario: "vecinosnorte", verificado: false },
    { nombre: "Fernanda Loor", usuario: "ferloor", verificado: false },
    { nombre: "Clima Costa", usuario: "climacosta", verificado: true }
  ];
  var COLORES_AVATAR = ["#2e3192", "#2f7be5", "#0f766e", "#b45309", "#7c3aed", "#be185d", "#334155", "#15803d"];

  var LUGARES = {
    "Guayaquil": ["la vía Daule", "la Av. 9 de Octubre", "la Perimetral", "Urdesa", "la Alborada", "el Guasmo", "Sauces", "la Av. de las Américas", "el puente de la Unidad Nacional", "Mapasingue"],
    "Quito": ["la Av. Simón Bolívar", "la Mariscal", "Carcelén", "la Av. Occidental", "el Centro Histórico"],
    "Portoviejo": ["la Av. Manabí", "el parque Las Vegas", "la vía a Crucita"],
    "Manta": ["la Av. Flavio Reyes", "el malecón", "Tarqui"],
    "_": ["el centro", "la vía principal", "el mercado", "la entrada de la ciudad", "el parque central"]
  };

  var PLANTILLAS = {
    asaltos: [
      "Acaban de asaltar a una señora en {lugar}, se llevaron su celular. Tengan cuidado #{ciudadTag}",
      "Robo a mano armada en un local de {lugar}. Dos sujetos en moto. #Inseguridad",
      "Ojo vecinos, otra vez asaltos en {lugar}. Ya van tres esta semana #{ciudadTag}",
      "Reportan asalto a un bus en {lugar}, los pasajeros fueron despojados de sus pertenencias",
      "Me robaron en {lugar} hace un momento. ¿Dónde está la policía? #Seguridad",
      "Seis bandas delictivas fueron desarticuladas en operativos en {ciudad} #Seguridad"
    ],
    incendios: [
      "Se reporta un incendio en una vivienda de {lugar}. Bomberos en camino #{ciudadTag}",
      "Columna de humo visible desde {lugar}, al parecer se quema una bodega",
      "Incendio forestal cerca de {lugar}, se pide evitar la zona #Incendio",
      "Conato de incendio en un local comercial de {lugar}. Ya fue controlado",
      "Fuego en un lote baldío en {lugar}, el humo llega a las casas cercanas"
    ],
    accidentes: [
      "Llevo dos horas atrapado en el tráfico en {lugar}. Hubo un accidente de tránsito fatal!!",
      "Choque entre un bus y un auto en {lugar}, hay heridos. Eviten la zona #Tránsito",
      "Volcamiento de un camión en {lugar}, tráfico detenido en ambos sentidos",
      "Accidente en {lugar}: motociclista impactado por un vehículo liviano #{ciudadTag}",
      "Precaución en {lugar}, colisión múltiple. Agentes de tránsito en el sitio"
    ],
    desastres: [
      "Fuerte lluvia provoca inundaciones en {lugar}. Varias casas afectadas #{ciudadTag}",
      "Se sintió un temblor en {ciudad} hace unos minutos. ¿Lo sintieron? #Sismo",
      "Deslave en {lugar} bloquea el paso vehicular #Emergencia",
      "Desbordamiento del río cerca de {lugar}, familias evacuadas",
      "Aguaje afecta a viviendas cercanas a {lugar}. Se recomienda precaución"
    ]
  };

  var CLIENTES_TW = ["Twitter for Android", "Twitter for Android", "Twitter for iPhone", "Twitter Web App"];

  // Distribución horaria (24 h) de la actividad y peso de cada categoría.
  var PERFIL_HORA = [0.25, 0.18, 0.12, 0.1, 0.12, 0.25, 0.45, 0.7, 0.85, 0.9, 1.0, 1.15, 0.85, 0.8, 0.7, 0.85, 0.95, 1.1, 1.35, 1.2, 1.0, 0.9, 0.75, 0.95];
  var PESO_CATEGORIA = { asaltos: 0.45, incendios: 0.12, accidentes: 0.3, desastres: 0.13 };

  // Generador pseudoaleatorio con semilla (mulberry32), para datos reproducibles.
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = rng(20220519);
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  function pickWeighted(items, pesoFn) {
    var total = 0, i;
    for (i = 0; i < items.length; i++) total += pesoFn(items[i]);
    var r = rand() * total;
    for (i = 0; i < items.length; i++) { r -= pesoFn(items[i]); if (r <= 0) return items[i]; }
    return items[items.length - 1];
  }
  function quitarTildes(s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, ""); }

  var contador = 0;
  function crearPublicacion(fecha) {
    var cat = pickWeighted(CATEGORIAS, function (c) { return PESO_CATEGORIA[c.id]; });
    var ciudad = pickWeighted(CIUDADES, function (c) { return c.peso; });
    var lugar = pick(LUGARES[ciudad.nombre] || LUGARES._);
    var texto = pick(PLANTILLAS[cat.id])
      .replace("{lugar}", lugar)
      .replace("{ciudad}", ciudad.nombre)
      .replace("{ciudadTag}", quitarTildes(ciudad.nombre).replace(/\s+/g, ""));
    var autorIdx = Math.floor(rand() * AUTORES.length);
    var autor = AUTORES[autorIdx];
    var fuente = rand() < 0.78 ? "twitter" : "facebook";
    var geo = rand() < 0.72;
    // Dispersión gaussiana aproximada alrededor del centro de la ciudad.
    var dx = (rand() + rand() + rand() - 1.5) * ciudad.radio;
    var dy = (rand() + rand() + rand() - 1.5) * ciudad.radio;
    contador++;
    return {
      id: "p" + contador,
      fuente: fuente,
      autor: {
        nombre: autor.nombre,
        usuario: autor.usuario,
        verificado: autor.verificado,
        color: COLORES_AVATAR[autorIdx % COLORES_AVATAR.length]
      },
      texto: texto,
      fecha: fecha,
      cliente: fuente === "twitter" ? pick(CLIENTES_TW) : "Facebook",
      categoria: cat.id,
      ciudad: ciudad.nombre,
      lat: geo ? ciudad.lat + dy : null,
      lng: geo ? ciudad.lng + dx : null
    };
  }

  // Genera publicaciones para los últimos `dias` días hasta `hasta`.
  function generarPublicaciones(hasta, dias) {
    var lista = [];
    var inicio = new Date(hasta);
    inicio.setHours(0, 0, 0, 0);
    inicio.setDate(inicio.getDate() - dias);
    for (var d = 0; d <= dias; d++) {
      var dia = new Date(inicio);
      dia.setDate(inicio.getDate() + d);
      // Tendencia suave + ruido diario + fines de semana un poco más activos.
      var base = 70 + 18 * Math.sin(d / 9) + (dia.getDay() % 6 === 0 ? 12 : 0) + rand() * 20;
      for (var h = 0; h < 24; h++) {
        var n = Math.round(base * PERFIL_HORA[h] / 17 * (0.7 + rand() * 0.6));
        for (var k = 0; k < n; k++) {
          var f = new Date(dia);
          f.setHours(h, Math.floor(rand() * 60), Math.floor(rand() * 60), 0);
          if (f > hasta) continue;
          lista.push(crearPublicacion(f));
        }
      }
    }
    lista.sort(function (a, b) { return b.fecha - a.fecha; });
    return lista;
  }

  var publicaciones = [];
  var modo = "simulado";
  var actualizado = null;
  var URL_DATOS = "data/posts.json";
  var INTERVALO_REAL_MS = 60 * 1000;

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
      fuente: p.fuente || "twitter",
      autor: {
        nombre: autor.nombre || autor.usuario || "Usuario",
        usuario: autor.usuario || "",
        verificado: !!autor.verificado,
        color: autor.color || colorAutor(autor.usuario || String(p.id))
      },
      texto: p.texto || "",
      fecha: new Date(p.fecha),
      cliente: p.cliente || "X",
      categoria: p.categoria,
      ciudad: p.ciudad || "Sin ubicación",
      lat: typeof p.lat === "number" ? p.lat : null,
      lng: typeof p.lng === "number" ? p.lng : null,
      url: /^https:\/\//.test(p.url || "") ? p.url : null
    };
  }

  function validas(lista) {
    var ids = {};
    CATEGORIAS.forEach(function (c) { ids[c.id] = true; });
    return lista.filter(function (p) { return ids[p.categoria] && !isNaN(p.fecha); });
  }

  function leerJSON() {
    if (!window.fetch || location.protocol === "file:") return Promise.reject(new Error("sin fetch"));
    return fetch(URL_DATOS + "?t=" + Date.now(), { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (json) {
      return {
        generado: json.generado ? new Date(json.generado) : null,
        lista: validas((json.publicaciones || []).map(desdeJSON))
      };
    });
  }

  function usarSimulados() {
    modo = "simulado";
    actualizado = new Date();
    publicaciones = generarPublicaciones(new Date(), 120);
  }

  function ordenar() { publicaciones.sort(function (a, b) { return b.fecha - a.fecha; }); }

  function filtrar(opts) {
    opts = opts || {};
    return publicaciones.filter(function (p) {
      if (opts.desde && p.fecha < opts.desde) return false;
      if (opts.hasta && p.fecha > opts.hasta) return false;
      if (opts.categorias && opts.categorias.length && opts.categorias.indexOf(p.categoria) < 0) return false;
      if (opts.fuentes && opts.fuentes.length && opts.fuentes.indexOf(p.fuente) < 0) return false;
      if (opts.ciudad && p.ciudad !== opts.ciudad) return false;
      if (opts.soloGeo && p.lat === null) return false;
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
    INTERVALO_REAL_MS: INTERVALO_REAL_MS,
    categoria: function (id) {
      for (var i = 0; i < CATEGORIAS.length; i++) if (CATEGORIAS[i].id === id) return CATEGORIAS[i];
      return null;
    },
    // "real" si los datos vienen del recolector de X, "simulado" si no.
    modo: function () { return modo; },
    actualizado: function () { return actualizado; },
    // Carga inicial. Siempre se resuelve: ante cualquier fallo se usan datos simulados.
    cargar: function () {
      return leerJSON().then(function (res) {
        if (!res.lista.length) { usarSimulados(); return; }
        modo = "real";
        actualizado = res.generado || new Date();
        publicaciones = res.lista;
        ordenar();
      }).catch(usarSimulados);
    },
    // Modo real: vuelve a leer el JSON y devuelve solo las publicaciones nuevas.
    sincronizar: function () {
      return leerJSON().then(function (res) {
        var vistos = {};
        publicaciones.forEach(function (p) { vistos[p.id] = true; });
        var nuevas = res.lista.filter(function (p) { return !vistos[p.id]; });
        if (res.generado) actualizado = res.generado;
        if (nuevas.length) { publicaciones = publicaciones.concat(nuevas); ordenar(); }
        nuevas.sort(function (a, b) { return a.fecha - b.fecha; });
        return nuevas;
      }).catch(function () { return []; });
    },
    todas: function () { return publicaciones; },
    filtrar: filtrar,
    // Modo simulado: genera la llegada de una publicación nueva.
    nuevaPublicacion: function () {
      var p = crearPublicacion(new Date());
      publicaciones.unshift(p);
      return p;
    },
    rangoDisponible: function () {
      if (!publicaciones.length) return { desde: new Date(), hasta: new Date() };
      return { desde: publicaciones[publicaciones.length - 1].fecha, hasta: publicaciones[0].fecha };
    }
  };
})();

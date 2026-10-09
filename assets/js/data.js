/*
 * Emergency Radar · capa de datos (prototipo)
 * ------------------------------------------------------------------
 * Todo el resto de la aplicación consume únicamente window.ER_DATA.
 * Hoy los datos se generan de forma simulada y determinista (semilla fija).
 * Para conectar datos reales basta con reemplazar `generarPublicaciones()`
 * por una carga (fetch a JSON o a una API) que devuelva objetos con el
 * mismo esquema de "Publicacion" descrito abajo.
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
 * }
 */
(function () {
  "use strict";

  var CATEGORIAS = [
    { id: "asaltos", nombre: "Asaltos", icono: "run", color: "#2a78d6" },
    { id: "incendios", nombre: "Incendios", icono: "flame", color: "#eb6834" },
    { id: "accidentes", nombre: "Accidente vehicular", icono: "car-crash", color: "#1baf7a" },
    { id: "desastres", nombre: "Desastres naturales", icono: "tornado", color: "#eda100" }
  ];

  // Ciudades con su peso relativo de publicaciones.
  var CIUDADES = [
    { nombre: "Guayaquil", provincia: "Guayas", lat: -2.170, lng: -79.922, peso: 30, radio: 0.06 },
    { nombre: "Durán", provincia: "Guayas", lat: -2.172, lng: -79.838, peso: 6, radio: 0.025 },
    { nombre: "Samborondón", provincia: "Guayas", lat: -2.135, lng: -79.870, peso: 4, radio: 0.02 },
    { nombre: "Daule", provincia: "Guayas", lat: -1.862, lng: -79.977, peso: 5, radio: 0.03 },
    { nombre: "Milagro", provincia: "Guayas", lat: -2.134, lng: -79.594, peso: 5, radio: 0.03 },
    { nombre: "Playas", provincia: "Guayas", lat: -2.632, lng: -80.388, peso: 2, radio: 0.02 },
    { nombre: "Santa Elena", provincia: "Santa Elena", lat: -2.226, lng: -80.858, peso: 4, radio: 0.03 },
    { nombre: "La Libertad", provincia: "Santa Elena", lat: -2.231, lng: -80.900, peso: 3, radio: 0.02 },
    { nombre: "Salinas", provincia: "Santa Elena", lat: -2.214, lng: -80.958, peso: 2, radio: 0.02 },
    { nombre: "Babahoyo", provincia: "Los Ríos", lat: -1.801, lng: -79.534, peso: 4, radio: 0.03 },
    { nombre: "Vinces", provincia: "Los Ríos", lat: -1.556, lng: -79.752, peso: 2, radio: 0.02 },
    { nombre: "Quevedo", provincia: "Los Ríos", lat: -1.022, lng: -79.463, peso: 3, radio: 0.03 },
    { nombre: "Portoviejo", provincia: "Manabí", lat: -1.054, lng: -80.454, peso: 6, radio: 0.04 },
    { nombre: "Manta", provincia: "Manabí", lat: -0.957, lng: -80.712, peso: 6, radio: 0.04 },
    { nombre: "Jipijapa", provincia: "Manabí", lat: -1.348, lng: -80.579, peso: 2, radio: 0.02 },
    { nombre: "Chone", provincia: "Manabí", lat: -0.698, lng: -80.094, peso: 2, radio: 0.02 },
    { nombre: "Machala", provincia: "El Oro", lat: -3.258, lng: -79.955, peso: 4, radio: 0.03 },
    { nombre: "Riobamba", provincia: "Chimborazo", lat: -1.664, lng: -78.654, peso: 3, radio: 0.03 },
    { nombre: "Cuenca", provincia: "Azuay", lat: -2.900, lng: -79.005, peso: 4, radio: 0.04 },
    { nombre: "Quito", provincia: "Pichincha", lat: -0.180, lng: -78.468, peso: 9, radio: 0.06 }
  ];

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

  var ahora = new Date();
  var publicaciones = generarPublicaciones(ahora, 120);

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
    categoria: function (id) {
      for (var i = 0; i < CATEGORIAS.length; i++) if (CATEGORIAS[i].id === id) return CATEGORIAS[i];
      return null;
    },
    todas: function () { return publicaciones; },
    filtrar: filtrar,
    // Simula la llegada de una publicación nueva (modo "En Vivo").
    nuevaPublicacion: function () {
      var p = crearPublicacion(new Date());
      publicaciones.unshift(p);
      return p;
    },
    rangoDisponible: function () {
      return { desde: publicaciones[publicaciones.length - 1].fecha, hasta: publicaciones[0].fecha };
    }
  };
})();

/*
 * Emergency Radar · catálogo compartido
 * Categorías (con sus palabras clave) y ciudades. Lo usan el navegador
 * (window.ER_CATALOGO) y el recolector de X en Node (require/import).
 */
(function (raiz) {
  "use strict";

  // Colores de identidad de cada categoría (validados para daltonismo y contraste).
  // No usan rojo, amarillo ni verde: esos colores quedan para la gravedad.
  var CATEGORIAS = [
    {
      id: "asaltos", nombre: "Asaltos", icono: "run", color: "#2a78d6",
      descripcion: "Robos, atracos, asaltos, extorsiones, secuestros y sicariato.",
      claves: ["asalt", "rob(o|aron|ando|an)\\b", "atraco", "delincuen", "extorsi", "secuestr", "sicari", "banda(s)? delictiva", "arranch"]
    },
    {
      id: "incendios", nombre: "Incendios", icono: "flame", color: "#c2569b",
      descripcion: "Incendios en viviendas, locales, vehículos o zonas forestales, conatos y salidas de bomberos.",
      claves: ["incendi", "se quema", "en llamas", "fuego", "humareda", "conato", "bomberos"]
    },
    {
      id: "accidentes", nombre: "Accidente vehicular", icono: "car-crash", color: "#6250d6",
      descripcion: "Choques, colisiones, volcamientos, atropellos y otros siniestros de tránsito.",
      claves: ["accidente", "choque", "chocaron", "colisi", "volcamiento", "se volc", "atropell", "siniestro de transito", "motociclista"]
    },
    {
      id: "desastres", nombre: "Desastres naturales", icono: "tornado", color: "#0e9fb3",
      descripcion: "Sismos, temblores y terremotos, inundaciones, deslaves y derrumbes, desbordes de ríos, aguajes, lluvias fuertes y erupciones.",
      claves: ["inundaci", "se inund", "desliz", "deslave", "sismo", "temblor", "terremoto", "aguaje", "desbord", "lluvias? fuerte", "fuertes lluvias", "erupci", "derrumbe"]
    }
  ];

  // `alias` sirve para reconocer la ciudad cuando se menciona en el texto.
  // `ambiguo`: el nombre también es una palabra común ("un milagro", "una manta",
  // "le quitó", "la cuenca del río"); solo cuenta escrito con mayúscula inicial y
  // sin tildes de más.
  var CIUDADES = [
    { nombre: "Guayaquil", provincia: "Guayas", lat: -2.170, lng: -79.922, peso: 30, radio: 0.06, alias: ["guayaquil", "gye", "guayaco"] },
    { nombre: "Durán", provincia: "Guayas", lat: -2.172, lng: -79.838, peso: 6, radio: 0.025, alias: ["duran"] },
    { nombre: "Samborondón", provincia: "Guayas", lat: -2.135, lng: -79.870, peso: 4, radio: 0.02, alias: ["samborondon"] },
    { nombre: "Daule", provincia: "Guayas", lat: -1.862, lng: -79.977, peso: 5, radio: 0.03, alias: ["daule"] },
    { nombre: "Milagro", provincia: "Guayas", lat: -2.134, lng: -79.594, peso: 5, radio: 0.03, ambiguo: true, alias: ["milagro"] },
    { nombre: "Playas", provincia: "Guayas", lat: -2.632, lng: -80.388, peso: 2, radio: 0.02, alias: ["general villamil"] },
    { nombre: "Santa Elena", provincia: "Santa Elena", lat: -2.226, lng: -80.858, peso: 4, radio: 0.03, alias: ["santa elena"] },
    { nombre: "La Libertad", provincia: "Santa Elena", lat: -2.231, lng: -80.900, peso: 3, radio: 0.02, ambiguo: true, alias: ["la libertad"] },
    { nombre: "Salinas", provincia: "Santa Elena", lat: -2.214, lng: -80.958, peso: 2, radio: 0.02, ambiguo: true, alias: ["salinas"] },
    { nombre: "Babahoyo", provincia: "Los Ríos", lat: -1.801, lng: -79.534, peso: 4, radio: 0.03, alias: ["babahoyo"] },
    { nombre: "Vinces", provincia: "Los Ríos", lat: -1.556, lng: -79.752, peso: 2, radio: 0.02, alias: ["vinces"] },
    { nombre: "Quevedo", provincia: "Los Ríos", lat: -1.022, lng: -79.463, peso: 3, radio: 0.03, alias: ["quevedo"] },
    { nombre: "Portoviejo", provincia: "Manabí", lat: -1.054, lng: -80.454, peso: 6, radio: 0.04, alias: ["portoviejo"] },
    { nombre: "Manta", provincia: "Manabí", lat: -0.957, lng: -80.712, peso: 6, radio: 0.04, ambiguo: true, alias: ["manta"] },
    { nombre: "Jipijapa", provincia: "Manabí", lat: -1.348, lng: -80.579, peso: 2, radio: 0.02, alias: ["jipijapa"] },
    { nombre: "Chone", provincia: "Manabí", lat: -0.698, lng: -80.094, peso: 2, radio: 0.02, alias: ["chone"] },
    { nombre: "Machala", provincia: "El Oro", lat: -3.258, lng: -79.955, peso: 4, radio: 0.03, alias: ["machala"] },
    { nombre: "Riobamba", provincia: "Chimborazo", lat: -1.664, lng: -78.654, peso: 3, radio: 0.03, alias: ["riobamba"] },
    { nombre: "Cuenca", provincia: "Azuay", lat: -2.900, lng: -79.005, peso: 4, radio: 0.04, ambiguo: true, alias: ["cuenca"] },
    { nombre: "Quito", provincia: "Pichincha", lat: -0.180, lng: -78.468, peso: 9, radio: 0.06, ambiguo: true, alias: ["quito", "uio"] },
    // Cantones de Manabí, Pichincha, Guayas y Azuay (cabeceras cantonales).
    // `contexto`: nombre que también existe en otros países o es muy común; solo cuenta si el
    // post menciona además su provincia o Ecuador.
    { nombre: "Montecristi", provincia: "Manabí", lat: -1.045, lng: -80.658, peso: 2, radio: 0.02, alias: ["montecristi"] },
    { nombre: "Jaramijó", provincia: "Manabí", lat: -0.946, lng: -80.637, peso: 1, radio: 0.015, alias: ["jaramijo"] },
    { nombre: "Rocafuerte", provincia: "Manabí", lat: -0.922, lng: -80.448, peso: 1, radio: 0.015, ambiguo: true, alias: ["rocafuerte"] },
    { nombre: "Tosagua", provincia: "Manabí", lat: -0.787, lng: -80.235, peso: 1, radio: 0.015, alias: ["tosagua"] },
    { nombre: "Bahía de Caráquez", provincia: "Manabí", lat: -0.598, lng: -80.424, peso: 2, radio: 0.015, alias: ["bahia de caraquez"] },
    { nombre: "San Vicente", provincia: "Manabí", lat: -0.597, lng: -80.403, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["san vicente"] },
    { nombre: "Junín", provincia: "Manabí", lat: -0.928, lng: -80.207, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["junin"] },
    { nombre: "Calceta", provincia: "Manabí", lat: -0.845, lng: -80.165, peso: 1, radio: 0.015, alias: ["calceta"] },
    { nombre: "Santa Ana", provincia: "Manabí", lat: -1.205, lng: -80.373, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["santa ana"] },
    { nombre: "Olmedo", provincia: "Manabí", lat: -1.398, lng: -80.211, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["olmedo"] },
    { nombre: "Paján", provincia: "Manabí", lat: -1.555, lng: -80.425, peso: 1, radio: 0.015, alias: ["pajan"] },
    { nombre: "Puerto López", provincia: "Manabí", lat: -1.559, lng: -80.811, peso: 1, radio: 0.015, alias: ["puerto lopez"] },
    { nombre: "Jama", provincia: "Manabí", lat: -0.200, lng: -80.267, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["jama"] },
    { nombre: "Pedernales", provincia: "Manabí", lat: 0.071, lng: -80.054, peso: 2, radio: 0.015, alias: ["pedernales"] },
    { nombre: "Flavio Alfaro", provincia: "Manabí", lat: -0.402, lng: -79.904, peso: 1, radio: 0.015, alias: ["flavio alfaro"] },
    { nombre: "El Carmen", provincia: "Manabí", lat: -0.267, lng: -79.456, peso: 2, radio: 0.02, ambiguo: true, contexto: true, alias: ["el carmen"] },
    { nombre: "Machachi", provincia: "Pichincha", lat: -0.510, lng: -78.567, peso: 1, radio: 0.015, alias: ["machachi", "canton mejia"] },
    { nombre: "Cayambe", provincia: "Pichincha", lat: 0.041, lng: -78.146, peso: 2, radio: 0.02, alias: ["cayambe"] },
    { nombre: "Tabacundo", provincia: "Pichincha", lat: 0.048, lng: -78.219, peso: 1, radio: 0.015, alias: ["tabacundo", "pedro moncayo"] },
    { nombre: "Sangolquí", provincia: "Pichincha", lat: -0.334, lng: -78.452, peso: 2, radio: 0.02, alias: ["sangolqui", "rumiñahui", "ruminahui"] },
    { nombre: "San Miguel de los Bancos", provincia: "Pichincha", lat: 0.022, lng: -78.894, peso: 1, radio: 0.015, alias: ["san miguel de los bancos"] },
    { nombre: "Pedro Vicente Maldonado", provincia: "Pichincha", lat: 0.087, lng: -79.051, peso: 1, radio: 0.015, alias: ["pedro vicente maldonado"] },
    { nombre: "Puerto Quito", provincia: "Pichincha", lat: 0.124, lng: -79.253, peso: 1, radio: 0.015, alias: ["puerto quito"] },
    { nombre: "Jujan", provincia: "Guayas", lat: -1.889, lng: -79.495, peso: 1, radio: 0.015, alias: ["jujan", "alfredo baquerizo moreno"] },
    { nombre: "Balao", provincia: "Guayas", lat: -2.906, lng: -79.813, peso: 1, radio: 0.015, alias: ["balao"] },
    { nombre: "Balzar", provincia: "Guayas", lat: -1.364, lng: -79.906, peso: 1, radio: 0.015, alias: ["balzar"] },
    { nombre: "Colimes", provincia: "Guayas", lat: -1.546, lng: -80.012, peso: 1, radio: 0.015, alias: ["colimes"] },
    { nombre: "El Empalme", provincia: "Guayas", lat: -1.044, lng: -79.636, peso: 1, radio: 0.015, alias: ["el empalme", "velasco ibarra"] },
    { nombre: "El Triunfo", provincia: "Guayas", lat: -2.330, lng: -79.390, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["el triunfo"] },
    { nombre: "Isidro Ayora", provincia: "Guayas", lat: -1.879, lng: -80.141, peso: 1, radio: 0.015, alias: ["isidro ayora"] },
    { nombre: "Lomas de Sargentillo", provincia: "Guayas", lat: -1.883, lng: -80.084, peso: 1, radio: 0.015, alias: ["lomas de sargentillo"] },
    { nombre: "Marcelino Maridueña", provincia: "Guayas", lat: -2.200, lng: -79.414, peso: 1, radio: 0.015, alias: ["marcelino mariduena"] },
    { nombre: "Naranjal", provincia: "Guayas", lat: -2.674, lng: -79.617, peso: 1, radio: 0.015, alias: ["naranjal"] },
    { nombre: "Naranjito", provincia: "Guayas", lat: -2.214, lng: -79.466, peso: 1, radio: 0.015, alias: ["naranjito"] },
    { nombre: "Nobol", provincia: "Guayas", lat: -1.912, lng: -80.006, peso: 1, radio: 0.015, alias: ["nobol"] },
    { nombre: "Palestina", provincia: "Guayas", lat: -1.630, lng: -79.985, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["palestina"] },
    { nombre: "Pedro Carbo", provincia: "Guayas", lat: -1.822, lng: -80.233, peso: 1, radio: 0.015, alias: ["pedro carbo"] },
    { nombre: "Salitre", provincia: "Guayas", lat: -1.826, lng: -79.817, peso: 1, radio: 0.015, ambiguo: true, alias: ["salitre", "urbina jado"] },
    { nombre: "Santa Lucía", provincia: "Guayas", lat: -1.711, lng: -79.995, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["santa lucia"] },
    { nombre: "Simón Bolívar", provincia: "Guayas", lat: -2.002, lng: -79.495, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["simon bolivar"] },
    { nombre: "Yaguachi", provincia: "Guayas", lat: -2.093, lng: -79.700, peso: 1, radio: 0.015, alias: ["yaguachi"] },
    { nombre: "Bucay", provincia: "Guayas", lat: -2.200, lng: -79.130, peso: 1, radio: 0.015, alias: ["bucay", "general antonio elizalde"] },
    { nombre: "Gualaceo", provincia: "Azuay", lat: -2.892, lng: -78.778, peso: 1, radio: 0.015, alias: ["gualaceo"] },
    { nombre: "Paute", provincia: "Azuay", lat: -2.778, lng: -78.761, peso: 1, radio: 0.015, alias: ["paute"] },
    { nombre: "Sígsig", provincia: "Azuay", lat: -3.049, lng: -78.789, peso: 1, radio: 0.015, alias: ["sigsig"] },
    { nombre: "Chordeleg", provincia: "Azuay", lat: -2.920, lng: -78.776, peso: 1, radio: 0.015, alias: ["chordeleg"] },
    { nombre: "Girón", provincia: "Azuay", lat: -3.157, lng: -79.149, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["giron"] },
    { nombre: "Santa Isabel", provincia: "Azuay", lat: -3.274, lng: -79.315, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["santa isabel"] },
    { nombre: "Nabón", provincia: "Azuay", lat: -3.335, lng: -79.067, peso: 1, radio: 0.015, alias: ["nabon"] },
    { nombre: "Oña", provincia: "Azuay", lat: -3.475, lng: -79.164, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["oña", "ona"] },
    { nombre: "Pucará", provincia: "Azuay", lat: -3.234, lng: -79.476, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["pucara"] },
    { nombre: "San Fernando", provincia: "Azuay", lat: -3.146, lng: -79.254, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["san fernando"] },
    { nombre: "Sevilla de Oro", provincia: "Azuay", lat: -2.795, lng: -78.648, peso: 1, radio: 0.015, alias: ["sevilla de oro"] },
    { nombre: "Guachapala", provincia: "Azuay", lat: -2.744, lng: -78.712, peso: 1, radio: 0.015, alias: ["guachapala"] },
    { nombre: "El Pan", provincia: "Azuay", lat: -2.788, lng: -78.627, peso: 1, radio: 0.015, ambiguo: true, contexto: true, alias: ["el pan"] },
    { nombre: "Camilo Ponce Enríquez", provincia: "Azuay", lat: -3.054, lng: -79.739, peso: 1, radio: 0.015, alias: ["camilo ponce enriquez", "ponce enriquez"] },
    // Resto de capitales de provincia y ciudades grandes. "Nueva Loja" va antes que "Loja".
    { nombre: "Esmeraldas", provincia: "Esmeraldas", lat: 0.968, lng: -79.652, peso: 3, radio: 0.03, alias: ["esmeraldas"] },
    { nombre: "Santo Domingo", provincia: "Santo Domingo de los Tsáchilas", lat: -0.254, lng: -79.172, peso: 4, radio: 0.04, ambiguo: true, alias: ["santo domingo de los tsachilas", "santo domingo"] },
    { nombre: "Ambato", provincia: "Tungurahua", lat: -1.249, lng: -78.617, peso: 4, radio: 0.03, alias: ["ambato"] },
    { nombre: "Latacunga", provincia: "Cotopaxi", lat: -0.935, lng: -78.616, peso: 3, radio: 0.025, alias: ["latacunga"] },
    { nombre: "Guaranda", provincia: "Bolívar", lat: -1.593, lng: -79.001, peso: 2, radio: 0.02, alias: ["guaranda"] },
    { nombre: "Azogues", provincia: "Cañar", lat: -2.739, lng: -78.847, peso: 2, radio: 0.02, alias: ["azogues"] },
    { nombre: "Nueva Loja", provincia: "Sucumbíos", lat: 0.085, lng: -76.894, peso: 2, radio: 0.02, alias: ["nueva loja", "lago agrio"] },
    { nombre: "Loja", provincia: "Loja", lat: -3.993, lng: -79.204, peso: 3, radio: 0.03, alias: ["loja"] },
    { nombre: "Zamora", provincia: "Zamora Chinchipe", lat: -4.069, lng: -78.956, peso: 1, radio: 0.02, ambiguo: true, alias: ["zamora chinchipe", "zamora"] },
    { nombre: "Ibarra", provincia: "Imbabura", lat: 0.351, lng: -78.122, peso: 3, radio: 0.03, ambiguo: true, alias: ["ibarra"] },
    { nombre: "Otavalo", provincia: "Imbabura", lat: 0.234, lng: -78.262, peso: 2, radio: 0.02, alias: ["otavalo"] },
    { nombre: "Tulcán", provincia: "Carchi", lat: 0.812, lng: -77.717, peso: 2, radio: 0.02, alias: ["tulcan"] },
    { nombre: "Tena", provincia: "Napo", lat: -0.993, lng: -77.813, peso: 1, radio: 0.02, ambiguo: true, alias: ["tena"] },
    { nombre: "Puyo", provincia: "Pastaza", lat: -1.483, lng: -77.987, peso: 1, radio: 0.02, alias: ["puyo"] },
    { nombre: "Macas", provincia: "Morona Santiago", lat: -2.305, lng: -78.117, peso: 1, radio: 0.02, alias: ["macas"] },
    { nombre: "El Coca", provincia: "Orellana", lat: -0.466, lng: -76.987, peso: 1, radio: 0.02, alias: ["el coca", "francisco de orellana"] },
    { nombre: "Puerto Ayora", provincia: "Galápagos", lat: -0.743, lng: -90.313, peso: 1, radio: 0.02, alias: ["puerto ayora", "santa cruz galapagos"] },
    { nombre: "Puerto Baquerizo", provincia: "Galápagos", lat: -0.902, lng: -89.610, peso: 1, radio: 0.02, alias: ["puerto baquerizo", "san cristobal galapagos"] }
  ];

  var catalogo = { CATEGORIAS: CATEGORIAS, CIUDADES: CIUDADES };
  if (typeof module !== "undefined" && module.exports) module.exports = catalogo;
  else raiz.ER_CATALOGO = catalogo;
})(typeof window !== "undefined" ? window : this);

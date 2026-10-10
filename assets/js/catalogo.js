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
      claves: ["asalt", "rob(o|aron|ando|an)\\b", "atraco", "delincuen", "extorsi", "secuestr", "sicari", "banda(s)? delictiva", "arranch"]
    },
    {
      id: "incendios", nombre: "Incendios", icono: "flame", color: "#c2569b",
      claves: ["incendi", "se quema", "en llamas", "fuego", "humareda", "conato", "bomberos"]
    },
    {
      id: "accidentes", nombre: "Accidente vehicular", icono: "car-crash", color: "#6250d6",
      claves: ["accidente", "choque", "chocaron", "colisi", "volcamiento", "se volc", "atropell", "siniestro de transito", "motociclista"]
    },
    {
      id: "desastres", nombre: "Desastres naturales", icono: "tornado", color: "#0e9fb3",
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
    { nombre: "Quito", provincia: "Pichincha", lat: -0.180, lng: -78.468, peso: 9, radio: 0.06, ambiguo: true, alias: ["quito", "uio"] }
  ];

  var catalogo = { CATEGORIAS: CATEGORIAS, CIUDADES: CIUDADES };
  if (typeof module !== "undefined" && module.exports) module.exports = catalogo;
  else raiz.ER_CATALOGO = catalogo;
})(typeof window !== "undefined" ? window : this);

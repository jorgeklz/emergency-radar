# Emergency Radar

Prototipo funcional del panel **Emergency Radar**, que monitorea publicaciones de redes sociales para detectar y ubicar emergencias en Ecuador: asaltos, incendios, accidentes de tránsito y desastres naturales.

Es un sitio estático (HTML, CSS y JavaScript sin compilación), listo para publicarse en GitHub Pages. Todas las librerías están incluidas en `assets/vendor`, así que no depende de CDNs para funcionar.

> Los datos de esta versión son **simulados** y los autores son ficticios. Se generan con una semilla fija, por lo que siempre son los mismos.

## Secciones

**Principal.** Mapa con dos modos (Geolocalización con agrupación de reportes y Mapa de Calor), filtro por categorías y fuentes ("Estas viendo"), tweets recientes con aviso de publicaciones nuevas, Pre Alertas de las últimas 24 horas con tendencia frente a las 24 horas previas y la frecuencia de publicaciones por franja de 30 minutos comparada con el periodo anterior.

**Histórico.** Publicaciones por día apiladas por categoría y un registro paginado con búsqueda, filtros y exportación a CSV.

**Estadísticas.** Indicadores generales, distribución por categoría, ciudades con más reportes, actividad por día y hora, fuentes y autores más activos.

En la barra superior están el botón **En Vivo** (simula la llegada de publicaciones cada pocos segundos; un clic lo pausa), el selector de rango de fechas y el menú.

## Ejecutarlo en local

Basta con abrir `index.html` en el navegador. Si prefieres un servidor:

```bash
npx http-server -p 8080
# o
python3 -m http.server 8080
```

## Publicar en GitHub Pages

Hay dos formas. Elige una.

1. **Desde una rama (la más simple).** En *Settings → Pages*, en *Source* elige *Deploy from a branch*, selecciona la rama (por ejemplo `main`) y la carpeta `/ (root)`.
2. **Con GitHub Actions.** En *Settings → Pages*, en *Source* elige *GitHub Actions*. El flujo `.github/workflows/pages.yml` publica el sitio en cada push a `main` y también puede lanzarse a mano.

La navegación usa rutas con `#` (`#/principal`, `#/historico`, `#/estadisticas`), así que funciona en Pages sin configuración extra.

## Estructura

```
index.html                  Maquetación de las tres vistas
assets/css/styles.css       Estilos (línea gráfica del diseño)
assets/js/data.js           Capa de datos: modelo y datos simulados
assets/js/app.js            Estado global, navegación, rango de fechas, modo En Vivo
assets/js/principal.js      Vista Principal
assets/js/historico.js      Vista Histórico
assets/js/estadisticas.js   Vista Estadísticas
assets/js/icons.js          Íconos SVG (Tabler Icons)
assets/vendor/              Leaflet, Leaflet.markercluster, Leaflet.heat y Chart.js
```

## Modelo de datos

Toda la interfaz lee los datos a través de `window.ER_DATA` (en `assets/js/data.js`). Para conectar datos reales hay que reemplazar la función `generarPublicaciones()` por una carga que devuelva una lista con este esquema:

```js
{
  id:        "p123",
  fuente:    "twitter",              // "twitter" | "facebook"
  autor:     { nombre, usuario, verificado, color },
  texto:     "Texto de la publicación",
  fecha:     Date,
  cliente:   "Twitter for Android",
  categoria: "asaltos",              // asaltos | incendios | accidentes | desastres
  ciudad:    "Guayaquil",
  lat:       -2.17,                  // null si no está geolocalizada
  lng:       -79.92
}
```

Las categorías y las ciudades están definidas en el mismo archivo (`CATEGORIAS` y `CIUDADES`), con su ícono, color y coordenadas.

## Créditos

Mapa base © OpenStreetMap y © CARTO. Íconos de [Tabler Icons](https://tabler.io/icons) (MIT). Gráficos con [Chart.js](https://www.chartjs.org/) (MIT). Mapas con [Leaflet](https://leafletjs.com/) (BSD-2).

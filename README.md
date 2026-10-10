# Emergency Radar

Prototipo funcional del panel **Emergency Radar**, que monitorea publicaciones de redes sociales para detectar y ubicar emergencias en Ecuador: asaltos, incendios, accidentes de tránsito y desastres naturales.

Es un sitio estático (HTML, CSS y JavaScript sin compilación), listo para publicarse en GitHub Pages. Todas las librerías están incluidas en `assets/vendor`, así que no depende de CDNs para funcionar.

Todo lo que muestra el sitio son **publicaciones reales de X** que un recolector captura cada 30 minutos. No hay datos simulados: si todavía no hay capturas, las secciones aparecen vacías con un aviso.

## Secciones

**Principal.** Mapa con dos modos (Geolocalización con agrupación de reportes y Mapa de Calor), filtro por categorías ("Estás viendo"), tweets recientes con aviso de publicaciones nuevas, Pre Alertas de las últimas 24 horas con tendencia frente a las 24 horas previas y la frecuencia de publicaciones por franja de 30 minutos comparada con el periodo anterior.

**Histórico.** Publicaciones por día apiladas por categoría y un registro paginado con búsqueda, filtros por categoría y ciudad (las ciudades salen de los datos capturados), enlace a cada publicación en X y exportación a CSV.

**Estadísticas.** Indicadores generales, distribución por categoría, ciudades con más reportes, actividad por día y hora, cuántas publicaciones se pudieron ubicar y autores más activos.

En la barra superior están la hora de la última captura, el botón **En Vivo** (relee los datos cada minuto y avisa de las publicaciones nuevas; un clic lo pausa), el selector de rango de fechas (por defecto, los últimos 7 días) y el menú.

## Captura de datos reales desde X (Twitter)

La API key **no va en el código del sitio**. GitHub Pages publica todos los archivos, así que cualquier clave escrita en el JavaScript quedaría a la vista de cualquiera. Además, la API de X no acepta llamadas directas desde el navegador.

Por eso la captura funciona así:

```
GitHub Actions (cada 30 min)          Repositorio              GitHub Pages
collector/x-collector.mjs  ──escribe──▶ data/posts.json ──publica──▶ el sitio lee el JSON
   usa el secreto X_BEARER_TOKEN                                     y lo relee cada minuto
```

### Configuración (una sola vez)

1. En el portal de desarrolladores de X crea una app y copia su **Bearer Token**. Tu plan debe incluir el endpoint de búsqueda reciente (`GET /2/tweets/search/recent`).
2. En GitHub ve a *Settings → Secrets and variables → Actions → New repository secret*. Nombre: `X_BEARER_TOKEN`. Valor: el token.
3. Ve a la pestaña *Actions*, abre **Captura de publicaciones de X** y pulsa *Run workflow* para la primera captura. Después corre sola cada 30 minutos.

El token nunca se escribe en el repositorio ni en los registros de Actions: GitHub lo enmascara.

### Ajustes opcionales

En *Settings → Secrets and variables → Actions → Variables* puedes crear:

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `X_QUERY` | Consulta de búsqueda de X | Palabras de emergencia + ciudades de Ecuador, en español y sin retuits |
| `X_MAX_PAGES` | Páginas de 100 resultados por ejecución (controla el consumo de la API) | `2` |
| `X_RETENCION_DIAS` | Días que se guardan en `data/posts.json` | `30` |

La frecuencia se cambia en el `cron` de `.github/workflows/collect.yml`. Cada ejecución pide solo lo nuevo desde la última captura (`since_id`), pero ten en cuenta los límites y costos de tu plan de X.

### Cómo se procesa cada publicación

- **Categoría:** por palabras clave definidas en `assets/js/catalogo.js`. Si no coincide con ninguna categoría, se descarta.
- **Ubicación:** primero las coordenadas exactas (si las tiene), luego el lugar etiquetado en X y por último la ciudad mencionada en el texto. Si no hay ninguna, queda como "Sin ubicación" y no aparece en el mapa, pero sí en las listas y estadísticas.

### Sobre el "tiempo real"

Con GitHub Pages el retraso real es de varios minutos: el workflow corre cada 30 minutos (GitHub a veces lo retrasa), Pages tarda en republicar y el sitio relee el archivo cada minuto. Para algo inmediato hace falta un servidor propio conectado al *filtered stream* de X que empuje los datos al navegador.

### Ejecutar el recolector en tu equipo

```bash
X_BEARER_TOKEN=tu_token node collector/x-collector.mjs   # escribe data/posts.json
node --test collector/*.test.mjs                          # pruebas, sin red
```

No guardes el token en archivos del repositorio. Si usas un `.env`, ya está en `.gitignore`.

## Ejecutarlo en local

Los datos se leen con `fetch`, así que hace falta un servidor (abrir `index.html` directamente no carga las publicaciones):

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
assets/js/catalogo.js       Categorías (palabras clave) y ciudades, compartido con el recolector
assets/js/data.js           Capa de datos: lee data/posts.json y lo vuelve a leer en modo En Vivo
assets/js/app.js            Estado global, navegación, rango de fechas, modo En Vivo
assets/js/principal.js      Vista Principal
assets/js/historico.js      Vista Histórico
assets/js/estadisticas.js   Vista Estadísticas
assets/js/icons.js          Íconos SVG (Tabler Icons)
assets/vendor/              Leaflet, Leaflet.markercluster, Leaflet.heat y Chart.js
collector/                  Recolector de X (Node 20, sin dependencias) y sus pruebas
data/posts.json             Publicaciones capturadas (lo actualiza GitHub Actions)
.github/workflows/          collect.yml (captura) y pages.yml (publicación desde main)
```

## Modelo de datos

Toda la interfaz lee los datos a través de `window.ER_DATA` (en `assets/js/data.js`). `data/posts.json` tiene la forma `{ generado, ultimoId, publicaciones: [...] }` y cada publicación sigue este esquema (la fecha va en ISO 8601):

```js
{
  id:        "p123",
  autor:     { nombre, usuario, verificado, color },
  texto:     "Texto de la publicación",
  fecha:     Date,
  categoria: "asaltos",              // asaltos | incendios | accidentes | desastres
  ciudad:    "Guayaquil",
  lat:       -2.17,                  // null si no está geolocalizada
  lng:       -79.92,
  url:       "https://x.com/usuario/status/123"   // opcional
}
```

Las categorías y las ciudades están en `assets/js/catalogo.js`, con su ícono, color, palabras clave y coordenadas. Tu propio modelo de clasificación puede alimentar el sitio con solo escribir ese mismo JSON.

## Créditos

Mapa base © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright). Íconos de [Tabler Icons](https://tabler.io/icons) (MIT). Gráficos con [Chart.js](https://www.chartjs.org/) (MIT). Mapas con [Leaflet](https://leafletjs.com/) (BSD-2).

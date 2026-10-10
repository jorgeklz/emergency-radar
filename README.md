# Emergency Radar

Prototipo funcional del panel **Emergency Radar**, que monitorea publicaciones de redes sociales para detectar y ubicar emergencias en Ecuador: asaltos, incendios, accidentes de tránsito y desastres naturales.

Es un sitio estático (HTML, CSS y JavaScript sin compilación), listo para publicarse en GitHub Pages. Todas las librerías están incluidas en `assets/vendor`, así que no depende de CDNs para funcionar.

Todo lo que muestra el sitio son **publicaciones reales de X** que un recolector captura cada 30 minutos. No hay datos simulados: si todavía no hay capturas, las secciones aparecen vacías con un aviso.

## Secciones

**Principal.** Resumen animado de las últimas 24 horas (emergencias y su tendencia, última hora, categoría y zona más activas). Mapa con dos modos (Geolocalización con agrupación de reportes y Mapa de Calor), cuatro mapas base (Calles por defecto, Humanitario, Gris y Satélite), puntos con el color de su categoría, filtro por categorías ("Estás viendo"), posts recientes de las últimas 24 horas con aviso de publicaciones nuevas, Pre-alertas (ver abajo) y Frecuencia de posts, con una línea de tiempo por gravedad en intervalos de 6 h, 24 h, 3 días, 7 días o el periodo elegido, picos detectados automáticamente (franjas por encima de la media más dos desviaciones) y los posts de cada franja al hacer clic.

**Histórico.** Publicaciones por día apiladas por categoría y un registro de 10 en 10 con búsqueda, filtros, resultado del modelo, enlace a cada publicación en X y exportación a CSV.

Los filtros (categorías, ciudad y clasificación del modelo) se comparten entre Principal e Histórico: lo que eliges en "Estás viendo", en Pre-alertas o en Histórico se aplica en ambas, y el mapa se centra en los resultados. Estadísticas tiene sus propios filtros.

**Estadísticas.** Filtros propios e independientes del resto del sitio: periodo rápido (24 h, 7 días, 30 días o todo), fecha y hora de inicio y de fin, categoría, ciudad y clasificación del modelo. Muestra indicadores generales, distribución por categoría, ciudades con más reportes, actividad por día y hora, cuántas publicaciones se pudieron ubicar, autores más activos y el desempeño del modelo de clasificación.

En la barra superior están la hora de la última captura, el botón **En vivo** (cada minuto revisa si el recolector dejó posts nuevos y los suma al mapa, al resumen, a Pre-alertas y a Frecuencia, con un aviso; en pausa la pantalla queda fija para analizarla, y la captura en X sigue corriendo igual), el selector de rango de fechas (por defecto, los últimos 7 días) y el menú.

## Colores

- **Gravedad (rojo, amarillo, verde):** el rojo indica más emergencia, el amarillo una gravedad media y el verde menos. Se usa en los puntos y grupos del mapa, en el borde y la etiqueta de cada post, en la línea de tiempo de Frecuencia y en los niveles de Pre-alertas. La gravedad de un post combina la probabilidad del modelo con un plus si menciona heridos o fallecidos; la de un grupo del mapa sigue la cantidad de reportes (verde menos de 5, amarillo de 5 a 14, rojo 15 o más). Siempre va acompañada de texto o ícono.
- **Mapas de calor (blanco, amarillo, anaranjado, rojo):** el modo Mapa de Calor y la actividad por día y hora van de blanco (sin peligro) a amarillo (medio), anaranjado (alto) y rojo (extremo).
- **Categorías (azul, magenta, violeta, cian):** identifican el tipo de emergencia y a propósito no usan rojo, amarillo ni verde, para no confundirse con la gravedad. La paleta pasa las pruebas de separación para daltonismo y de contraste.

## Pre-alertas

Funcionan como alerta temprana. Para la ventana elegida (1, 6 o 24 horas) comparan cuántos posts hay de cada categoría con **lo habitual**: la misma franja horaria de los días anteriores (hasta 7) o, si todavía no hay días previos, la ventana inmediatamente anterior. Con eso asignan un nivel:

| Nivel | Cuándo |
|---|---|
| Alerta alta | Muy por encima de lo habitual (z ≥ 3) y al menos 5 posts |
| Alerta | Claramente por encima (z ≥ 2) y al menos 3 posts |
| Atención | Algo por encima (z ≥ 1), acelerando en el último cuarto de la ventana o con 3 o más posts que mencionan heridos o fallecidos |
| Normal | Dentro de lo habitual |

z = (observado − habitual) / √(habitual + 1), una aproximación de Poisson para conteos pequeños. Cada categoría muestra además dónde se concentra, hace cuánto llegó el último reporte, cuántos posts vienen de cuentas verificadas y, al desplegarla, sus últimos posts con un botón para verlos en el mapa. Arriba aparecen las **zonas a vigilar** (combinaciones de ciudad y categoría por encima de lo habitual). El cálculo está en `assets/js/alertas.js` y sus pruebas en `tests/`.

## Captura de datos reales desde X

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
3. Ve a la pestaña *Actions*, abre **Captura continua cada 30 minutos** y pulsa *Run workflow*. Desde ahí captura sola en cada :00 y :30 (hora UTC).

El token nunca se escribe en el repositorio ni en los registros de Actions: GitHub lo enmascara.

### Ajustes opcionales

En *Settings → Secrets and variables → Actions → Variables* puedes crear:

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `X_QUERY` | Consulta de búsqueda de X | Palabras de emergencia + ciudades de Ecuador, en español y sin reposts |
| `X_MAX_PAGES` | Páginas de 100 resultados por ejecución (controla el consumo de la API) | `2` |
| `X_RETENCION_DIAS` | Días que se guardan en `data/posts.json` | `30` |

### Captura automática cada 30 minutos

El `cron` de GitHub se salta ejecuciones cuando hay carga, así que la captura automática no depende de él. El workflow **Captura continua cada 30 minutos** (`.github/workflows/captura-continua.yml`) corre unas 5,5 horas, captura en cada :00 y :30 (hora UTC) y al terminar se vuelve a lanzar solo. Su `cron` es solo un respaldo que reinicia la cadena si alguna vez se corta; nunca corren dos a la vez. En repositorios públicos los minutos de GitHub Actions son gratuitos.

- **Cambiar el intervalo:** en `captura-continua.yml`, el número `1800` (segundos) del cálculo de la próxima captura. Por ejemplo, `900` para cada 15 minutos o `3600` para cada hora.
- **Captura puntual:** workflow **Captura de publicaciones de X** (`collect.yml`) > *Run workflow*.
- **Detener la captura automática:** *Actions* > **Captura continua cada 30 minutos** > "..." > *Disable workflow*. Cancelar una ejecución a mano también corta la cadena; para retomarla, *Run workflow*.
- Los pasos de cada captura están en `scripts/captura.sh` (X, modelo, commit y publicación en Pages).

Cada captura pide solo lo nuevo desde la anterior (`since_id`), con un tope de `X_MAX_PAGES` páginas de 100 posts. Ten en cuenta los límites y costos de tu plan de X: son hasta 48 capturas por día.

### Cómo se procesa cada publicación

- **Categoría:** por palabras clave definidas en `assets/js/catalogo.js`. Si no coincide con ninguna categoría, se descarta.
- **¿Es una emergencia?** Lo decide el modelo LSI + kNN (ver la sección "Modelo de clasificación").
- **Ubicación:** primero las coordenadas exactas (si las tiene), luego el lugar etiquetado en X y por último la ciudad mencionada en el texto. Si no hay ninguna, queda como "Sin ubicación" y no aparece en el mapa, pero sí en las listas y estadísticas. Los nombres que también son palabras comunes (Quito, Cuenca, Milagro, Manta, Salinas, La Libertad) solo cuentan escritos con mayúscula: así "le quitó" o "un milagro" no se ubican en esas ciudades.

### Sobre el "tiempo real"

Con GitHub Pages el retraso real es de varios minutos: se captura cada 30 minutos, Pages tarda alrededor de un minuto en republicar y el sitio relee el archivo cada minuto. Para algo inmediato hace falta un servidor propio conectado al *filtered stream* de X que empuje los datos al navegador.

### Ejecutar el recolector en tu equipo

```bash
X_BEARER_TOKEN=tu_token node collector/x-collector.mjs   # escribe data/posts.json
node --test collector/*.test.mjs tests/*.test.mjs        # pruebas, sin red
```

No guardes el token en archivos del repositorio. Si usas un `.env`, ya está en `.gitignore`.

## Modelo de clasificación

Cada publicación capturada pasa por el modelo del paper *A graph-based semi-supervised approach for automatic text corpus emergency events labelling in X (Twitter)* (Parraga-Alava, Rodas-Silva, Franco y Vélez, Big Data Research 45, 2026). Para cada publicación nueva se buscan las *k* publicaciones más parecidas de un corpus etiquetado y se le asigna, por mayoría, su etiqueta: **emergencia** o **no emergencia**. Por defecto el sitio muestra solo las emergencias; con el filtro "Clasificación del modelo" se pueden ver también las descartadas.

Este enfoque es interpretable: el sitio muestra, por ejemplo, "Emergencia 78 %", y al pasar el cursor, cuántos de los vecinos son emergencias.

### Corpus

`modelo/corpus/anotados_800.csv` tiene 797 publicaciones en español de Ecuador (366 emergencias y 431 no emergencias), etiquetadas por 9 anotadores humanos. Salen de las planillas del repositorio del paper (`jorgeklz/paper-labelling`). La etiqueta final es la de la mayoría de los anotadores, como en el paper. El corpus UrbangEnCy no está en ese repositorio; para sumarlo basta con dejar un CSV con las columnas `texto` y `etiqueta` (1/0) en la misma carpeta.

### Resultados (validación cruzada estratificada, 5 folds x 5 repeticiones)

| Configuración | Exactitud | Precisión | Sensibilidad | Especificidad | F1 | Kappa con anotadores |
|---|---|---|---|---|---|---|
| **LSI, k = 9, 300 dimensiones, voto ponderado (en uso)** | **0,870** | 0,861 | **0,856** | 0,883 | **0,858** | **0,785** |
| LSI, k = 7, 100 dimensiones (configuración del paper) | 0,853 | 0,838 | 0,843 | 0,862 | 0,840 | 0,777 |
| SVM lineal sobre TF-IDF (referencia) | 0,878 | 0,875 | 0,857 | 0,896 | 0,866 | 0,786 |
| Regresión logística sobre TF-IDF (referencia) | 0,870 | 0,894 | 0,814 | 0,918 | 0,852 | 0,780 |

El kappa de Light entre los 9 anotadores es 0,797 (acuerdo fuerte), así que el modelo coincide con las personas casi tanto como ellas entre sí. En este corpus el SVM queda apenas por encima; se mantiene el kNN porque es el enfoque del paper y permite explicar cada alerta. El detalle de las 60 configuraciones probadas está en `modelo/resultados/evaluacion.json`.

### De los scripts originales al código del proyecto

| Original | En el proyecto | Cambios principales |
|---|---|---|
| `data_features.py` | `modelo/preprocesamiento.py` | Español en lugar de inglés: stopwords en español (incluidas en el repo) y stemmer Snowball en lugar de WordNet y pycontractions, sin descargar modelos. Se conserva la palabra de los hashtags. |
| `iniciador.py` / `knn.py` del paper | `modelo/lsi_knn.py` | Medidas Coseno, TF-IDF y LSI; regla de umbral 0,20 del código original; operaciones vectorizadas; voto ponderado opcional; `explicar()` devuelve los vecinos. |
| `kappa.R` | `modelo/evaluacion.py` | Kappa de Light (promedio de kappa de Cohen por pares) más las métricas del paper, SVM y regresión logística de referencia, y selección automática de la mejor configuración. |
| `data_get_synonim.R` | `modelo/palabras_clave.py` | Palabras asociadas a emergencias por chi cuadrado en el corpus, cruzadas con las 14 listas del paper, y una consulta lista para la API v2 de X. Es una sugerencia: para usarla, cópiala en la variable `X_QUERY`. |

### Comandos

```bash
pip install -r modelo/requirements.txt
python -m modelo.clasificar          # clasifica data/posts.json (lo hace el workflow en cada captura)
python -m modelo.evaluacion          # repite la validación y actualiza modelo/resultados/config.json (~6 min)
python -m modelo.palabras_clave      # sugiere palabras clave y una consulta para X
python -m unittest modelo.test_modelo
```

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

GitHub Pages deja los archivos en caché del navegador unos 10 minutos. Para que nadie vea una mezcla de versiones (HTML nuevo con CSS o JavaScript viejos), `index.html` carga `styles.css` y los scripts de `assets/js/` con un parámetro de versión (`?v=AAAAMMDD-HHMM`). Cada vez que cambies esos archivos, actualiza ese valor en `index.html`.

## Estructura

```
index.html                  Maquetación de las tres vistas
assets/css/styles.css       Estilos (línea gráfica del diseño)
assets/js/catalogo.js       Categorías (palabras clave) y ciudades, compartido con el recolector
assets/js/data.js           Capa de datos: lee data/posts.json y lo vuelve a leer en modo En vivo
assets/js/app.js            Estado global, navegación, rango de fechas, modo En vivo
assets/js/principal.js      Vista Principal
assets/js/historico.js      Vista Histórico
assets/js/estadisticas.js   Vista Estadísticas
assets/js/icons.js          Íconos SVG (Tabler Icons)
assets/vendor/              Leaflet, Leaflet.markercluster, Leaflet.heat y Chart.js
collector/                  Recolector de X (Node 20, sin dependencias) y sus pruebas
modelo/                     Modelo LSI + kNN en Python: corpus, preprocesamiento, evaluación y clasificación
data/posts.json             Publicaciones capturadas (lo actualiza GitHub Actions)
.github/workflows/          captura-continua.yml (cada 30 min), collect.yml (captura manual) y pages.yml
scripts/captura.sh          Una captura completa: X, modelo, commit y publicación en Pages
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

Esta app implementa el modelo del artículo [https://doi.org/10.1016/j.bdr.2026.100630](https://doi.org/10.1016/j.bdr.2026.100630) (Parraga-Alava, Rodas-Silva, Franco y Vélez, *Big Data Research* 45, 2026). La referencia aparece en el pie de página de todo el sitio.


Mapas base © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), estilo humanitario de [HOT](https://www.hotosm.org/) e imágenes satelitales © Esri. Íconos de [Tabler Icons](https://tabler.io/icons) (MIT). Gráficos con [Chart.js](https://www.chartjs.org/) (MIT). Mapas con [Leaflet](https://leafletjs.com/) (BSD-2).

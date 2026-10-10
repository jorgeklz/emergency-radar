# Emergency Radar

Prototipo funcional del panel **Emergency Radar**, que monitorea publicaciones de redes sociales para detectar y ubicar emergencias en Ecuador: asaltos, incendios, accidentes de tránsito y desastres naturales.

Es un sitio estático (HTML, CSS y JavaScript sin compilación), listo para publicarse en GitHub Pages. Todas las librerías están incluidas en `assets/vendor`, así que no depende de CDNs para funcionar.

Todo lo que muestra el sitio son **publicaciones reales de X** que un recolector captura cada 30 minutos. No hay datos simulados: si todavía no hay capturas, las secciones aparecen vacías con un aviso.

## Secciones

**Principal.** Resumen animado de las últimas 24 horas (emergencias y su tendencia, última hora, categoría y zona más activas, cuántos posts filtró el modelo). Mapa con dos modos (Geolocalización con agrupación de reportes y Mapa de Calor), cuatro mapas base (Calles a color, Humanitario, Gris y Satélite), puntos con el color de su categoría, filtro por categorías ("Estás viendo"), posts recientes de las últimas 24 horas con aviso de publicaciones nuevas, Pre Alertas de las últimas 24 horas con una mini gráfica por hora y la tendencia frente a las 24 horas previas y la frecuencia de publicaciones por franja de 30 minutos comparada con el periodo anterior.

**Histórico.** Publicaciones por día apiladas por categoría y un registro de 10 en 10 con búsqueda, filtros, resultado del modelo, enlace a cada publicación en X y exportación a CSV.

Los filtros (categorías, ciudad y clasificación del modelo) son los mismos en las tres pestañas: lo que eliges en "Estás viendo", en Pre Alertas o en Histórico se aplica en todo el sitio, y el mapa se centra en los resultados.

**Estadísticas.** Indicadores generales, distribución por categoría, ciudades con más reportes, actividad por día y hora, cuántas publicaciones se pudieron ubicar, autores más activos y el desempeño del modelo de clasificación.

En la barra superior están la hora de la última captura, el botón **En Vivo** (relee los datos cada minuto y avisa de las publicaciones nuevas; un clic lo pausa), el selector de rango de fechas (por defecto, los últimos 7 días) y el menú.

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
3. Ve a la pestaña *Actions*, abre **Captura de publicaciones de X** y pulsa *Run workflow* para la primera captura. Después corre sola cada 30 minutos.

El token nunca se escribe en el repositorio ni en los registros de Actions: GitHub lo enmascara.

### Ajustes opcionales

En *Settings → Secrets and variables → Actions → Variables* puedes crear:

| Variable | Para qué sirve | Por defecto |
|---|---|---|
| `X_QUERY` | Consulta de búsqueda de X | Palabras de emergencia + ciudades de Ecuador, en español y sin reposts |
| `X_MAX_PAGES` | Páginas de 100 resultados por ejecución (controla el consumo de la API) | `2` |
| `X_RETENCION_DIAS` | Días que se guardan en `data/posts.json` | `30` |

La frecuencia se cambia en el `cron` de `.github/workflows/collect.yml`. Cada ejecución pide solo lo nuevo desde la última captura (`since_id`), pero ten en cuenta los límites y costos de tu plan de X.

### Cómo se procesa cada publicación

- **Categoría:** por palabras clave definidas en `assets/js/catalogo.js`. Si no coincide con ninguna categoría, se descarta.
- **¿Es una emergencia?** Lo decide el modelo LSI + kNN (ver la sección "Modelo de clasificación").
- **Ubicación:** primero las coordenadas exactas (si las tiene), luego el lugar etiquetado en X y por último la ciudad mencionada en el texto. Si no hay ninguna, queda como "Sin ubicación" y no aparece en el mapa, pero sí en las listas y estadísticas. Los nombres que también son palabras comunes (Quito, Cuenca, Milagro, Manta, Salinas, La Libertad) solo cuentan escritos con mayúscula: así "le quitó" o "un milagro" no se ubican en esas ciudades.

### Sobre el "tiempo real"

Con GitHub Pages el retraso real es de varios minutos: el workflow corre cada 30 minutos (GitHub a veces lo retrasa), Pages tarda en republicar y el sitio relee el archivo cada minuto. Para algo inmediato hace falta un servidor propio conectado al *filtered stream* de X que empuje los datos al navegador.

### Ejecutar el recolector en tu equipo

```bash
X_BEARER_TOKEN=tu_token node collector/x-collector.mjs   # escribe data/posts.json
node --test collector/*.test.mjs                          # pruebas, sin red
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
modelo/                     Modelo LSI + kNN en Python: corpus, preprocesamiento, evaluación y clasificación
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

Mapas base © colaboradores de [OpenStreetMap](https://www.openstreetmap.org/copyright), estilo humanitario de [HOT](https://www.hotosm.org/) e imágenes satelitales © Esri. Íconos de [Tabler Icons](https://tabler.io/icons) (MIT). Gráficos con [Chart.js](https://www.chartjs.org/) (MIT). Mapas con [Leaflet](https://leafletjs.com/) (BSD-2).

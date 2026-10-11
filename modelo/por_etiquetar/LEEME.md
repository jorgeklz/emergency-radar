# Lotes para etiquetar

`lote_01.csv` trae 250 posts reales capturados por la app que no están en el corpus, ordenados
de más dudoso a menos para el modelo (probabilidad cercana a 50 %). Son los que más enseñan.

Cómo llenarlo (se abre con Excel o Google Sheets):

- **etiqueta**: `1` si es una emergencia real en Ecuador (asalto, incendio, accidente de
  tránsito o desastre natural que está pasando o acaba de pasar), `0` si no lo es (fútbol,
  política, bromas, efemérides, noticias de otro país, publicidad...). Es la única columna obligatoria.
- **a1 … a9** (opcional): la etiqueta de cada anotador, `1` o `0`. Si las llenas, se calcula el
  acuerdo entre anotadores (kappa de Light) y `etiqueta` puede quedar vacía: se toma la mayoría.
- **notas** (opcional): cualquier comentario.
- No cambies `id` ni `texto`. Las filas sin etiqueta se ignoran, así que puedes devolverlo a medias.

Al devolverlo, el archivo se copia a `modelo/corpus/` y el modelo se vuelve a entrenar y evaluar
con validación cruzada 5 × 5.

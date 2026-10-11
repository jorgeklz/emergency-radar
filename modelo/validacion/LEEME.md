# Validación con posts reales

`lote_01_etiquetado.csv`: 249 posts reales capturados por la app (octubre de 2026), etiquetados a
mano (1 = emergencia real en Ecuador, 0 = no). No se usan para entrenar: sirven para medir qué
tan bien acierta el modelo con lo que de verdad llega de X.

Resultado (`python modelo/comparar_validacion.py`, validación cruzada 5 × 5 sobre estos posts):

| Entrenado con | Exactitud | Precisión | Sensibilidad |
|---|---|---|---|
| Corpus original (797) | 0,900 | 0,842 | 0,917 |
| Corpus original + estas etiquetas | 0,842 | 0,838 | 0,740 |

Sumar el lote empeoró la sensibilidad (se escapan más emergencias), así que el modelo en
producción sigue entrenado solo con el corpus original. Hay una salvedad: el archivo mostraba
la predicción del modelo al etiquetar, lo que puede sesgar las etiquetas hacia esa predicción.
Los próximos lotes se entregan sin esa columna.

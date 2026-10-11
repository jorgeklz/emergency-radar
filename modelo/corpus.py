"""
Carga del corpus etiquetado.

Lee todos los CSV de modelo/corpus/ con, al menos, las columnas
`texto` y `etiqueta` (1 = emergencia, 0 = no emergencia). Si el CSV trae las
columnas a1..a9 con las etiquetas de cada anotador, se usan para calcular el
kappa de Light. Para sumar el corpus UrbangEnCy basta con dejar un CSV con ese
formato en la misma carpeta.
"""
import csv
from pathlib import Path

CARPETA = Path(__file__).with_name("corpus")


def cargar(carpeta=CARPETA):
    textos, etiquetas, anotaciones = [], [], []
    vistos = set()
    for ruta in sorted(Path(carpeta).glob("*.csv")):
        with ruta.open(encoding="utf-8-sig", newline="") as f:
            for fila in csv.DictReader(f):
                texto = (fila.get("texto") or "").strip()
                if not texto or texto in vistos or fila.get("etiqueta") not in ("0", "1"):
                    continue
                vistos.add(texto)
                textos.append(texto)
                etiquetas.append(int(fila["etiqueta"]))
                columnas = sorted((c for c in fila if c and c[0] == "a" and c[1:].isdigit()), key=lambda c: int(c[1:]))
                anotaciones.append([int(fila[c]) for c in columnas if fila[c] in ("0", "1")])
    return textos, etiquetas, anotaciones

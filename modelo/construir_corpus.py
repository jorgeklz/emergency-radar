"""
Genera modelo/corpus/anotados_800.csv a partir de las planillas de anotación
del repositorio del paper (jorgeklz/paper-labelling).

Son 800 publicaciones en español etiquetadas por 9 anotadores humanos. La
etiqueta final se decide por mayoría (estrategia de pluralidad del paper).

Uso: python -m modelo.construir_corpus RUTA/Kappa_Verificacion_Anotadores_02_LSI.xlsx
Requiere pandas y openpyxl (solo para este paso, no para el modelo).
"""
import csv
import sys
from pathlib import Path

import pandas as pd

from .corpus import CARPETA


def main(ruta_xlsx):
    df = pd.read_excel(ruta_xlsx)
    anotadores = [f"Anotador_{i}" for i in range(1, 10)]
    df = df.rename(columns={df.columns[0]: "texto"})
    df["texto"] = df["texto"].astype(str).str.strip()
    df = df.drop_duplicates("texto")
    votos = df[anotadores].sum(axis=1)
    CARPETA.mkdir(exist_ok=True)
    destino = CARPETA / "anotados_800.csv"
    with destino.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["texto", "etiqueta", "votos_emergencia"] + [f"a{i}" for i in range(1, 10)])
        for (_, fila), v in zip(df.iterrows(), votos):
            w.writerow([fila["texto"], int(v >= 5), int(v)] + [int(fila[a]) for a in anotadores])
    print(f"{len(df)} publicaciones guardadas en {destino}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "Kappa_Verificacion_Anotadores_02_LSI.xlsx")

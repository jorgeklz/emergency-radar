"""
Clasifica las publicaciones capturadas (data/posts.json) como emergencia o no
emergencia con el modelo LSI + kNN entrenado sobre el corpus etiquetado.

A cada publicación le agrega:
  emergencia          true / false
  prob_emergencia     peso de los vecinos que son emergencia (0 a 1)
  vecinos_emergencia  cuántos de los k vecinos más parecidos son emergencias
Y en la raíz del archivo, un bloque "modelo" con la configuración y métricas.

Solo se reclasifica lo que no tiene etiqueta, salvo que cambie el modelo o el
corpus (o se use --todas). El archivo se reescribe solo si algo cambió.

Uso: python -m modelo.clasificar [--archivo data/posts.json] [--todas]
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np

from . import corpus, preprocesamiento
from .lsi_knn import ClasificadorGrafoKNN

RAIZ = Path(__file__).resolve().parent.parent
ARCHIVO = RAIZ / "data" / "posts.json"
CONFIG = Path(__file__).with_name("resultados") / "config.json"
# Configuración del paper, por si todavía no se corrió la evaluación.
POR_DEFECTO = {"medida": "lsi", "k": 7, "componentes": 100, "ponderado": False}


def cargar_config():
    if CONFIG.exists():
        return json.loads(CONFIG.read_text(encoding="utf-8"))
    return dict(POR_DEFECTO, descripcion="LSI, k=7, 100 dimensiones (configuración del paper)")


def entrenar(cfg=None):
    cfg = cfg or cargar_config()
    textos, etiquetas, _ = corpus.cargar()
    if not textos:
        raise SystemExit("No hay corpus etiquetado en modelo/corpus/.")
    parametros = {k: cfg[k] for k in ("medida", "k", "componentes", "umbral", "ponderado") if k in cfg}
    modelo = ClasificadorGrafoKNN(**parametros).fit([preprocesamiento.procesar(t) for t in textos], etiquetas)
    huella = hashlib.sha1(json.dumps([parametros, len(textos), sum(etiquetas)], sort_keys=True).encode()).hexdigest()[:12]
    return modelo, cfg, len(textos), huella


def main(archivo=ARCHIVO, todas=False):
    archivo = Path(archivo)
    datos = json.loads(archivo.read_text(encoding="utf-8"))
    publicaciones = datos.get("publicaciones", [])
    modelo, cfg, n_corpus, huella = entrenar()

    reentrenado = (datos.get("modelo") or {}).get("huella") != huella
    pendientes = [p for p in publicaciones if todas or reentrenado or "emergencia" not in p]
    if pendientes:
        procesados = [preprocesamiento.procesar(p.get("texto", "")) for p in pendientes]
        prob = modelo.predict_proba(procesados)
        idx, _ = modelo.vecinos(procesados)
        votos = modelo.etiquetas_[idx].sum(axis=1)
        for p, pr, v in zip(pendientes, prob, votos):
            p["emergencia"] = bool(pr > 0.5)
            p["prob_emergencia"] = round(float(pr), 3)
            p["vecinos_emergencia"] = int(v)

    bloque = {
        "nombre": "Grafo kNN semisupervisado (Parraga-Alava et al., 2026)",
        "descripcion": cfg.get("descripcion"),
        "k": modelo.k,
        "corpus": n_corpus,
        "metricas": cfg.get("metricas"),
        "kappa_light": cfg.get("kappa_light"),
        "huella": huella,
    }
    if not pendientes and datos.get("modelo") == bloque:
        print("Sin publicaciones nuevas que clasificar.")
        return 0
    datos["modelo"] = bloque
    archivo.write_text(json.dumps(datos, ensure_ascii=False) + "\n", encoding="utf-8")
    n_emerg = sum(1 for p in publicaciones if p.get("emergencia"))
    print(f"Clasificadas {len(pendientes)} publicaciones con {cfg.get('descripcion')}. "
          f"En el archivo: {n_emerg} emergencias y {len(publicaciones) - n_emerg} descartadas de {len(publicaciones)}.")
    return len(pendientes)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--archivo", default=str(ARCHIVO))
    ap.add_argument("--todas", action="store_true")
    a = ap.parse_args()
    main(a.archivo, a.todas)

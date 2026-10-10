"""
Evaluación del modelo (fase 5 del paper) y selección de la mejor configuración.

- Validación cruzada estratificada y repetida sobre el corpus etiquetado con
  las métricas del paper: Accuracy, Precision, Recall, Specificity, F1 y
  Log loss.
- Kappa de Light entre el modelo y los 9 anotadores humanos (port de
  kappa.R, que usaba irr::kappam.light): el promedio de todos los kappa de
  Cohen por pares.
- Comparación con SVM y regresión logística sobre TF-IDF (Tabla 7 del paper).

La mejor configuración (mayor F1) se guarda en modelo/resultados/config.json
y es la que usa clasificar.py en producción.

Uso: python -m modelo.evaluacion [--repeticiones 5] [--folds 5]
"""
import argparse
import itertools
import json
import time
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import cohen_kappa_score, confusion_matrix, log_loss
from sklearn.model_selection import StratifiedKFold
from sklearn.svm import LinearSVC

from . import corpus, preprocesamiento
from .lsi_knn import ClasificadorGrafoKNN

RESULTADOS = Path(__file__).with_name("resultados")
VALORES_K = (1, 3, 5, 7, 9, 11)
COMPONENTES_LSI = (50, 100, 200, 300)


def metricas(y, pred, prob):
    tn, fp, fn, tp = confusion_matrix(y, pred, labels=[0, 1]).ravel()
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    return {
        "accuracy": (tp + tn) / len(y),
        "precision": precision,
        "recall": recall,
        "specificity": tn / (tn + fp) if tn + fp else 0.0,
        "f1": 2 * precision * recall / (precision + recall) if precision + recall else 0.0,
        "log_loss": log_loss(y, np.clip(prob, 1e-3, 1 - 1e-3), labels=[0, 1]),
    }


def kappa_light(matriz):
    """Kappa de Light: promedio de los kappa de Cohen de todos los pares de
    evaluadores. `matriz` tiene una fila por publicación y una columna por
    evaluador (equivale a irr::kappam.light)."""
    matriz = np.asarray(matriz)
    pares = itertools.combinations(range(matriz.shape[1]), 2)
    valores = [cohen_kappa_score(matriz[:, i], matriz[:, j]) for i, j in pares]
    return float(np.nanmean(valores))


def interpretar_kappa(k):
    # Tabla 2 del paper.
    for limite, nivel in ((0.20, "Nulo"), (0.39, "Mínimo"), (0.59, "Débil"), (0.79, "Moderado"), (0.90, "Fuerte")):
        if k <= limite:
            return nivel
    return "Casi perfecto"


class _Baseline:
    """SVM o regresión logística sobre TF-IDF, con la misma interfaz."""

    def __init__(self, tipo):
        self.tipo = tipo

    def fit(self, textos, y):
        self._vec = TfidfVectorizer(sublinear_tf=True)
        x = self._vec.fit_transform(textos)
        self._m = LinearSVC() if self.tipo == "svm" else LogisticRegression(max_iter=2000)
        self._m.fit(x, y)
        return self

    def predict_proba(self, textos):
        x = self._vec.transform(textos)
        if self.tipo == "svm":
            return 1 / (1 + np.exp(-self._m.decision_function(x)))
        return self._m.predict_proba(x)[:, 1]

    def predict(self, textos):
        return (self.predict_proba(textos) > 0.5).astype(int)

    def descripcion(self):
        return "SVM lineal (TF-IDF)" if self.tipo == "svm" else "Regresión logística (TF-IDF)"


def validar(crear, textos, y, folds, repeticiones):
    """Métricas promedio y predicciones fuera de muestra de la última repetición."""
    acumulado, oof = [], np.zeros(len(y), dtype=int)
    inicio = time.perf_counter()
    for rep in range(repeticiones):
        skf = StratifiedKFold(n_splits=folds, shuffle=True, random_state=rep)
        pred_rep, prob_rep = np.zeros(len(y), dtype=int), np.zeros(len(y))
        for tr, te in skf.split(textos, y):
            m = crear().fit([textos[i] for i in tr], y[tr])
            prob_rep[te] = m.predict_proba([textos[i] for i in te])
            pred_rep[te] = m.predict([textos[i] for i in te])
        acumulado.append(metricas(y, pred_rep, prob_rep))
        oof = pred_rep
    promedio = {k: float(np.mean([a[k] for a in acumulado])) for k in acumulado[0]}
    promedio["segundos"] = (time.perf_counter() - inicio) / repeticiones
    return promedio, oof


def main(folds=5, repeticiones=5):
    textos_crudos, y, anotaciones = corpus.cargar()
    textos = [preprocesamiento.procesar(t) for t in textos_crudos]
    y = np.asarray(y)
    con_anotadores = all(len(a) == 9 for a in anotaciones)
    filas = []

    configs = [dict(medida="coseno", k=k) for k in VALORES_K]
    configs += [dict(medida="tfidf", k=k) for k in VALORES_K]
    configs += [dict(medida="lsi", k=k, componentes=c) for k in VALORES_K for c in COMPONENTES_LSI]
    configs += [dict(medida="lsi", k=k, componentes=c, ponderado=True) for k in VALORES_K for c in COMPONENTES_LSI]

    for cfg in configs:
        res, oof = validar(lambda: ClasificadorGrafoKNN(**cfg), textos, y, folds, repeticiones)
        if con_anotadores:
            res["kappa_light"] = kappa_light(np.column_stack([oof, np.asarray(anotaciones)]))
        filas.append({"config": cfg, "descripcion": ClasificadorGrafoKNN(**cfg).descripcion(), **res})

    for tipo in ("svm", "lr"):
        res, oof = validar(lambda: _Baseline(tipo), textos, y, folds, repeticiones)
        if con_anotadores:
            res["kappa_light"] = kappa_light(np.column_stack([oof, np.asarray(anotaciones)]))
        filas.append({"config": {"baseline": tipo}, "descripcion": _Baseline(tipo).descripcion(), **res})

    knn = [f for f in filas if "baseline" not in f["config"]]
    mejor = max(knn, key=lambda f: (round(f["f1"], 4), round(f["accuracy"], 4)))
    paper = next(f for f in knn if f["config"] == {"medida": "lsi", "k": 7, "componentes": 100})

    salida = {
        "corpus": {"publicaciones": len(y), "emergencias": int(y.sum()), "no_emergencias": int((1 - y).sum())},
        "validacion": {"folds": folds, "repeticiones": repeticiones},
        "kappa_entre_anotadores": kappa_light(np.asarray(anotaciones)) if con_anotadores else None,
        "mejor": mejor,
        "configuracion_paper": paper,
        "resultados": sorted(filas, key=lambda f: -f["f1"]),
    }
    RESULTADOS.mkdir(exist_ok=True)
    (RESULTADOS / "evaluacion.json").write_text(json.dumps(salida, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (RESULTADOS / "config.json").write_text(json.dumps({
        **mejor["config"],
        "descripcion": mejor["descripcion"],
        "metricas": {k: round(mejor[k], 4) for k in ("accuracy", "precision", "recall", "specificity", "f1", "log_loss")},
        "kappa_light": round(mejor["kappa_light"], 4) if "kappa_light" in mejor else None,
    }, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    def linea(f):
        k = f"{f['kappa_light']:.3f}" if "kappa_light" in f else "  -  "
        return (f"{f['descripcion'][:40]:<40} acc {f['accuracy']:.3f}  prec {f['precision']:.3f}  rec {f['recall']:.3f}  "
                f"esp {f['specificity']:.3f}  f1 {f['f1']:.3f}  logloss {f['log_loss']:.3f}  kappa {k}")

    print(f"Corpus: {len(y)} publicaciones ({int(y.sum())} emergencias). Validación {folds} folds x {repeticiones} repeticiones.")
    if con_anotadores:
        ka = salida["kappa_entre_anotadores"]
        print(f"Kappa de Light entre los 9 anotadores: {ka:.3f} ({interpretar_kappa(ka)})")
    print("\nMejores 10 configuraciones kNN:")
    for f in sorted(knn, key=lambda f: -f["f1"])[:10]:
        print("  " + linea(f))
    print("\nConfiguración del paper:\n  " + linea(paper))
    print("\nModelos supervisados de referencia:")
    for f in filas[-2:]:
        print("  " + linea(f))
    print(f"\nElegida para producción: {mejor['descripcion']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--folds", type=int, default=5)
    ap.add_argument("--repeticiones", type=int, default=5)
    a = ap.parse_args()
    main(a.folds, a.repeticiones)

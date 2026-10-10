"""
Palabras clave para buscar publicaciones en X (fase 1 del paper).

Port de data_get_synonim.R y de la parte de sinónimos de data_features.py.
El original buscaba sinónimos en WordNet (que solo funciona bien en inglés),
quitaba los que aparecían en más de una categoría y armaba una consulta por
categoría para la antigua API v1.1 de X con lang = "en".

Aquí, con el mismo objetivo pero en español:
1. Se toman las palabras del corpus etiquetado (sin stopwords ni tildes).
2. Se mide cuánto se asocia cada palabra a "emergencia" con chi cuadrado.
3. Como en el script R, se descartan las palabras que también son típicas de
   la clase contraria.
4. Para la consulta solo se usan palabras de las 14 listas del Apéndice A del
   paper (modelo/palabras_paper.txt) que el corpus confirma como asociadas a
   emergencias. Con un corpus de 800 publicaciones, el ranking por sí solo
   trae palabras genéricas ("vía", "sur") o de cuentas de otros países.
5. Se arma una consulta para la API v2 de X que entre en el límite de 512
   caracteres, combinada con los lugares de Ecuador.

El resultado queda en modelo/resultados/palabras_clave.json y la consulta en
modelo/resultados/consulta_x.txt. Es una sugerencia: para usarla, cópiala en
la variable X_QUERY del repositorio.

Uso: python -m modelo.palabras_clave [--terminos 40]
"""
import argparse
import json
from pathlib import Path

import numpy as np
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.feature_selection import chi2

from . import corpus, preprocesamiento

RESULTADOS = Path(__file__).with_name("resultados")
PALABRAS_PAPER = Path(__file__).with_name("palabras_paper.txt")
LIMITE_CONSULTA = 512
# Lugares de Ecuador sin nombres ambiguos ("Milagro" o "Manta" traen mucho ruido).
LUGARES = '(Ecuador OR Guayaquil OR Quito OR Portoviejo OR Durán OR Machala OR Cuenca OR Babahoyo OR Daule OR "Santa Elena")'
SUFIJO = "lang:es -is:retweet"


def terminos_por_clase(textos, etiquetas, n=40, minimo=3):
    vec = CountVectorizer(binary=True, min_df=minimo, token_pattern=r"(?u)\b[a-zñ]{3,}\b")
    x = vec.fit_transform(preprocesamiento.limpiar_texto(t) for t in textos)
    vacias = preprocesamiento.stopwords()
    vocab = np.array(vec.get_feature_names_out())
    y = np.asarray(etiquetas)
    puntaje, _ = chi2(x, y)
    frec_emerg = np.asarray(x[y == 1].mean(axis=0)).ravel()
    frec_no = np.asarray(x[y == 0].mean(axis=0)).ravel()
    orden = np.argsort(-np.nan_to_num(puntaje))
    emergencia, no_emergencia = [], []
    for i in orden:
        palabra = vocab[i]
        if palabra in vacias:
            continue
        destino = emergencia if frec_emerg[i] > frec_no[i] else no_emergencia
        if len(destino) < n:
            destino.append({"palabra": palabra, "chi2": round(float(puntaje[i]), 2),
                            "en_emergencias": round(float(frec_emerg[i]), 3),
                            "en_no_emergencias": round(float(frec_no[i]), 3)})
        if len(emergencia) >= n and len(no_emergencia) >= n:
            break
    # Igual que el script R: fuera las palabras que aparecen en las dos listas.
    repetidas = {t["palabra"] for t in emergencia} & {t["palabra"] for t in no_emergencia}
    return ([t for t in emergencia if t["palabra"] not in repetidas],
            [t for t in no_emergencia if t["palabra"] not in repetidas])


def palabras_paper():
    lineas = PALABRAS_PAPER.read_text(encoding="utf-8").splitlines()
    return {preprocesamiento.limpiar_texto(l) for l in lineas if l.strip() and not l.startswith("#")}


def armar_consulta(palabras):
    elegidas = []
    for p in palabras:
        prueba = "(" + " OR ".join(elegidas + [p]) + f") {LUGARES} {SUFIJO}"
        if len(prueba) > LIMITE_CONSULTA:
            break
        elegidas.append(p)
    return "(" + " OR ".join(elegidas) + f") {LUGARES} {SUFIJO}"


def main(n=40):
    textos, etiquetas, _ = corpus.cargar()
    emergencia, no_emergencia = terminos_por_clase(textos, etiquetas, n)
    # Para la consulta: palabras del paper ordenadas por su asociación con emergencias en el corpus.
    candidatas, _ = terminos_por_clase(textos, etiquetas, n=2000, minimo=2)
    del_paper = palabras_paper()
    confirmadas = [t["palabra"] for t in candidatas if t["palabra"] in del_paper]
    consulta = armar_consulta(confirmadas)
    RESULTADOS.mkdir(exist_ok=True)
    (RESULTADOS / "palabras_clave.json").write_text(json.dumps(
        {"emergencia": emergencia, "no_emergencia": no_emergencia,
         "palabras_paper_confirmadas": confirmadas, "consulta_x": consulta},
        indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (RESULTADOS / "consulta_x.txt").write_text(consulta + "\n", encoding="utf-8")
    print("Palabras de emergencia:", ", ".join(t["palabra"] for t in emergencia))
    print("Palabras de no emergencia:", ", ".join(t["palabra"] for t in no_emergencia))
    print(f"\nPalabras del paper confirmadas por el corpus ({len(confirmadas)}):", ", ".join(confirmadas[:40]))
    print(f"\nConsulta para X ({len(consulta)} caracteres):\n{consulta}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--terminos", type=int, default=40)
    main(ap.parse_args().terminos)

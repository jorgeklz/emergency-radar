"""Compara, sobre posts reales etiquetados (modelo/validacion/), el modelo entrenado solo
con el corpus original contra el modelo que suma esas etiquetas (validación cruzada 5 x 5
sobre los posts reales). Uso: python modelo/comparar_validacion.py"""
import csv, sys
import numpy as np
from sklearn.model_selection import StratifiedKFold
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parents[1]))
from modelo.lsi_knn import ClasificadorGrafoKNN
from modelo.preprocesamiento import procesar
def leer(r):
    f = list(csv.DictReader(open(r, encoding="utf-8-sig", newline="")))
    return [procesar(x["texto"]) for x in f if x["etiqueta"] in ("0","1")], np.array([int(x["etiqueta"]) for x in f if x["etiqueta"] in ("0","1")])
Ta, ya = leer("modelo/corpus/anotados_800.csv")
Tn, yn = leer("modelo/validacion/lote_01_etiquetado.csv")
cfg = dict(medida="lsi", k=9, componentes=300, ponderado=True)
def m(y, p):
    tp=((p==1)&(y==1)).sum(); tn=((p==0)&(y==0)).sum(); fp=((p==1)&(y==0)).sum(); fn=((p==0)&(y==1)).sum()
    return (tp+tn)/len(y), tp/max(tp+fp,1), tp/max(tp+fn,1), fp, fn
A=[];B=[]
for rep in range(5):
    for tr, te in StratifiedKFold(5, shuffle=True, random_state=rep).split(Tn, yn):
        c = ClasificadorGrafoKNN(**cfg); c.fit(Ta, ya); A.append(m(yn[te], c.predict([Tn[i] for i in te])))
        c = ClasificadorGrafoKNN(**cfg); c.fit(Ta + [Tn[i] for i in tr], np.concatenate([ya, yn[tr]])); B.append(m(yn[te], c.predict([Tn[i] for i in te])))
for n, R in (("solo corpus original (797)", A), ("corpus + tus etiquetas", B)):
    R = np.array(R, dtype=float)
    print(f"{n:32s} exactitud {R[:,0].mean():.3f}  precisión {R[:,1].mean():.3f}  sensibilidad {R[:,2].mean():.3f}  falsos+ {R[:,3].sum()/5:.1f}  falsos- {R[:,4].sum()/5:.1f}")

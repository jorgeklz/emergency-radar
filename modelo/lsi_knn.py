"""
Clasificador semisupervisado basado en grafo kNN (fases 3 y 4 del paper).

Para cada publicación nueva se buscan las k publicaciones más parecidas del
corpus etiquetado y se le asigna, por mayoría, la etiqueta de esos vecinos
(emergencia / no emergencia). La similitud entre textos puede medirse con:

- "coseno": bolsa de palabras y similitud coseno.
- "tfidf":  vectores TF-IDF y similitud coseno.
- "lsi":    Latent Semantic Indexing (TF-IDF reducido con SVD truncada).
            Es la mejor configuración del paper (LSI con k = 7).

Se mantiene la regla del código original (iniciador.py): un vecino con
similitud menor o igual a `umbral` vota "no emergencia", porque no se parece
lo suficiente como para respaldar una alerta.

Mejoras respecto al original:
- Una sola matriz dispersa y operaciones vectorizadas en lugar de recorrer
  vecinos en Python, y sin redondear similitudes a 2 decimales.
- Voto ponderado por similitud opcional (`ponderado=True`), que el paper
  propone como trabajo futuro para datos desbalanceados.
- `explicar()` devuelve los vecinos que decidieron la etiqueta, para que una
  persona pueda verificar cada alerta (la interpretabilidad que el paper
  destaca frente a modelos de caja negra).
"""
import numpy as np
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.preprocessing import normalize

MEDIDAS = ("coseno", "tfidf", "lsi")


class ClasificadorGrafoKNN:
    def __init__(self, k=7, medida="lsi", componentes=100, umbral=0.20, ponderado=False, semilla=0):
        if medida not in MEDIDAS:
            raise ValueError(f"medida debe ser una de {MEDIDAS}")
        self.k = k
        self.medida = medida
        self.componentes = componentes
        self.umbral = umbral
        self.ponderado = ponderado
        self.semilla = semilla

    # ------------------------------------------------------------------
    def fit(self, textos, etiquetas):
        """`textos` ya preprocesados (ver preprocesamiento.procesar)."""
        self.etiquetas_ = np.asarray(etiquetas, dtype=int)
        if self.medida == "coseno":
            self._vectorizador = CountVectorizer(binary=False)
        else:
            self._vectorizador = TfidfVectorizer(sublinear_tf=True)
        matriz = self._vectorizador.fit_transform(textos)
        self._svd = None
        if self.medida == "lsi":
            n = max(2, min(self.componentes, matriz.shape[1] - 1, matriz.shape[0] - 1))
            self._svd = TruncatedSVD(n_components=n, random_state=self.semilla)
            matriz = self._svd.fit_transform(matriz)
        self._corpus = normalize(matriz)
        return self

    def _vectorizar(self, textos):
        matriz = self._vectorizador.transform(textos)
        if self._svd is not None:
            matriz = self._svd.transform(matriz)
        return normalize(matriz)

    def similitudes(self, textos):
        """Matriz (publicaciones nuevas x corpus) de similitud coseno."""
        sim = self._vectorizar(textos) @ self._corpus.T
        return sim.toarray() if hasattr(sim, "toarray") else np.asarray(sim)

    def vecinos(self, textos, k=None):
        """Índices y similitudes de los k vecinos más cercanos, ordenados."""
        k = min(k or self.k, len(self.etiquetas_))
        sim = self.similitudes(textos)
        idx = np.argpartition(-sim, kth=k - 1, axis=1)[:, :k]
        filas = np.arange(sim.shape[0])[:, None]
        orden = np.argsort(-sim[filas, idx], axis=1)
        idx = idx[filas, orden]
        return idx, sim[filas, idx]

    def predict_proba(self, textos):
        """Probabilidad de emergencia: proporción (o peso) de votos de emergencia."""
        idx, sim = self.vecinos(textos)
        votos = self.etiquetas_[idx].astype(float)
        votos[sim <= self.umbral] = 0.0
        if self.ponderado:
            pesos = np.clip(sim, 1e-9, None)
            return (votos * pesos).sum(axis=1) / pesos.sum(axis=1)
        return votos.mean(axis=1)

    def predict(self, textos):
        return (self.predict_proba(textos) > 0.5).astype(int)

    def explicar(self, texto, textos_corpus):
        """Vecinos que decidieron la etiqueta de un texto, para revisión humana."""
        idx, sim = self.vecinos([texto])
        return [
            {"texto": textos_corpus[i], "etiqueta": int(self.etiquetas_[i]), "similitud": round(float(s), 3)}
            for i, s in zip(idx[0], sim[0])
        ]

    def descripcion(self):
        partes = [f"{self.medida.upper()}", f"k={self.k}"]
        if self.medida == "lsi":
            partes.append(f"{self.componentes} dimensiones")
        if self.ponderado:
            partes.append("voto ponderado")
        return ", ".join(partes)

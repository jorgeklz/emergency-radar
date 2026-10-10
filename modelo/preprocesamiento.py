"""
Preprocesamiento de publicaciones en español (fase 2 del paper).

Port de data_features.py, optimizado para el caso real del proyecto:

- El original estaba pensado para inglés (stopwords en inglés, lematizador
  WordNet, contracciones con pycontractions y un modelo GloVe de 100 MB).
  Las publicaciones son de Ecuador y en español, así que se usan stopwords en
  español y el stemmer Snowball para español, que es lo que describe el paper
  ("cada token se redujo a su raíz") y no necesita descargar modelos.
- Los hashtags no se borran: se conserva la palabra sin el "#", porque en X
  suelen llevar la información clave (#Incendio, #Guayaquil).
- Se quitan tildes para que "tránsito" y "transito" cuenten igual.
- Se conservan las funciones de n-gramas del script original.
"""
import re
import unicodedata
from functools import lru_cache
from pathlib import Path

from nltk.stem.snowball import SpanishStemmer

_RUTA_STOPWORDS = Path(__file__).with_name("stopwords_es.txt")
_URL = re.compile(r"(\w+://\S+)|(www\.\S+)")
_MENCION = re.compile(r"@\w+")
_NO_LETRA = re.compile(r"[^a-zñ\s]")
_ESPACIOS = re.compile(r"\s+")


def _sin_tildes(texto):
    # Conserva la ñ: se protege antes de normalizar y se restaura después.
    texto = texto.replace("ñ", "\0")
    texto = unicodedata.normalize("NFKD", texto)
    texto = "".join(c for c in texto if not unicodedata.combining(c))
    return texto.replace("\0", "ñ")


@lru_cache(maxsize=1)
def stopwords():
    palabras = set()
    for linea in _RUTA_STOPWORDS.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()
        if linea and not linea.startswith("#"):
            palabras.add(_sin_tildes(linea))
    return frozenset(palabras)


_stemmer = SpanishStemmer()


@lru_cache(maxsize=50000)
def _raiz(palabra):
    return _stemmer.stem(palabra)


def limpiar_texto(texto):
    """Equivale a eliminar_textos_basura(): quita URLs, menciones, emojis,
    números y signos; pasa a minúsculas y quita tildes."""
    texto = str(texto or "").lower()
    texto = _URL.sub(" ", texto)
    texto = _MENCION.sub(" ", texto)
    texto = texto.replace("#", " ")
    texto = _sin_tildes(texto)
    texto = _NO_LETRA.sub(" ", texto)
    return _ESPACIOS.sub(" ", texto).strip()


def tokenizar(texto):
    """Tokens limpios, sin stopwords y de al menos 2 letras."""
    vacias = stopwords()
    return [t for t in limpiar_texto(texto).split() if len(t) > 1 and t not in vacias]


def procesar(texto):
    """Texto listo para el modelo: limpio, sin stopwords y reducido a raíces."""
    return " ".join(_raiz(t) for t in tokenizar(texto))


def ngramas(tokens, n):
    """Equivale a nltk.util.ngrams del script original, sin dependencias."""
    return [tuple(tokens[i:i + n]) for i in range(len(tokens) - n + 1)]

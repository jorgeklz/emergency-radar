"""Pruebas del modelo (sin red): python -m unittest modelo.test_modelo"""
import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from modelo import clasificar, corpus, preprocesamiento as pp
from modelo.evaluacion import interpretar_kappa, kappa_light, metricas
from modelo.lsi_knn import ClasificadorGrafoKNN


class Preprocesamiento(unittest.TestCase):
    def test_limpia_urls_menciones_emojis_y_tildes(self):
        t = pp.limpiar_texto("🚨 @Bomberos Incendio en #Guayaquil, ¡atención! https://t.co/x 2026 Ñandú")
        self.assertEqual(t, "incendio en guayaquil atencion ñandu")

    def test_quita_stopwords_pero_conserva_no(self):
        self.assertEqual(pp.tokenizar("no hay heridos en el choque"), ["no", "heridos", "choque"])

    def test_raices(self):
        self.assertEqual(pp.procesar("Incendiaron casas"), pp.procesar("incendio casa"))
        self.assertEqual(pp.ngramas(["a", "b", "c"], 2), [("a", "b"), ("b", "c")])


class Clasificador(unittest.TestCase):
    textos = ["incendio casa bomberos", "choque bus heridos via", "asalto robo celular policia",
              "partido futbol gol", "feliz cumpleaños amor", "concierto musica noche"]
    y = [1, 1, 1, 0, 0, 0]

    def test_todas_las_medidas_separan_un_caso_simple(self):
        for medida in ("coseno", "tfidf", "lsi"):
            m = ClasificadorGrafoKNN(k=1, medida=medida, componentes=4).fit(self.textos, self.y)
            self.assertEqual(list(m.predict(["incendio bomberos", "gol partido"])), [1, 0], medida)

    def test_umbral_hace_votar_no_emergencia_a_vecinos_lejanos(self):
        m = ClasificadorGrafoKNN(k=3, medida="tfidf", umbral=0.2).fit(self.textos, self.y)
        self.assertEqual(m.predict_proba(["texto sin relacion alguna"])[0], 0.0)

    def test_explicar_devuelve_k_vecinos_ordenados(self):
        m = ClasificadorGrafoKNN(k=3, medida="tfidf").fit(self.textos, self.y)
        vecinos = m.explicar("incendio casa", self.textos)
        self.assertEqual(len(vecinos), 3)
        self.assertEqual(vecinos[0]["texto"], "incendio casa bomberos")
        self.assertGreaterEqual(vecinos[0]["similitud"], vecinos[1]["similitud"])


class Evaluacion(unittest.TestCase):
    def test_metricas(self):
        r = metricas(np.array([1, 1, 0, 0]), np.array([1, 0, 0, 1]), np.array([.9, .4, .1, .6]))
        self.assertAlmostEqual(r["accuracy"], 0.5)
        self.assertAlmostEqual(r["recall"], 0.5)
        self.assertAlmostEqual(r["specificity"], 0.5)

    def test_kappa_light_es_el_promedio_de_pares(self):
        acuerdo_total = np.array([[1, 1, 1], [0, 0, 0], [1, 1, 1], [0, 0, 0]])
        self.assertAlmostEqual(kappa_light(acuerdo_total), 1.0)
        self.assertEqual(interpretar_kappa(0.82), "Fuerte")


class Integracion(unittest.TestCase):
    def test_corpus_incluido(self):
        textos, etiquetas, anotaciones = corpus.cargar()
        self.assertGreater(len(textos), 700)
        self.assertEqual(set(etiquetas), {0, 1})
        self.assertEqual(len(anotaciones[0]), 9)

    def test_clasificar_agrega_etiquetas_y_no_reescribe_si_no_hay_cambios(self):
        datos = {"publicaciones": [
            {"id": "1", "texto": "Grave accidente de tránsito en la vía a la costa, hay heridos y llegó la ambulancia"},
            {"id": "2", "texto": "Qué lindo día para ir a la playa con la familia"}]}
        with tempfile.TemporaryDirectory() as d:
            ruta = Path(d) / "posts.json"
            ruta.write_text(json.dumps(datos), encoding="utf-8")
            self.assertEqual(clasificar.main(ruta), 2)
            res = json.loads(ruta.read_text(encoding="utf-8"))
            p = {x["id"]: x for x in res["publicaciones"]}
            self.assertTrue(p["1"]["emergencia"])
            self.assertFalse(p["2"]["emergencia"])
            self.assertIn("huella", res["modelo"])
            self.assertEqual(clasificar.main(ruta), 0)


if __name__ == "__main__":
    unittest.main()

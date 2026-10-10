// Pruebas del motor de pre alertas: node --test tests/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const A = require("../assets/js/alertas.js");
const H = 3600 * 1000;
const FIN = new Date("2026-10-10T18:00:00Z");
const CATS = [{ id: "asaltos", nombre: "Asaltos" }, { id: "incendios", nombre: "Incendios" }];
const post = (horasAtras, cat, ciudad = "Quito", texto = "reporte") =>
  ({ fecha: new Date(FIN - horasAtras * H), categoria: cat, ciudad, texto, autor: { verificado: false } });

test("usa la misma franja de días anteriores como línea base", () => {
  const posts = [];
  for (let d = 1; d <= 3; d++) posts.push(post(24 * d + 1, "asaltos"), post(24 * d + 2, "asaltos")); // 2 por día a esta hora
  for (let i = 0; i < 9; i++) posts.push(post(i * 0.5 + 0.1, "asaltos", "Guayaquil")); // 9 hoy
  // Datos desde hace 3,5 días: hay 3 días completos para comparar.
  const r = A.calcular(posts, { fin: FIN, horas: 6, inicioDatos: new Date(FIN - 84 * H), categorias: CATS });
  const asaltos = r.categorias.find((c) => c.categoria.id === "asaltos");
  assert.equal(asaltos.base.tipo, "dias");
  assert.equal(asaltos.base.esperado, 2);
  assert.equal(asaltos.observado, 9);
  assert.equal(asaltos.nivel.id, "alta");
  assert.equal(r.categorias[0].categoria.id, "asaltos"); // lo más grave primero
  assert.equal(r.zonas[0].ciudad, "Guayaquil");
});

test("sin días previos compara con la ventana anterior, y sin datos no inventa un nivel", () => {
  const inicio = new Date(FIN - 8 * H);
  const previo = A.calcular([post(1, "incendios"), post(7, "incendios")], { fin: FIN, horas: 1, inicioDatos: inicio, categorias: CATS });
  assert.equal(previo.categorias.find((c) => c.categoria.id === "incendios").base.tipo, "previo");
  const nada = A.calcular([post(1, "incendios")], { fin: FIN, horas: 6, inicioDatos: new Date(FIN - 7 * H), categorias: CATS });
  assert.equal(nada.categorias.find((c) => c.categoria.id === "incendios").nivel.id, "sinbase");
});

test("detecta aceleración y menciones de heridos o fallecidos", () => {
  const posts = [post(0.2, "asaltos", "Quito", "hay dos heridos"), post(0.4, "asaltos", "Quito", "un fallecido"),
    post(0.6, "asaltos", "Quito", "víctima en la vía"), post(5, "asaltos")];
  const r = A.calcular(posts, { fin: FIN, horas: 6, inicioDatos: new Date(FIN - 6 * H), categorias: CATS });
  const a = r.categorias.find((c) => c.categoria.id === "asaltos");
  assert.equal(a.graves, 3);
  assert.equal(a.aceleracion.acelera, true);
  assert.equal(a.nivel.id, "atencion");
});

test("una actividad normal queda en Normal", () => {
  const posts = [];
  for (let d = 0; d <= 3; d++) posts.push(post(24 * d + 1, "asaltos"), post(24 * d + 3, "asaltos"));
  const r = A.calcular(posts, { fin: FIN, horas: 6, inicioDatos: new Date(FIN - 5 * 24 * H), categorias: CATS });
  assert.equal(r.categorias.find((c) => c.categoria.id === "asaltos").nivel.id, "normal");
});

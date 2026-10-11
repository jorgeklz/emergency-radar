// Pruebas del recolector (sin red): node --test collector/*.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { clasificar, ubicar, transformar, combinar, buscar, ErrorAPI } from "./x-collector.mjs";

test("clasifica por palabras clave", () => {
  assert.equal(clasificar("Acaban de ASALTAR a una señora en Urdesa"), "asaltos");
  assert.equal(clasificar("Incendio en una bodega del centro"), "incendios");
  assert.equal(clasificar("Choque entre un bus y un auto en la vía Daule"), "accidentes");
  assert.equal(clasificar("Fuerte sismo se sintió en Manta"), "desastres");
  assert.equal(clasificar("Hoy hay partido de fútbol"), null);
  assert.equal(clasificar("Nuevo robot en la feria"), null);
});

test("ubica por ciudad mencionada, lugar o coordenadas", () => {
  const a = ubicar({ id: "1", text: "Asalto en Durán, cuidado" }, null);
  assert.equal(a.ciudad, "Durán");
  assert.ok(Math.abs(a.lat - -2.172) < 0.05);
  const b = ubicar({ id: "2", text: "Choque fuerte" }, { name: "Portoviejo", full_name: "Portoviejo, Ecuador", country_code: "EC", geo: { bbox: [-80.5, -1.1, -80.4, -1.0] } });
  assert.equal(b.ciudad, "Portoviejo");
  assert.ok(Math.abs(b.lat - -1.05) < 1e-9);
  const c = ubicar({ id: "3", text: "Temblor", geo: { coordinates: { coordinates: [-79.9, -2.2] } } }, null);
  assert.deepEqual([c.lat, c.lng], [-2.2, -79.9]);
  assert.equal(ubicar({ id: "4", text: "Incendio" }, null).lat, null);
  assert.equal(ubicar({ id: "5", text: "Robo en #Guayaquil hoy" }, null).ciudad, "Guayaquil");
  // Nombres ambiguos: solo cuentan con mayúscula inicial.
  assert.equal(ubicar({ id: "6", text: "Sismo fuerte, es un milagro que no haya víctimas" }, null).ciudad, "Sin ubicación");
  assert.equal(ubicar({ id: "7", text: "Choque en la vía a Milagro esta mañana" }, null).ciudad, "Milagro");
  assert.equal(ubicar({ id: "8", text: "Incendio en #Manta, bomberos en camino" }, null).ciudad, "Manta");
  assert.equal(ubicar({ id: "9", text: "Le quitó la comida y me quito el sombrero" }, null).ciudad, "Sin ubicación");
  assert.equal(ubicar({ id: "10", text: "Operativo en Quito: aprehenden a sospechoso" }, null).ciudad, "Quito");
});

const RESPUESTA = {
  data: [
    { id: "100", text: "Incendio en Quito norte", author_id: "u1", created_at: "2026-10-09T15:00:00.000Z" },
    { id: "101", text: "Qué lindo día", author_id: "u1", created_at: "2026-10-09T15:01:00.000Z" }
  ],
  includes: { users: [{ id: "u1", name: "Ana", username: "ana_ec", verified: true }] },
  meta: { newest_id: "101", result_count: 2 }
};

test("transforma la respuesta y descarta lo que no es emergencia", () => {
  const r = transformar(RESPUESTA);
  assert.equal(r.length, 1);
  assert.equal(r[0].categoria, "incendios");
  assert.equal(r[0].ciudad, "Quito");
  assert.equal(r[0].url, "https://x.com/ana_ec/status/100");
  assert.deepEqual(r[0].autor, { nombre: "Ana", usuario: "ana_ec", verificado: true });
});

test("busca con since_id, pagina y usa el token solo en la cabecera", async () => {
  const llamadas = [];
  const fetchImpl = async (url, opts) => {
    llamadas.push({ url, opts });
    const pag2 = url.includes("next_token");
    return { ok: true, json: async () => pag2 ? { data: [], meta: {} } : { ...RESPUESTA, meta: { ...RESPUESTA.meta, next_token: "abc" } } };
  };
  const r = await buscar({ token: "SECRETO", consulta: "incendio", sinceId: "99", maxPaginas: 3, fetchImpl });
  assert.equal(llamadas.length, 2);
  assert.ok(llamadas[0].url.includes("since_id=99"));
  assert.ok(!llamadas[0].url.includes("SECRETO"));
  assert.equal(llamadas[0].opts.headers.Authorization, "Bearer SECRETO");
  assert.equal(r.masReciente, "101");
  assert.equal(r.publicaciones.length, 1);
});

test("propaga errores de la API con su estado", async () => {
  const fetchImpl = async () => ({ ok: false, status: 429, headers: { get: () => "1700000000" }, json: async () => ({ title: "Too Many Requests" }) });
  await assert.rejects(buscar({ token: "t", consulta: "q", maxPaginas: 1, fetchImpl }), (e) => e instanceof ErrorAPI && e.estado === 429);
});

test("combina sin duplicados y respeta la retención", () => {
  const ahora = new Date("2026-10-10T00:00:00Z");
  const viejo = { id: "1", fecha: "2026-08-01T00:00:00Z" };
  const a = { id: "2", fecha: "2026-10-08T00:00:00Z", texto: "a" };
  const a2 = { id: "2", fecha: "2026-10-08T00:00:00Z", texto: "a actualizado" };
  const b = { id: "3", fecha: "2026-10-09T00:00:00Z" };
  const r = combinar([viejo, a], [a2, b], 30, ahora);
  assert.deepEqual(r.map((p) => p.id), ["3", "2"]);
  assert.equal(r[1].texto, "a actualizado");
});

test("sin créditos (402) termina sin error y sin tocar el archivo", async () => {
  const { main } = await import("./x-collector.mjs");
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 402, headers: { get: () => null }, json: async () => ({ title: "credits depleted" }) });
  try {
    assert.deepEqual(await main({ X_BEARER_TOKEN: "t" }), { cambios: 0 });
  } finally {
    globalThis.fetch = original;
  }
});

test("reparte los lugares en grupos que se turnan y caben en 512 caracteres", async () => {
  const m = await import("./x-collector.mjs");
  for (const g of m.GRUPOS_CONSULTA) assert.ok(m.consultaDeGrupo(g).length <= 512, g.id);
  const t0 = new Date("2026-10-11T00:00:00Z");
  const vistos = new Set([0, 1, 2].map((k) => m.grupoDelTurno(new Date(t0.getTime() + k * 1800000)).id));
  assert.equal(vistos.size, m.GRUPOS_CONSULTA.length);
});

test("reubica por texto los posts sin ubicación con el catálogo actual", async () => {
  const m = await import("./x-collector.mjs");
  const ps = [
    { id: "1", texto: "Choque en la vía a Ambato deja dos heridos", ciudad: "Sin ubicación", lat: null, lng: null },
    { id: "2", texto: "Incendio en Nueva Loja", ciudad: "Sin ubicación", lat: null, lng: null },
    { id: "3", texto: "Robo en un local", ciudad: "Sin ubicación", lat: null, lng: null }
  ];
  assert.equal(m.reubicar(ps), 2);
  assert.equal(ps[0].ciudad, "Ambato");
  assert.equal(ps[1].ciudad, "Nueva Loja");
  assert.equal(ps[2].ciudad, "Sin ubicación");
});

test("cantones con nombres de otros países solo cuentan con su provincia o Ecuador", async () => {
  const m = await import("./x-collector.mjs");
  assert.equal(m.ciudadEnTexto("Incendio en Santa Ana, California"), null);
  assert.equal(m.ciudadEnTexto("Incendio en Santa Ana, Manabí").nombre, "Santa Ana");
  assert.equal(m.ciudadEnTexto("Choque en Pedernales deja tres heridos").nombre, "Pedernales");
  assert.equal(m.ciudadEnTexto("Asalto en Sangolquí").nombre, "Sangolquí");
});

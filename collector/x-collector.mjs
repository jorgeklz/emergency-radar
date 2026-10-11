#!/usr/bin/env node
/*
 * Emergency Radar · recolector de posts de X
 * ------------------------------------------------------------------
 * Consulta el endpoint de búsqueda reciente de la API v2 de X, clasifica cada
 * publicación en una categoría de emergencia, la ubica en una ciudad y guarda
 * el resultado en data/posts.json, que es lo que lee el sitio.
 *
 * La credencial se lee SOLO de variables de entorno; nunca se escribe en disco:
 *   X_BEARER_TOKEN   Bearer token de la app de X (obligatorio)
 *   X_QUERY          Consulta de búsqueda (opcional, hay una por defecto)
 *   X_MAX_PAGES      Páginas de 100 resultados por ejecución (opcional, 2)
 *   X_RETENCION_DIAS Días que se conservan en el archivo (opcional, 30)
 *
 * Uso local:  X_BEARER_TOKEN=xxxx node collector/x-collector.mjs
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { CATEGORIAS, CIUDADES } = require(resolve(RAIZ, "assets/js/catalogo.js"));

export const ARCHIVO = resolve(RAIZ, "data/posts.json");
export const ENDPOINT = "https://api.x.com/2/tweets/search/recent";
export const MAX_PUBLICACIONES = 5000;

// Para cubrir todo Ecuador sin gastar más de la API, los lugares se reparten en grupos que
// se turnan: cada captura (cada 30 min) consulta un solo grupo, con el mismo límite de
// páginas de siempre. Cada grupo guarda su propio since_id, así nunca se baja dos veces lo
// mismo. Cada consulta cabe en el límite de 512 caracteres del plan básico de X.
const PALABRAS =
  "(asalto OR robo OR atraco OR incendio OR accidente OR choque OR volcamiento OR atropellado " +
  "OR inundación OR deslave OR sismo OR temblor OR aguaje)";
const SUFIJO = "lang:es -is:retweet";
export const GRUPOS_CONSULTA = [
  { id: "costa", lugares: ["Guayaquil", "Durán", "Samborondón", "Daule", "Milagro", "\"Santa Elena\"", "Salinas", "Babahoyo", "Quevedo",
    "Portoviejo", "Manta", "Chone", "Machala", "Esmeraldas", "\"Santo Domingo\""] },
  { id: "sierra", lugares: ["Quito", "Cuenca", "Ambato", "Riobamba", "Loja", "Ibarra", "Latacunga", "Tulcán", "Azogues", "Guaranda",
    "Otavalo", "Pichincha", "Azuay", "Tungurahua", "Imbabura"] },
  { id: "oriente", lugares: ["Ecuador", "Tena", "Puyo", "Macas", "\"Nueva Loja\"", "\"Lago Agrio\"", "\"El Coca\"", "Orellana",
    "Sucumbíos", "Galápagos", "Pastaza", "Napo", "\"Morona Santiago\"", "\"Zamora Chinchipe\""] }
];
export function consultaDeGrupo(g) { return PALABRAS + " (" + g.lugares.join(" OR ") + ") " + SUFIJO; }
// Turno por reloj (no necesita guardar estado): cambia cada 30 minutos.
export function grupoDelTurno(ahora = new Date()) {
  return GRUPOS_CONSULTA[Math.floor(ahora.getTime() / 1800000) % GRUPOS_CONSULTA.length];
}
// Se mantiene por compatibilidad: la consulta del primer grupo.
export const CONSULTA_POR_DEFECTO = consultaDeGrupo(GRUPOS_CONSULTA[0]);

export function normalizar(t) {
  return String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const REGLAS = CATEGORIAS.map((c) => ({ id: c.id, regex: c.claves.map((k) => new RegExp(k, "g")) }));

// Devuelve la categoría con más coincidencias de palabras clave, o null si ninguna aplica.
export function clasificar(texto) {
  const t = normalizar(texto);
  let mejor = null;
  let puntos = 0;
  for (const r of REGLAS) {
    const n = r.regex.reduce((s, re) => s + (t.match(re) || []).length, 0);
    if (n > puntos) { mejor = r.id; puntos = n; }
  }
  return mejor;
}

// Desplazamiento pequeño y estable (según el id) para que los puntos de una misma ciudad no se encimen.
function dispersion(id, radio) {
  let h = 2166136261;
  for (const ch of String(id)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = ((h >>> 0) % 3600) / 3600 * 2 * Math.PI;
  const r = (((h >>> 12) % 1000) / 1000) * radio;
  return [Math.sin(a) * r, Math.cos(a) * r];
}

// Nombres que también son palabras comunes: solo valen con mayúscula inicial.
const ESCRITURA_PROPIA = new Map(
  CIUDADES.filter((c) => c.ambiguo).map((c) => [c.nombre, new RegExp(`(^|[^\\p{L}])#?${c.nombre}(?=$|[^\\p{L}])`, "u")])
);

export function ciudadEnTexto(texto) {
  const t = " " + normalizar(texto).replace(/[^a-z0-9#@ ]/g, " ") + " ";
  for (const c of CIUDADES) {
    if (c.ambiguo && !ESCRITURA_PROPIA.get(c.nombre).test(String(texto || ""))) continue;
    for (const alias of c.alias) {
      if (t.includes(" " + alias + " ") || t.includes("#" + alias.replace(/ /g, "") + " ")) return c;
    }
  }
  return null;
}

/*
 * Ubicación por prioridad:
 *  1. Coordenadas exactas de la publicación (poco frecuente).
 *  2. Lugar etiquetado (place) de X: centro de su recuadro.
 *  3. Ciudad mencionada en el texto: centro de la ciudad con una leve dispersión.
 */
export function ubicar(post, lugar) {
  const coords = post.geo && post.geo.coordinates && post.geo.coordinates.coordinates;
  const porTexto = ciudadEnTexto(post.text);
  const porLugar = lugar ? ciudadEnTexto(lugar.full_name || lugar.name) : null;
  const ciudad = porLugar || porTexto;
  if (Array.isArray(coords) && coords.length === 2) {
    return { ciudad: ciudad ? ciudad.nombre : (lugar && lugar.name) || "Sin ubicación", lng: coords[0], lat: coords[1] };
  }
  if (lugar && lugar.geo && Array.isArray(lugar.geo.bbox) && lugar.country_code === "EC") {
    const [o, s, e, n] = lugar.geo.bbox;
    return { ciudad: ciudad ? ciudad.nombre : lugar.name, lat: (s + n) / 2, lng: (o + e) / 2 };
  }
  if (ciudad) {
    const [dy, dx] = dispersion(post.id, ciudad.radio);
    return { ciudad: ciudad.nombre, lat: +(ciudad.lat + dy).toFixed(5), lng: +(ciudad.lng + dx).toFixed(5) };
  }
  return { ciudad: "Sin ubicación", lat: null, lng: null };
}

// Vuelve a ubicar por el texto los posts que quedaron "Sin ubicación" (por ejemplo, al sumar
// ciudades nuevas al catálogo). No usa la API.
export function reubicar(publicaciones) {
  let n = 0;
  for (const p of publicaciones) {
    if (p.ciudad !== "Sin ubicación" || p.lat !== null) continue;
    const c = ciudadEnTexto(p.texto);
    if (!c) continue;
    const [dy, dx] = dispersion(p.id, c.radio);
    Object.assign(p, { ciudad: c.nombre, lat: +(c.lat + dy).toFixed(5), lng: +(c.lng + dx).toFixed(5) });
    n++;
  }
  return n;
}

// Convierte una respuesta de la API en publicaciones del modelo de la app.
export function transformar(respuesta) {
  const usuarios = new Map(((respuesta.includes && respuesta.includes.users) || []).map((u) => [u.id, u]));
  const lugares = new Map(((respuesta.includes && respuesta.includes.places) || []).map((p) => [p.id, p]));
  const salida = [];
  for (const t of respuesta.data || []) {
    const categoria = clasificar(t.text);
    if (!categoria) continue;
    const u = usuarios.get(t.author_id) || {};
    const lugar = t.geo && t.geo.place_id ? lugares.get(t.geo.place_id) : null;
    const pos = ubicar(t, lugar);
    salida.push({
      id: t.id,
      autor: { nombre: u.name || u.username || "Usuario de X", usuario: u.username || "", verificado: !!u.verified },
      texto: t.text,
      fecha: t.created_at,
      categoria,
      ciudad: pos.ciudad,
      lat: pos.lat,
      lng: pos.lng,
      url: u.username ? `https://x.com/${u.username}/status/${t.id}` : `https://x.com/i/web/status/${t.id}`
    });
  }
  return salida;
}

export class ErrorAPI extends Error {
  constructor(estado, mensaje, reinicio) {
    super(mensaje);
    this.estado = estado;
    this.reinicio = reinicio;
  }
}

// Recorre las páginas de la búsqueda reciente a partir de `sinceId`.
export async function buscar({ token, consulta, sinceId, maxPaginas, fetchImpl = fetch }) {
  const publicaciones = [];
  let siguiente = null;
  let masReciente = null;
  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    const params = new URLSearchParams({
      query: consulta,
      max_results: "100",
      "tweet.fields": "created_at,author_id,geo,lang", // nombre del parámetro en la API de X
      expansions: "author_id,geo.place_id",
      "user.fields": "name,username,verified",
      "place.fields": "full_name,name,geo,country_code"
    });
    if (sinceId) params.set("since_id", sinceId);
    if (siguiente) params.set("next_token", siguiente);
    const r = await fetchImpl(`${ENDPOINT}?${params}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) {
      let detalle = "";
      try { const j = await r.json(); detalle = j.detail || j.title || JSON.stringify(j); } catch { /* sin cuerpo */ }
      const reinicio = r.headers && r.headers.get ? r.headers.get("x-rate-limit-reset") : null;
      throw new ErrorAPI(r.status, `La API de X respondió ${r.status}: ${detalle}`, reinicio);
    }
    const json = await r.json();
    if (pagina === 0 && json.meta && json.meta.newest_id) masReciente = json.meta.newest_id;
    publicaciones.push(...transformar(json));
    siguiente = json.meta && json.meta.next_token;
    if (!siguiente) break;
  }
  return { publicaciones, masReciente };
}

// Une lo nuevo con lo existente, sin duplicados, ordenado y recortado por antigüedad y tamaño.
export function combinar(existentes, nuevas, retencionDias, ahora = new Date()) {
  const limite = ahora.getTime() - retencionDias * 86400000;
  const porId = new Map();
  for (const p of [...existentes, ...nuevas]) porId.set(p.id, p);
  return [...porId.values()]
    .filter((p) => new Date(p.fecha).getTime() >= limite)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
    .slice(0, MAX_PUBLICACIONES);
}

export async function leerArchivo(ruta = ARCHIVO) {
  try {
    return JSON.parse(await readFile(ruta, "utf8"));
  } catch {
    return { publicaciones: [] };
  }
}

export async function main(env = process.env) {
  const token = (env.X_BEARER_TOKEN || "").trim();
  if (!token) {
    console.log("::warning::Falta X_BEARER_TOKEN. Agrega el secreto en Settings > Secrets and variables > Actions. No se capturó nada.");
    return { cambios: 0 };
  }
  // Con X_QUERY definida se usa esa sola consulta; si no, el grupo que toca en este turno.
  const propia = (env.X_QUERY || "").trim();
  const grupo = propia ? null : grupoDelTurno();
  const consulta = propia || consultaDeGrupo(grupo);
  const maxPaginas = Math.max(1, parseInt(env.X_MAX_PAGES || "2", 10) || 2);
  const retencion = Math.max(1, parseInt(env.X_RETENCION_DIAS || "30", 10) || 30);

  const previo = await leerArchivo();
  const ids = Object.assign({}, previo.ultimosIds || {});
  // Un grupo nuevo arranca desde el último post ya capturado: no se descargan los 7 días
  // anteriores, así la primera vuelta no gasta lecturas extra.
  const sinceId = grupo ? (ids[grupo.id] || previo.ultimoId || null) : (previo.ultimoId || null);
  if (grupo) console.log(`Grupo de lugares en este turno: ${grupo.id}.`);
  let resultado;
  try {
    resultado = await buscar({ token, consulta, sinceId, maxPaginas });
  } catch (e) {
    if (e instanceof ErrorAPI && e.estado === 429) {
      const cuando = e.reinicio ? new Date(+e.reinicio * 1000).toISOString() : "más tarde";
      console.log(`::warning::Límite de solicitudes de X alcanzado. Se reintentará en la próxima ejecución (reinicio: ${cuando}).`);
      return { cambios: 0 };
    }
    // Sin créditos la ejecución no falla: así no llega un correo de error en cada captura.
    if (e instanceof ErrorAPI && e.estado === 402) {
      console.log(`::warning::${e.message}. La cuenta de X no tiene créditos disponibles; recárgalos en el portal de desarrolladores de X. No se capturó nada.`);
      return { cambios: 0 };
    }
    if (e instanceof ErrorAPI && (e.estado === 401 || e.estado === 403)) {
      console.log(`::error::${e.message}. Revisa que el token sea válido y que tu plan de la API de X permita la búsqueda reciente.`);
    }
    throw e;
  }

  // Sin publicaciones nuevas en X no se reescribe el archivo, así no hay commits vacíos.
  if (!resultado.masReciente || resultado.masReciente === sinceId) {
    console.log("No hay publicaciones nuevas en X desde la última captura.");
    return { cambios: 0 };
  }
  if (grupo) ids[grupo.id] = resultado.masReciente;
  const publicaciones = combinar(previo.publicaciones || [], resultado.publicaciones, retencion);
  const reubicadas = reubicar(publicaciones);
  if (reubicadas) console.log(`Reubicadas por texto: ${reubicadas}.`);
  const salida = {
    generado: new Date().toISOString(),
    fuente: "x-api-v2/search/recent",
    consulta,
    ultimoId: grupo ? (previo.ultimoId || null) : resultado.masReciente,
    ultimosIds: ids,
    // Se conserva el bloque del modelo para que solo se clasifique lo nuevo.
    ...(previo.modelo ? { modelo: previo.modelo } : {}),
    publicaciones
  };
  await mkdir(dirname(ARCHIVO), { recursive: true });
  await writeFile(ARCHIVO, JSON.stringify(salida) + "\n");
  console.log(`Capturadas ${resultado.publicaciones.length} publicaciones nuevas clasificadas. Total en archivo: ${publicaciones.length}.`);
  return { cambios: resultado.publicaciones.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

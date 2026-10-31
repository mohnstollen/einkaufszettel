/* Cloudflare Worker für den Einkaufszettel: liest das Rezept einer Webseite aus.
   Aufruf: GET <worker-url>/?url=https://www.chefkoch.de/rezepte/…
   Antwort: { name, ingredients: ['500 g Hackfleisch', …], yield, url } oder { error }

   Fast alle Rezeptseiten beschreiben ihr Rezept maschinenlesbar nach schema.org/Recipe
   (JSON-LD, seltener Microdata). Der Worker gibt nur diese Angaben zurück, nicht die Seite –
   er taugt also nicht als offener Proxy. Einrichtung siehe README. */

// Seiten, die den Worker nutzen dürfen (Browser senden den Origin-Header automatisch mit)
const ALLOWED_ORIGINS = ['https://mohnstollen.github.io'];
const MAX_BYTES = 4_000_000;
const TIMEOUT_MS = 10_000;

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const allowed = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = { 'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGINS[0], 'Vary': 'Origin' };
    if (request.method === 'OPTIONS') return new Response(null, { headers: { ...cors, 'Access-Control-Allow-Methods': 'GET' } });
    if (!allowed) return json({ error: 'origin' }, 403, cors);
    if (request.method !== 'GET') return json({ error: 'method' }, 405, cors);

    let target;
    try { target = new URL(new URL(request.url).searchParams.get('url')); } catch { return json({ error: 'url' }, 400, cors); }
    if (!/^https?:$/.test(target.protocol)) return json({ error: 'url' }, 400, cors);

    let res;
    try {
      res = await fetch(target.href, {
        headers: {
          // wie ein normaler Handy-Browser – manche Seiten liefern Bots sonst nichts aus
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'de-DE,de;q=0.9'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });
    } catch { return json({ error: 'fetch' }, 502, cors); }
    if (!res.ok) return json({ error: 'status', status: res.status }, 502, cors);

    const recipe = extractRecipe(await readText(res, MAX_BYTES));
    if (!recipe) return json({ error: 'norecipe' }, 404, cors);
    return json({ ...recipe, url: res.url || target.href }, 200, cors);
  }
};

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' } });
}

/* Seite lesen, aber höchstens maxBytes (Schutz vor riesigen Antworten) */
async function readText(res, maxBytes) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); size += value.length;
  }
  reader.cancel().catch(() => {});
  const all = new Uint8Array(size);
  let pos = 0;
  for (const c of chunks) { all.set(c.subarray(0, Math.min(c.length, size - pos)), pos); pos += c.length; }
  return new TextDecoder().decode(all);
}

function extractRecipe(html) {
  // 1. JSON-LD (Chefkoch, WordPress-Rezeptplugins, die meisten großen Seiten)
  const scripts = html.matchAll(/<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    const recipe = findRecipe(parseJson(m[1]));
    const out = recipe && normalize(recipe);
    if (out) return out;
  }
  // 2. Microdata (itemprop="recipeIngredient")
  return microdata(html);
}

function parseJson(text) {
  const t = text.trim().replace(/^<!\[CDATA\[|\]\]>$/g, '');
  try { return JSON.parse(t); } catch {}
  try { return JSON.parse(t.replace(/[\u0000-\u001f]+/g, ' ')); } catch {} // Zeilenumbrüche in Strings
  return null;
}

/* Rezept-Objekt in beliebig verschachteltem JSON-LD finden (@graph, Arrays, mainEntity …) */
function findRecipe(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipe(n, depth + 1); if (r) return r; }
    return null;
  }
  const types = [].concat(node['@type'] || []).map(String);
  if (types.some(t => /(^|[/:])recipe$/i.test(t))) return node;
  for (const k of ['@graph', 'mainEntity', 'mainEntityOfPage', 'itemListElement', 'item', 'hasPart']) {
    const r = findRecipe(node[k], depth + 1);
    if (r) return r;
  }
  return null;
}

function normalize(r) {
  const ingredients = [].concat(r.recipeIngredient || r.ingredients || []).map(text).filter(Boolean);
  if (!ingredients.length) return null;
  // „recipeYield“ ist mal „4“, mal „4 Portionen“, mal beides – die Angabe mit Einheit bevorzugen
  const yields = [].concat(r.recipeYield || []).map(text).filter(Boolean);
  const yld = yields.find(y => /[a-zäöü]/i.test(y)) || (yields[0] ? yields[0] + ' Portionen' : '');
  return { name: text(r.name || r.headline), ingredients, yield: yld };
}

function microdata(html) {
  const ingredients = [];
  const re = /<([a-z0-9]+)\b[^>]*itemprop\s*=\s*["'](?:recipeIngredient|ingredients)["'][^>]*>([\s\S]*?)<\/\1>/gi;
  for (const m of html.matchAll(re)) { const t = text(m[2]); if (t) ingredients.push(t); }
  if (!ingredients.length) return null;
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const og = html.match(/<meta[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']*)["']/i);
  return { name: text(h1 ? h1[1] : og ? og[1] : ''), ingredients, yield: '' };
}

/* HTML-Tags entfernen, Entities auflösen, Leerraum zusammenfassen */
function text(v) {
  if (v == null) return '';
  if (typeof v === 'object') v = v.text || v.name || v['@value'] || '';
  return decodeEntities(String(v).replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}
function decodeEntities(s) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', frac12: '½', frac14: '¼', frac34: '¾', deg: '°', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
      : named[e] ?? m);
}

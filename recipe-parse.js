/* Zutaten aus erkanntem oder eingefügtem Rezepttext lesen.
   parseRecipe(text) → { title, items: [{ name, amount }] }
   parseIngredientList(['200 g Mehl', …]) → items (für strukturierte Zutatenlisten von Rezeptseiten)
   textFromOcr(tesseractData) → Text mit getrennten Spalten (für parseRecipe)
   Reine Funktionen ohne DOM – auch mit Node testbar. */

const UNITS = [
  'g', 'gr', 'gramm', 'kg', 'mg', 'ml', 'mi', 'cl', 'dl', 'l', 'liter',
  'el', 'tl', 'e[ßsb]s?[li1](?:öffel)?', 'tee[li1](?:öffel)?', 'msp', 'prisen?', 'pck', 'pkt', 'päckchen', 'packung(?:en)?', 'pkg',
  'dosen?', 'becher', 'bund', 'stück', 'stk', 'zehen?', 'scheiben?', 'tassen?', 'gläser', 'glas',
  'würfel', 'cm', 'handvoll', 'spritzer', 'schuss', 'tropfen', 'blatt', 'blätter', 'stangen?', 'stiele?',
  'zweige?', 'köpfe', 'kopf', 'knollen?', 'beutel', 'flaschen?', 'portionen?', 'rollen?', 'tüten?', 'pfund', 'platten?'
].join('|');
const NUM = '(?:\\d+(?:[.,]\\d+)?(?:\\s*/\\s*\\d+)?|[½¼¾⅓⅔⅛])';
const QTY = NUM + '(?:\\s*' + NUM + ')?(?:\\s*[-–]\\s*' + NUM + ')?';
const UNIT = '(?:(?:' + UNITS + ')\\.?(?=\\s|$|,))';
const LEAD_RE = new RegExp('^(?:ca\\.?\\s*)?(' + QTY + '(?:\\s*' + UNIT + ')?|' + UNIT + ')\\s*', 'i');
const TRAIL_RE = new RegExp('\\s+((?:ca\\.?\\s*)?' + QTY + '\\s*' + UNIT + '?)$', 'i');
const VAGUE_RE = /^(etwas|evtl\.?|eventuell|n\.\s?b\.?|nach belieben|nach geschmack|reichlich|wenig|einige|ein paar|eine[nrsm]?|ein|einige)\s+/i;
const ADJ_RE = /^(\w*gemahlene?[rns]?|\w*gehackte?[rns]?|kleine?[rns]?|große?[rns]?|mittelgroße?[rns]?|frische?[rns]?|reife?[rns]?|weiche?[rns]?|kalte?[rns]?|warme?[rns]?|getrocknete?[rns]?|gemahlene?[rns]?|geriebene?[rns]?|gehackte?[rns]?|zimmerwarme?[rns]?|tiefgekühlte?[rns]?|tk)\s+/i;
const STOP_RE = /^(z?ubereitung|anleitung|so geht'?s|so wird'?s gemacht|arbeitsschritte|schritt\s*1|nährwerte|zubereitungsschritte)\b/i;
const SKIP_RE = /^(z?utaten\b|f?[üu]r\s+\d|\d+\s+(portionen|personen|stück)\b|portionen|personen|arbeitszeit|kochzeit|backzeit|ruhezeit|gesamtzeit|schwierigkeit|kalorien|zubereitungszeit|tipp\b|rezept\b|drucken|teilen|merken|einkaufsliste|(back|spring|kasten|auflauf|tarte)?form\s*:|ø)/i;
// Zwischenüberschrift: „Für den Teig“, „Für die Füllung:“, „FÜR DIE SOSSE“ oder ganz in Großbuchstaben
const isHeading = l => /^f[üu]r\s+(den|die|das)\s/i.test(l) || /:$/.test(l) ||
  (l.length >= 4 && /[A-ZÄÖÜ]{3}/.test(l) && l === l.toUpperCase());

function cleanName(s) {
  s = s.replace(/^[\s\-–•*·▢☐□○◯✓✔]+/, '').replace(/\(.*?\)/g, ' '); // Klammern zuerst – sie enthalten oft Kommas
  s = s.split(/\s*[,;:]\s*|\s+[-–]\s+|\s+oder\s+|\s+zum\s+|\s+für\s+(?:die|den|das)\s+/i)[0];
  s = s.replace(/\(.*?\)/g, ' ').replace(/[()]/g, ' ');
  for (let i = 0; i < 3; i++) s = s.replace(VAGUE_RE, '').replace(ADJ_RE, '');
  s = s.replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '');
  return s ? s[0].toUpperCase() + s.slice(1) : '';
}

/* Eine Zeile → [{ name, amount }] (leer, wenn die Zeile keine Zutat ist).
   strict = false für verlässliche Zutatenlisten: keine Filter gegen OCR-Müll und Anleitungssätze */
function parseLine(line, strict = true) {
  let s = line.replace(/\s+/g, ' ').trim().replace(/^[\-–•*·▢☐□○◯✓✔]+\s*/, '')
    .replace(/([a-zäöü])(?:\/|\()(n|en|e|s|er)\)?(?=[\s,.]|$)/gi, '$1'); // „Zehe/n“, „Dose(n)“ → „Zehe“, „Dose“
  if (!/[a-zäöüß]{2}/i.test(s)) return [];
  if (strict && (s.length > 70 || /https?:|www\.|^\d{1,2}:\d{2}/i.test(s))) return [];
  if (/:$/.test(s)) return []; // Zwischenüberschrift wie „Für die Soße:“
  // „Saft von 1 Zitrone“, „Abrieb einer Orange“ → Zutat Zitrone/Orange, Hinweis in der Menge
  const part = s.match(/^(saft|abrieb|schale|zesten?)\s+(?:von\s+)?(.+)$/i);
  if (part) s = part[2];
  s = s.replace(/^(\d+)\s*[Qq]g?(?=\s)/, '$1 g'); // „g“ als „Qg“ gelesen
  let amount = '';
  const lead = s.match(LEAD_RE);
  if (lead) { amount = lead[1].trim(); s = s.slice(lead[0].length); }
  else {
    const trail = s.match(TRAIL_RE);
    if (trail) { amount = trail[1].trim(); s = s.slice(0, trail.index); }
  }
  amount = amount
    .replace(/^(\d*0)9g$/, '$1 g') // typischer OCR-Fehler: „50 g“ → „509g“
    .replace(/\bmi$/i, 'ml') // „ml“ als „mi“ gelesen
    .replace(/\be[ßsb]s?[li1](?:öffel)?\.?$/i, 'EL') // „Eßl.“, „Esslöffel“, OCR: „EBl.“, „EßI.“
    .replace(/\btee[li1](?:öffel)?\.?$/i, 'TL')
    .replace(/(\d)([a-zäöü])/i, '$1 $2'); // „2EL“ → „2 EL“
  // „2 Zehe/n“ wurde oben zu „Zehe“ – bei mehr als einem Stück wieder Mehrzahl
  amount = amount.replace(/^(\d+(?:[.,]\d+)?|\d+\s*[-–]\s*\d+)\s+(zehe|dose|platte|scheibe|stange|tasse|flasche|knolle|rolle|tüte|prise)$/i,
    (m, n, u) => /[-–]/.test(n) || parseFloat(n.replace(',', '.')) > 1 ? n + ' ' + u + 'n' : m);
  if (part) amount = (amount ? amount + ' ' : '') + '(' + part[1][0].toUpperCase() + part[1].slice(1).toLowerCase() + ')';
  if (strict && s.split(' ').length > 6) return []; // eher ein Satz aus der Anleitung
  // „Salz und Pfeffer“, „Salz, Pfeffer“ ohne Menge → zwei Zutaten
  // (nur Teile mit großem Anfangsbuchstaben – „Parmesan, frisch gerieben“ bleibt eine Zutat)
  const parts = !amount && /\s+und\s+|,\s*/.test(s)
    ? s.split(/\s+und\s+|,\s*/).filter((p, i) => i === 0 || /^[A-ZÄÖÜ]/.test(p)) : [s];
  return parts.map(p => ({ name: cleanName(p), amount: parts.length > 1 ? '' : amount }))
    .filter(i => i.name.length > 1 && (!strict || i.name.split(' ').length <= 4));
}

/* Gleiche Zutaten zusammenfassen – z. B. Zucker für Teig und Füllung → „150 g + 150 g“ */
function mergeItems(list) {
  const items = [];
  const byKey = new Map();
  list.forEach(i => {
    const k = ingredientKey(i.name);
    if (!k) return;
    const prev = byKey.get(k);
    if (prev) { if (i.amount) prev.amount = prev.amount ? prev.amount + ' + ' + i.amount : i.amount; return; }
    byKey.set(k, i); items.push(i);
  });
  return items;
}

function parseIngredientList(lines) {
  return mergeItems(lines.flatMap(l => isHeading(String(l)) ? [] : parseLine(String(l), false)));
}

/* Tesseract liefert Zeilen mit Wortpositionen. Große Lücken innerhalb einer Zeile trennen Spalten:
   Die erste Spalte ist die Zeile – ist sie nur eine Menge („300 g   Weizenmehl“), gehört die nächste dazu.
   Weitere Spalten bleiben nur, wenn sie selbst wie eine Zutat mit Menge aussehen (zweispaltige Listen);
   Bruchstücke einer angeschnittenen Nachbarspalte („Ke“, „fa“) fallen weg. */
function textFromOcr(data) {
  if (!data || !Array.isArray(data.lines) || !data.lines.length) return (data && data.text) || '';
  const median = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  const isAmountOnly = t => { const m = t.match(LEAD_RE); return !!m && !t.slice(m[0].length).trim(); };
  const isIngredient = t => { const m = t.match(LEAD_RE); return !!m && /[a-zäöüß]{3}/i.test(t.slice(m[0].length)); };
  const out = [];
  for (const line of data.lines) {
    const words = (line.words || []).filter(w => w.text && w.text.trim() && w.bbox).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    if (!words.length) continue;
    const h = median(words.map(w => w.bbox.y1 - w.bbox.y0)) || 20;
    const segs = [[words[0]]];
    for (let i = 1; i < words.length; i++) {
      if (words[i].bbox.x0 - words[i - 1].bbox.x1 > 1.5 * h) segs.push([]);
      segs[segs.length - 1].push(words[i]);
    }
    const texts = segs.map(s => s.map(w => w.text).join(' '));
    let first = texts[0], i = 1;
    while (i < texts.length && isAmountOnly(first)) first += ' ' + texts[i++];
    out.push(first);
    for (; i < texts.length; i++) if (isIngredient(texts[i])) out.push(texts[i]);
  }
  return out.join('\n');
}

/* Vergleichsschlüssel: Groß/klein, Umlaute, Klammern, einfache Plural-Endungen egal */
function ingredientKey(name) {
  return name.toLowerCase().replace(/\(.*?\)/g, '')
    .replace(/[äöü]/g, c => ({ ä: 'a', ö: 'o', ü: 'u' })[c]).replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim()
    .replace(/(en|er|n|e|s)$/, '');
}

function parseRecipe(text) {
  const lines = String(text || '').split(/\r?\n/)
    .map(l => l.replace(/^[^\wäöüÄÖÜ½¼¾⅓⅔⅛]+/, '').trim()).filter(Boolean); // Störzeichen wie „[“ oder „\“ am Anfang
  // Gibt es eine Überschrift „Zutaten“, beginnt die Liste danach; der Titel steht meist davor
  const head = lines.findIndex(l => /^z?utaten\b/i.test(l)); // OCR verliert gern den ersten Buchstaben
  const before = head > 0 ? lines.slice(0, head) : lines.slice(0, 3);
  const title = (before.find(l => /[a-zäöü]{3}/i.test(l) && l.length <= 50 && !LEAD_RE.test(l) && !SKIP_RE.test(l)) || '').trim();

  const body = (head >= 0 ? lines.slice(head + 1) : lines).map(line => ({
    line, items: SKIP_RE.test(line) || isHeading(line) ? [] : parseLine(line)
  }));
  // Zutatenblock eingrenzen: von der ersten bis zur letzten Zeile mit Mengenangabe (Ende spätestens bei
  // „Zubereitung“), danach noch direkt folgende kurze Zeilen wie „etwas Puderzucker zum Bestreuen“.
  // So fallen Menüs, Buttons und Werbetexte aus Screenshots weg.
  const hasAmount = b => b.items.some(i => i.amount);
  let first = body.findIndex(hasAmount), last = first;
  if (first >= 0) {
    for (let i = first; i < body.length; i++) {
      if (STOP_RE.test(body[i].line)) break;
      if (hasAmount(body[i])) last = i;
    }
    while (last + 1 < body.length && body[last + 1].items.length && !STOP_RE.test(body[last + 1].line) &&
      (VAGUE_RE.test(body[last + 1].line) || body[last + 1].line.split(' ').length <= 3)) last++;
  }
  const block = first >= 0 ? body.slice(first, last + 1) : body.slice(0, (body.findIndex(b => STOP_RE.test(b.line)) + 1 || body.length + 1) - 1);

  return { title: head > 0 ? title : '', items: mergeItems(block.flatMap(b => b.items)) };
}

if (typeof module !== 'undefined') module.exports = { parseRecipe, parseLine, parseIngredientList, textFromOcr, ingredientKey };

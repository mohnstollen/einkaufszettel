/* Einkaufszettel PWA – Daten in localStorage */
const KEY = 'einkaufszettel.v3';
const OLDKEYS = ['einkaufszettel.v2', 'einkaufszettel.v1'];

const STORES = ['Aldi','Lidl','Edeka','Norma','REWE','Kaufland','Netto','Penny','Marktkauf','Globus'];
const OTHER = 'Anderer';

const DEFAULTS = [
  ['Obst & Gemüse', ['Bananen','Äpfel','Karotten','Kartoffeln','Zitrone','Paprika','Gurke']],
  ['Backwaren', ['Toast','Brot','Brötchen']],
  ['Milch & Eier', ['Eier','Milch','Joghurt natur','Joghurt Frucht','Butter','Frischkäse','Käsescheiben']],
  ['Wurst & Fleisch', ['BoWo','Wiener','Salami','Schinken','Schwarzwälder Schinken','Leberkäse','Meerrettichrollen']],
  ['Konserven', ['Tomaten','Kidneybohnen','Essiggurken','Senf','Ketchup']],
  ['Getränke', ['Limo','Apfelschorle','Cola','Cola-Mix','Bier','Radler','Wasser']],
  ['Knabberei & Süßes', ['Chips','Flips','Schokolade']],
  ['Sonstiges', ['CO2-Zylinder']]
];

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

function defaultState() {
  return {
    sections: DEFAULTS.map(([name, products]) => ({
      id: uid(), name, collapsed: false,
      products: products.map(n => ({ id: uid(), name: n, needed: false, done: false, note: '' }))
    })),
    trip: null, lastStore: '', onlyNeeded: false, archive: []
  };
}

let state = load();
let editing = null;
let editingSection = null;
let tripDialogMode = 'new';

/* ---------- Laden / Migration ---------- */
function migrate(s) {
  s.sections.forEach(sec => sec.products.forEach(p => {
    if (p.needed === undefined) p.needed = !!p.checked;
    if (p.done === undefined) p.done = false;
    delete p.checked;
  }));
  if (s.onlyNeeded === undefined) s.onlyNeeded = !!s.onlyChecked;
  delete s.onlyChecked;
  if (!Array.isArray(s.archive)) s.archive = [];
  s.archive.forEach(t => {
    if (!t.archivedAt) t.archivedAt = t.date;
    if (!t.tripDate) t.tripDate = (t.date || '').slice(0, 10);
    if (!t.store) t.store = 'Unbekannt';
  });
  if (s.trip === undefined) s.trip = null;
  if (s.lastStore === undefined) s.lastStore = '';
  return s;
}
function load() {
  try {
    let raw = localStorage.getItem(KEY);
    for (const k of OLDKEYS) if (!raw) raw = localStorage.getItem(k);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.sections)) return defaultState();
    return migrate(s);
  } catch { return defaultState(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

const $ = sel => document.querySelector(sel);
const listEl = $('#list');

const fmtDay = iso => {
  if (!iso) return '–';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });
};
const fmtStamp = iso => iso ? new Date(iso).toLocaleString('de-DE',
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–';

function iconBtn(cls, icon, title) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = cls; b.innerHTML = ICON[icon]; b.title = title;
  b.setAttribute('aria-label', title);
  return b;
}

/* ---------- Rendering ---------- */
function rank(p) { return p.needed ? (p.done ? 1 : 0) : 2; }

function renderTripBar() {
  const bar = $('#tripBar');
  if (state.trip) {
    bar.innerHTML =
      '<span class="tb-item">' + ICON.store + '<b class="s"></b></span>' +
      '<span class="tb-item">' + ICON.calendar + '<span class="d"></span></span>' +
      '<span class="tb-edit">' + ICON.edit + '</span>';
    bar.querySelector('.s').textContent = state.trip.store;
    bar.querySelector('.d').textContent = fmtDay(state.trip.date);
    bar.classList.remove('empty-trip');
  } else {
    bar.innerHTML = '<span class="tb-item">' + ICON.store + '<span>Supermarkt und Datum wählen</span></span>';
    bar.classList.add('empty-trip');
  }
}

function render() {
  renderTripBar();
  const q = $('#search').value.trim().toLowerCase();
  listEl.innerHTML = '';
  let needTotal = 0, doneTotal = 0;

  state.sections.forEach(sec => {
    const items = sec.products
      .filter(p => !q || p.name.toLowerCase().includes(q))
      .filter(p => !state.onlyNeeded || p.needed)
      .slice()
      .sort((a, b) => (rank(a) - rank(b)) || a.name.localeCompare(b.name, 'de'));

    const need = sec.products.filter(p => p.needed);
    needTotal += need.length;
    doneTotal += need.filter(p => p.done).length;
    if ((q || state.onlyNeeded) && items.length === 0) return;

    const secEl = document.createElement('section');
    secEl.className = 'section' + (sec.collapsed ? ' collapsed' : '');

    const head = document.createElement('div');
    head.className = 'section-head';
    head.innerHTML = '<span class="chev">' + ICON.chevron + '</span><h2></h2><span class="cnt"></span>';
    head.querySelector('h2').textContent = sec.name;
    const cnt = head.querySelector('.cnt');
    cnt.textContent = need.length
      ? need.filter(p => p.done).length + ' / ' + need.length + ' erledigt'
      : sec.products.length + ' Produkte';
    if (need.length) cnt.classList.add('active');
    const se = iconBtn('act', 'edit', 'Abschnitt umbenennen');
    const sd = iconBtn('act del', 'trash', 'Abschnitt löschen');
    se.addEventListener('click', e => { e.stopPropagation(); openSection(sec); });
    sd.addEventListener('click', e => { e.stopPropagation(); delSection(sec); });
    head.append(se, sd);
    head.addEventListener('click', () => { sec.collapsed = !sec.collapsed; save(); render(); });
    secEl.appendChild(head);

    const ul = document.createElement('ul');
    ul.className = 'items';
    if (items.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty'; li.textContent = 'Keine Produkte';
      ul.appendChild(li);
    }
    items.forEach(p => {
      const li = document.createElement('li');
      li.className = 'item' + (p.needed ? ' needed' : '') + (p.needed && p.done ? ' done' : '');

      const star = iconBtn('mark' + (p.needed ? ' on' : ''), p.needed ? 'starOn' : 'star',
        p.needed ? 'Vom Einkauf entfernen' : 'Zum Einkauf hinzufügen');
      star.addEventListener('click', () => { p.needed = !p.needed; if (!p.needed) p.done = false; save(); render(); });

      const cart = iconBtn('cart' + (p.done ? ' on' : ''), p.done ? 'boxOn' : 'box', 'Im Einkaufswagen');
      cart.disabled = !p.needed;
      cart.addEventListener('click', () => { p.done = !p.done; save(); render(); });

      const nameWrap = document.createElement('div');
      nameWrap.className = 'name';
      const b = document.createElement('b'); b.textContent = p.name;
      nameWrap.appendChild(b);
      if (p.note) { const n = document.createElement('div'); n.className = 'note'; n.textContent = p.note; nameWrap.appendChild(n); }
      nameWrap.addEventListener('click', () => { if (!p.needed) p.needed = true; else p.done = !p.done; save(); render(); });

      const edit = iconBtn('act', 'edit', 'Bearbeiten');
      edit.addEventListener('click', () => openProduct(sec, p));
      const del = iconBtn('act del', 'trash', 'Löschen');
      del.addEventListener('click', () => {
        if (!confirm('„' + p.name + '“ dauerhaft löschen?')) return;
        sec.products = sec.products.filter(x => x.id !== p.id); save(); render(); toast('Gelöscht');
      });

      li.append(star, cart, nameWrap, edit, del);
      ul.appendChild(li);
    });
    secEl.appendChild(ul);
    listEl.appendChild(secEl);
  });

  if (!listEl.children.length) listEl.innerHTML = '<div class="empty">Nichts gefunden.</div>';
  $('#counter').textContent = doneTotal + ' / ' + needTotal;
  $('#btnOnlyNeeded').classList.toggle('on', state.onlyNeeded);
}

/* ---------- Einkauf-Dialog ---------- */
function fillStoreSelect(sel, current) {
  sel.innerHTML = '<option value="" disabled>Bitte wählen…</option>';
  [...STORES, OTHER].forEach(s => {
    const o = document.createElement('option'); o.value = s; o.textContent = s; sel.appendChild(o);
  });
  if (!current) { sel.value = ''; return ''; }
  if (STORES.includes(current)) { sel.value = current; return ''; }
  sel.value = OTHER; return current;
}
function toggleOther() {
  const isOther = $('#tStore').value === OTHER;
  $('#tOtherWrap').classList.toggle('hidden', !isOther);
  $('#tOther').required = isOther;
}
$('#tStore').addEventListener('change', () => { toggleOther(); if ($('#tStore').value === OTHER) $('#tOther').focus(); });

function currentMarkedEntries() {
  const entries = [];
  state.sections.forEach(s => {
    const need = s.products.filter(p => p.needed);
    if (need.length) entries.push({ section: s.name, items: need.map(p => ({ name: p.name, note: p.note || '', done: !!p.done })) });
  });
  return entries;
}

function openTripDialog(mode, presetStore) {
  tripDialogMode = mode;
  const isNew = mode === 'new';
  $('#dlgTripTitle').textContent = isNew ? 'Neuer Einkauf' : (state.trip ? 'Einkauf bearbeiten' : 'Wo und wann kaufst du ein?');
  $('#btnTripOk').textContent = isNew ? 'Starten' : 'Speichern';

  const base = isNew || !state.trip ? { date: todayISO(), store: presetStore || state.lastStore } : state.trip;
  $('#tDate').value = base.date;
  $('#tOther').value = fillStoreSelect($('#tStore'), base.store);
  toggleOther();

  const info = $('#tripInfo');
  const entries = currentMarkedEntries();
  if (isNew && entries.length) {
    const total = entries.reduce((n, e) => n + e.items.length, 0);
    const done = entries.reduce((n, e) => n + e.items.filter(i => i.done).length, 0);
    info.textContent = 'Die aktuelle Liste (' + done + ' / ' + total + ' erledigt' +
      (state.trip ? ', ' + state.trip.store + ', ' + fmtDay(state.trip.date) : '') +
      ') wird archiviert. Deine Produkte bleiben erhalten.';
    info.classList.remove('hidden');
  } else info.classList.add('hidden');

  $('#dlgTrip').showModal();
}

$('#formTrip').addEventListener('submit', e => {
  if (!(e.submitter && e.submitter.value === 'ok')) return;
  const date = $('#tDate').value;
  let store = $('#tStore').value;
  if (store === OTHER) store = $('#tOther').value.trim();
  if (!date || !store) { e.preventDefault(); toast('Bitte Datum und Supermarkt angeben'); return; }

  if (tripDialogMode === 'new') {
    const entries = currentMarkedEntries();
    if (entries.length) {
      state.archive.unshift({
        id: uid(),
        store: state.trip ? state.trip.store : 'Unbekannt',
        tripDate: state.trip ? state.trip.date : todayISO(),
        archivedAt: new Date().toISOString(),
        entries
      });
      state.archive = state.archive.slice(0, 100);
    }
    state.sections.forEach(s => s.products.forEach(p => { p.needed = false; p.done = false; }));
    state.onlyNeeded = false;
    toast(entries.length ? 'Archiviert – neuer Einkauf bei ' + store : 'Neuer Einkauf bei ' + store);
  } else toast('Einkauf aktualisiert');

  state.trip = { date, store };
  state.lastStore = store;
  save(); render();
});

$('#tripBar').addEventListener('click', () => openTripDialog('edit'));
$('#btnNewTrip').addEventListener('click', () => openTripDialog('new'));

/* ---------- Archiv ---------- */
let archiveFilter = '';
let archiveTab = 'list';

function tripCounts(trip) {
  const total = trip.entries.reduce((n, e) => n + e.items.length, 0);
  const done = trip.entries.reduce((n, e) => n + e.items.filter(i => i.done).length, 0);
  return { total, done };
}
function fillArchiveFilter() {
  const sel = $('#archiveFilter');
  const stores = [...new Set(state.archive.map(t => t.store))].sort((a, b) => a.localeCompare(b, 'de'));
  sel.innerHTML = '<option value="">Alle Märkte (' + state.archive.length + ')</option>';
  stores.forEach(s => {
    const o = document.createElement('option');
    o.value = s; o.textContent = s + ' (' + state.archive.filter(t => t.store === s).length + ')';
    sel.appendChild(o);
  });
  if (archiveFilter && !stores.includes(archiveFilter)) archiveFilter = '';
  sel.value = archiveFilter;
}
$('#archiveFilter').addEventListener('change', e => { archiveFilter = e.target.value; renderArchive(); });
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { archiveTab = t.dataset.tab; renderArchive(); }));

function openArchive() { fillArchiveFilter(); renderArchive(); $('#dlgArchive').showModal(); }

function renderArchive() {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === archiveTab));
  const box = $('#archiveBody');
  box.innerHTML = '';
  const trips = state.archive.filter(t => !archiveFilter || t.store === archiveFilter);
  if (!trips.length) { box.innerHTML = '<div class="empty">Noch keine archivierten Einkäufe.</div>'; return; }
  if (archiveTab === 'stats') renderStats(box, trips); else renderTripList(box, trips);
}

function renderTripList(box, trips) {
  trips.forEach(trip => {
    const { total, done } = tripCounts(trip);
    const det = document.createElement('details');
    det.className = 'trip';
    const sum = document.createElement('summary');
    sum.innerHTML = '<div class="trip-main"><span class="trip-store">' + ICON.store + '<span class="t"></span></span>' +
      '<span class="trip-date">' + ICON.calendar + '<span class="t"></span></span></div>' +
      '<span class="trip-cnt">' + done + ' / ' + total + ' erledigt</span>';
    sum.querySelector('.trip-store .t').textContent = trip.store;
    sum.querySelector('.trip-date .t').textContent = fmtDay(trip.tripDate);
    det.appendChild(sum);

    const meta = document.createElement('div');
    meta.className = 'trip-meta';
    meta.textContent = 'Archiviert am ' + fmtStamp(trip.archivedAt);
    det.appendChild(meta);

    trip.entries.forEach(e => {
      const h = document.createElement('div'); h.className = 'trip-sec'; h.textContent = e.section;
      det.appendChild(h);
      const ul = document.createElement('ul'); ul.className = 'trip-items';
      e.items.forEach(i => {
        const li = document.createElement('li');
        if (i.done) li.className = 'done';
        li.innerHTML = i.done ? ICON.check : ICON.open;
        const s = document.createElement('span');
        s.textContent = i.name + (i.note ? ' (' + i.note + ')' : '');
        li.appendChild(s);
        ul.appendChild(li);
      });
      det.appendChild(ul);
    });

    const actions = document.createElement('div');
    actions.className = 'trip-actions';
    const reuse = document.createElement('button');
    reuse.type = 'button'; reuse.className = 'btn'; reuse.textContent = 'Liste erneut verwenden';
    reuse.addEventListener('click', () => reuseTrip(trip));
    const rm = document.createElement('button');
    rm.type = 'button'; rm.className = 'btn ghost'; rm.textContent = 'Löschen';
    rm.addEventListener('click', () => {
      if (!confirm('Diesen Einkauf aus dem Archiv löschen?')) return;
      state.archive = state.archive.filter(t => t.id !== trip.id);
      save(); fillArchiveFilter(); renderArchive();
    });
    actions.append(reuse, rm);
    det.appendChild(actions);
    box.appendChild(det);
  });
}

function renderStats(box, trips) {
  const counts = new Map();
  trips.forEach(t => {
    const seen = new Set();
    t.entries.forEach(e => e.items.forEach(i => {
      const k = i.name.trim().toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      const c = counts.get(k) || { name: i.name.trim(), listed: 0, bought: 0 };
      c.listed++; if (i.done) c.bought++;
      counts.set(k, c);
    }));
  });
  const top = [...counts.values()].sort((a, b) => b.listed - a.listed || b.bought - a.bought || a.name.localeCompare(b.name, 'de')).slice(0, 20);
  const last = trips.reduce((a, t) => (!a || t.tripDate > a.tripDate ? t : a), null);

  const head = document.createElement('div');
  head.className = 'stats-head';
  head.innerHTML = '<div><b>' + trips.length + '</b><span>Einkäufe</span></div>' +
    '<div><b>' + counts.size + '</b><span>versch. Produkte</span></div>' +
    '<div><b class="last"></b><span>letzter Einkauf</span></div>';
  head.querySelector('.last').textContent = last ? fmtDay(last.tripDate).replace(/^[^,]+,\s*/, '') : '–';
  box.appendChild(head);

  if (!archiveFilter) {
    const perStore = {};
    trips.forEach(t => perStore[t.store] = (perStore[t.store] || 0) + 1);
    const h = document.createElement('div'); h.className = 'trip-sec'; h.textContent = 'Einkäufe pro Markt';
    box.appendChild(h);
    box.appendChild(barTable(Object.entries(perStore).sort((a, b) => b[1] - a[1]).map(([n, v]) => ({ name: n, value: v, label: v + '×' }))));
  }
  const h2 = document.createElement('div'); h2.className = 'trip-sec';
  h2.textContent = 'Häufigste Produkte' + (archiveFilter ? ' bei ' + archiveFilter : '');
  box.appendChild(h2);
  box.appendChild(barTable(top.map(c => ({ name: c.name, value: c.listed, label: c.listed + '×' + (c.bought !== c.listed ? ' (' + c.bought + ' gekauft)' : '') }))));
  const hint = document.createElement('div'); hint.className = 'trip-meta';
  hint.textContent = 'Zählt, wie oft ein Produkt auf einer archivierten Liste stand.';
  box.appendChild(hint);
}
function barTable(rows) {
  const wrap = document.createElement('div'); wrap.className = 'bars';
  const max = Math.max(1, ...rows.map(r => r.value));
  rows.forEach(r => {
    const row = document.createElement('div'); row.className = 'bar-row';
    row.innerHTML = '<span class="bar-name"></span><span class="bar"><i style="width:' + (r.value / max * 100) + '%"></i></span><span class="bar-val"></span>';
    row.querySelector('.bar-name').textContent = r.name;
    row.querySelector('.bar-val').textContent = r.label;
    wrap.appendChild(row);
  });
  return wrap;
}

function reuseTrip(trip) {
  if (currentMarkedEntries().length && !confirm('Aktuelle Markierungen durch diese Liste ersetzen? (Die aktuelle Liste wird nicht archiviert.)')) return;
  state.sections.forEach(s => s.products.forEach(p => { p.needed = false; p.done = false; }));
  let created = 0;
  trip.entries.forEach(e => {
    let sec = state.sections.find(s => s.name === e.section);
    if (!sec) { sec = { id: uid(), name: e.section, collapsed: false, products: [] }; state.sections.push(sec); }
    e.items.forEach(i => {
      const p = sec.products.find(x => x.name.toLowerCase() === i.name.toLowerCase());
      if (p) { p.needed = true; p.done = false; }
      else { sec.products.push({ id: uid(), name: i.name, note: i.note, needed: true, done: false }); created++; }
    });
  });
  state.trip = null;
  save(); render(); $('#dlgArchive').close();
  toast('Liste übernommen' + (created ? ' (' + created + ' Produkte neu angelegt)' : ''));
  setTimeout(() => openTripDialog('edit', trip.store !== 'Unbekannt' ? trip.store : ''), 150);
}

/* ---------- Produkt-Dialog ---------- */
function openProduct(sec, product) {
  editing = product ? { sectionId: sec.id, productId: product.id } : null;
  $('#dlgProductTitle').textContent = product ? 'Produkt bearbeiten' : 'Produkt hinzufügen';
  const sel = $('#pSection');
  sel.innerHTML = '';
  state.sections.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o); });
  sel.value = sec ? sec.id : (state.sections[0] || {}).id;
  $('#pName').value = product ? product.name : '';
  $('#pNote').value = product ? (product.note || '') : '';
  $('#dlgProduct').showModal();
  setTimeout(() => $('#pName').focus(), 50);
}
$('#formProduct').addEventListener('submit', e => {
  if (!(e.submitter && e.submitter.value === 'ok')) { editing = null; return; }
  const name = $('#pName').value.trim();
  if (!name) { e.preventDefault(); return; }
  const note = $('#pNote').value.trim();
  const target = state.sections.find(s => s.id === $('#pSection').value);
  if (editing) {
    const src = state.sections.find(s => s.id === editing.sectionId);
    const p = src.products.find(x => x.id === editing.productId);
    p.name = name; p.note = note;
    if (src.id !== target.id) { src.products = src.products.filter(x => x.id !== p.id); target.products.push(p); }
    toast('Gespeichert');
  } else {
    const dupe = target.products.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (dupe) { dupe.needed = true; dupe.done = false; dupe.note = note || dupe.note; toast('Bereits vorhanden – markiert'); }
    else { target.products.push({ id: uid(), name, note, needed: true, done: false }); toast('Hinzugefügt und markiert'); }
  }
  editing = null; save(); render();
});

/* ---------- Abschnitt-Dialog ---------- */
function openSection(sec) {
  editingSection = sec || null;
  $('#dlgSectionTitle').textContent = sec ? 'Abschnitt umbenennen' : 'Abschnitt hinzufügen';
  $('#sName').value = sec ? sec.name : '';
  $('#dlgSection').showModal();
  setTimeout(() => $('#sName').focus(), 50);
}
function delSection(sec) {
  if (!confirm('Abschnitt „' + sec.name + '“ mit ' + sec.products.length + ' Produkten löschen?')) return;
  state.sections = state.sections.filter(s => s.id !== sec.id);
  save(); render(); toast('Abschnitt gelöscht');
}
$('#formSection').addEventListener('submit', e => {
  if (!(e.submitter && e.submitter.value === 'ok')) { editingSection = null; return; }
  const name = $('#sName').value.trim();
  if (!name) { e.preventDefault(); return; }
  if (editingSection) editingSection.name = name;
  else state.sections.push({ id: uid(), name, collapsed: false, products: [] });
  editingSection = null; save(); render();
});

/* ---------- Menü & Aktionen ---------- */
$('#btnMenu').addEventListener('click', e => { e.stopPropagation(); $('#menu').classList.toggle('hidden'); });
document.addEventListener('click', () => $('#menu').classList.add('hidden'));
$('#menu').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  $('#menu').classList.add('hidden');
  ({ addProduct: () => openProduct(state.sections[0], null),
     addSection: () => openSection(null),
     archive: () => { archiveTab = 'list'; openArchive(); },
     stats: () => { archiveTab = 'stats'; openArchive(); },
     clearMarks, export: exportText, backup: backupJSON,
     restore: () => $('#fileInput').click(), reset: resetAll })[btn.dataset.act]();
});
$('#fab').addEventListener('click', () => openProduct(state.sections[0], null));
$('#search').addEventListener('input', render);
$('#btnOnlyNeeded').addEventListener('click', () => { state.onlyNeeded = !state.onlyNeeded; save(); render(); });

function clearMarks() {
  if (!confirm('Alle Markierungen entfernen, ohne zu archivieren?')) return;
  state.sections.forEach(s => s.products.forEach(p => { p.needed = false; p.done = false; }));
  state.onlyNeeded = false; save(); render(); toast('Markierungen entfernt');
}
function resetAll() {
  if (!confirm('Standardliste wiederherstellen? Eigene Produkte und das Archiv gehen verloren.')) return;
  state = defaultState(); save(); render(); toast('Zurückgesetzt');
}
function exportText() {
  const head = state.trip ? state.trip.store + ' – ' + fmtDay(state.trip.date) : 'Einkaufszettel';
  const lines = [head, ''];
  state.sections.forEach(s => {
    const need = s.products.filter(p => p.needed);
    if (!need.length) return;
    lines.push(s.name);
    need.sort((a, b) => (a.done - b.done) || a.name.localeCompare(b.name, 'de'));
    need.forEach(p => lines.push((p.done ? '[x] ' : '[ ] ') + p.name + (p.note ? ' (' + p.note + ')' : '')));
    lines.push('');
  });
  const txt = lines.length > 2 ? lines.join('\n').trim() : 'Nichts markiert.';
  $('#txtArea').value = txt;
  $('#btnTextOk').onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Kopiert')); };
  $('#dlgText').showModal();
}
function backupJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'einkaufszettel-' + todayISO() + '.json';
  a.click(); URL.revokeObjectURL(a.href);
}
$('#fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const s = JSON.parse(await f.text());
    if (!Array.isArray(s.sections)) throw new Error('Format');
    state = migrate(s); save(); render(); toast('Backup geladen');
  } catch { alert('Datei konnte nicht gelesen werden.'); }
  e.target.value = '';
});

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}

applyIcons();
render();
if (!state.trip) setTimeout(() => openTripDialog('edit'), 300);

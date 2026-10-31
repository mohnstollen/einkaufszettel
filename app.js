/* Einkaufszettel PWA – Daten in localStorage */
const KEY = 'einkaufszettel.v4';
const OLDKEYS = ['einkaufszettel.v3', 'einkaufszettel.v2', 'einkaufszettel.v1'];

const STORE_GROUPS = [
  ['Lebensmittel', ['Aldi','Lidl','Edeka','Norma','REWE','Kaufland','Netto','Penny','Marktkauf','Globus']],
  ['Drogerie', ['dm','Rossmann','Müller']],
  ['Baumarkt', ['OBI','Hornbach','Bauhaus','toom','hagebau']]
];
const STORES = STORE_GROUPS.flatMap(g => g[1]);
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

function newList(name, template) {
  return {
    id: uid(), name,
    sections: template !== 'food' ? [] : DEFAULTS.map(([sec, products]) => ({
      id: uid(), name: sec, collapsed: false,
      products: products.map(n => ({ id: uid(), name: n, needed: false, done: false, note: '' }))
    })),
    trip: null, lastStore: '', onlyNeeded: false, archive: []
  };
}
function defaultDb() { return { lists: [newList('Lebensmittel', 'food')], since: Date.now(), lastBackup: 0, snoozeUntil: 0 }; }

let db = load();
let state = null; // gerade geöffnete Liste (null = Übersicht)
let fromHome = false;
let editing = null;
let editingSection = null;
let tripDialogMode = 'new';

/* ---------- Laden / Migration / Prüfung ---------- */
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const str = v => typeof v === 'string' ? v : '';
const num = v => typeof v === 'number' && isFinite(v) ? v : 0;
const arr = v => Array.isArray(v) ? v : [];

/* Bringt eine Liste (auch aus alten Versionen oder fremden Dateien) in eine sichere Form */
function migrate(s) {
  const sections = arr(s.sections).filter(isObj).map(sec => ({
    id: str(sec.id) || uid(),
    name: str(sec.name).trim() || 'Allgemein',
    collapsed: !!sec.collapsed,
    products: arr(sec.products).filter(p => isObj(p) && str(p.name).trim()).map(p => {
      const needed = p.needed === undefined ? !!p.checked : !!p.needed;
      return { id: str(p.id) || uid(), name: p.name.trim(), note: str(p.note), needed, done: needed && !!p.done };
    })
  }));
  const archive = arr(s.archive).filter(t => isObj(t) && Array.isArray(t.entries)).map(t => ({
    id: str(t.id) || uid(),
    store: str(t.store) || 'Unbekannt',
    tripDate: str(t.tripDate) || str(t.date).slice(0, 10),
    archivedAt: str(t.archivedAt) || str(t.date),
    entries: t.entries.filter(e => isObj(e) && Array.isArray(e.items)).map(e => ({
      section: str(e.section),
      items: e.items.filter(i => isObj(i) && str(i.name)).map(i => ({ name: i.name, note: str(i.note), done: !!i.done }))
    }))
  }));
  const trip = isObj(s.trip) && str(s.trip.store) && str(s.trip.date) ? { date: s.trip.date, store: s.trip.store } : null;
  return {
    id: str(s.id) || uid(), name: str(s.name).trim() || 'Lebensmittel',
    sections, trip, lastStore: str(s.lastStore),
    onlyNeeded: s.onlyNeeded === undefined ? !!s.onlyChecked : !!s.onlyNeeded,
    archive
  };
}
/* Aktuelles Format { lists: [...] } oder alte Einzelliste { sections: [...] } */
function toDb(s) {
  if (!isObj(s)) return null;
  let lists;
  if (Array.isArray(s.lists)) lists = s.lists.filter(l => isObj(l) && Array.isArray(l.sections)).map(migrate);
  else if (Array.isArray(s.sections)) lists = [migrate(s)];
  else return null;
  const seen = new Set();
  lists.forEach(l => { if (seen.has(l.id)) l.id = uid(); seen.add(l.id); });
  return { lists, since: num(s.since) || Date.now(), lastBackup: num(s.lastBackup), snoozeUntil: num(s.snoozeUntil) };
}
function load() {
  try {
    let raw = localStorage.getItem(KEY);
    for (const k of OLDKEYS) if (!raw) raw = localStorage.getItem(k);
    return (raw && toDb(JSON.parse(raw))) || defaultDb();
  } catch { return defaultDb(); }
}
let saveWarned = false;
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); saveWarned = false; }
  catch {
    if (saveWarned) return;
    saveWarned = true;
    alert('Speichern fehlgeschlagen – der Speicher des Browsers ist evtl. voll. Bitte erstelle über das Menü der Startseite ein Backup.');
  }
}
/* Bittet den Browser, die Daten nicht automatisch zu löschen (v. a. Safari/iOS) */
function requestPersistence() {
  if (navigator.storage && navigator.storage.persist)
    navigator.storage.persisted().then(p => p || navigator.storage.persist()).catch(() => {});
}

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

/* ---------- Übersicht ---------- */
function refresh() { if (state) render(); else renderHome(); }

function route() {
  const m = location.hash.match(/^#\/liste\/(.+)$/);
  state = m ? db.lists.find(l => l.id === m[1]) || null : null;
  if (!state) fromHome = false;
  $('#viewHome').classList.toggle('hidden', !!state);
  $('#viewList').classList.toggle('hidden', !state);
  $('#fab').title = state ? 'Produkt hinzufügen' : 'Neue Liste';
  $('#fab').setAttribute('aria-label', $('#fab').title);
  $('#search').value = '';
  archiveFilter = '';
  document.querySelectorAll('dialog[open]').forEach(d => d.close());
  closeMenus();
  if (!state) document.title = 'Einkaufszettel';
  refresh();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
function openList(id) { fromHome = true; location.hash = '#/liste/' + id; }
$('#btnBack').addEventListener('click', () => { if (fromHome) history.back(); else location.hash = ''; });

const BACKUP_DAYS = 30;
function backupDue() {
  const hasData = db.lists.some(l => l.archive.length || l.sections.some(s => s.products.length));
  const now = Date.now();
  return hasData && now > db.snoozeUntil && now - Math.max(db.lastBackup, db.since) > BACKUP_DAYS * 864e5;
}
function renderBackupNotice(box) {
  const n = document.createElement('div');
  n.className = 'notice';
  n.innerHTML = '<span></span><div class="notice-actions"><button type="button" class="btn ghost">Später</button>' +
    '<button type="button" class="btn primary">Jetzt sichern</button></div>';
  n.querySelector('span').textContent = db.lastBackup
    ? 'Dein letztes Backup ist ' + Math.floor((Date.now() - db.lastBackup) / 864e5) + ' Tage alt.'
    : 'Du hast noch kein Backup erstellt. Die Listen liegen nur in diesem Browser.';
  const [later, now] = n.querySelectorAll('button');
  later.addEventListener('click', () => { db.snoozeUntil = Date.now() + 7 * 864e5; save(); renderHome(); });
  now.addEventListener('click', backupJSON);
  box.appendChild(n);
}

function renderHome() {
  const box = $('#home');
  box.innerHTML = '';
  if (backupDue()) renderBackupNotice(box);
  if (!db.lists.length) { box.insertAdjacentHTML('beforeend', '<div class="empty">Noch keine Listen. Tippe auf +, um eine anzulegen.</div>'); return; }
  const wrap = document.createElement('div');
  wrap.className = 'lists';
  db.lists.forEach(list => {
    let products = 0, need = 0, done = 0;
    list.sections.forEach(s => s.products.forEach(p => { products++; if (p.needed) { need++; if (p.done) done++; } }));

    const card = document.createElement('div');
    card.className = 'list-card';
    const main = document.createElement('button');
    main.type = 'button'; main.className = 'lc-main';
    main.innerHTML = '<b class="lc-name"></b><span class="lc-sub"></span>';
    main.querySelector('.lc-name').textContent = list.name;
    const sub = main.querySelector('.lc-sub');
    const store = list.trip ? list.trip.store : list.lastStore;
    if (store) {
      const st = document.createElement('span'); st.className = 'tb-item';
      st.innerHTML = ICON.store; st.append(store); sub.appendChild(st);
    }
    const info = document.createElement('span');
    info.textContent = products ? products + (products === 1 ? ' Produkt' : ' Produkte') : 'Leer';
    sub.appendChild(info);
    main.addEventListener('click', () => openList(list.id));
    card.appendChild(main);

    if (need) {
      const c = document.createElement('span'); c.className = 'counter';
      c.textContent = done + ' / ' + need; c.title = 'im Wagen / auf der Liste';
      card.appendChild(c);
    }
    const ed = iconBtn('act', 'edit', 'Liste umbenennen');
    ed.addEventListener('click', () => openListDialog(list));
    const del = iconBtn('act del', 'trash', 'Liste löschen');
    del.addEventListener('click', () => delList(list));
    card.append(ed, del);
    wrap.appendChild(card);
  });
  box.appendChild(wrap);
}

let editingList = null;
function openListDialog(list) {
  editingList = list || null;
  $('#dlgListTitle').textContent = list ? 'Liste umbenennen' : 'Neue Liste';
  $('#lName').value = list ? list.name : '';
  $('#lTemplate').value = 'empty';
  $('#lTemplateWrap').classList.toggle('hidden', !!list);
  $('#dlgList').showModal();
  setTimeout(() => $('#lName').focus(), 50);
}
$('#formList').addEventListener('submit', e => {
  if (!(e.submitter && e.submitter.value === 'ok')) { editingList = null; return; }
  const name = $('#lName').value.trim();
  if (!name) { e.preventDefault(); return; }
  if (editingList) { editingList.name = name; save(); refresh(); toast('Gespeichert'); }
  else { const list = newList(name, $('#lTemplate').value); db.lists.push(list); save(); openList(list.id); }
  editingList = null;
});
function delList(list) {
  const n = list.archive.length;
  if (!confirm('Liste „' + list.name + '“' + (n ? ' samt ' + n + ' archivierten Einkäufen' : '') + ' löschen?')) return;
  db.lists = db.lists.filter(l => l.id !== list.id);
  save(); renderHome(); toast('Liste gelöscht');
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
  $('#listTitle').textContent = state.name;
  document.title = state.name + ' – Einkaufszettel';
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

  if (!listEl.children.length) listEl.innerHTML = '<div class="empty">' + (state.sections.length || q
    ? 'Nichts gefunden.' : 'Diese Liste ist noch leer. Tippe auf +, um ein Produkt hinzuzufügen.') + '</div>';
  $('#counter').textContent = doneTotal + ' / ' + needTotal;
  $('#btnOnlyNeeded').classList.toggle('on', state.onlyNeeded);
}

/* ---------- Einkauf-Dialog ---------- */
function fillStoreSelect(sel, current) {
  sel.innerHTML = '<option value="" disabled>Bitte wählen…</option>';
  const opt = s => { const o = document.createElement('option'); o.value = s; o.textContent = s; return o; };
  STORE_GROUPS.forEach(([label, stores]) => {
    const g = document.createElement('optgroup'); g.label = label;
    stores.forEach(s => g.appendChild(opt(s)));
    sel.appendChild(g);
  });
  sel.appendChild(opt(OTHER));
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
  if (!state.sections.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'Allgemein'; sel.appendChild(o); }
  sel.value = sec ? sec.id : (state.sections[0] || { id: '' }).id;
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
  let target = state.sections.find(s => s.id === $('#pSection').value);
  if (!target) { target = { id: uid(), name: 'Allgemein', collapsed: false, products: [] }; state.sections.push(target); }
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
function closeMenus() { $('#menu').classList.add('hidden'); $('#homeMenu').classList.add('hidden'); }
$('#btnMenu').addEventListener('click', e => { e.stopPropagation(); $('#menu').classList.toggle('hidden'); });
$('#btnHomeMenu').addEventListener('click', e => { e.stopPropagation(); $('#homeMenu').classList.toggle('hidden'); });
document.addEventListener('click', closeMenus);
$('#menu').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  closeMenus();
  ({ addProduct: () => openProduct(state.sections[0], null),
     addSection: () => openSection(null),
     renameList: () => openListDialog(state),
     archive: () => { archiveTab = 'list'; openArchive(); },
     stats: () => { archiveTab = 'stats'; openArchive(); },
     clearMarks, export: exportText })[btn.dataset.act]();
});
$('#homeMenu').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  closeMenus();
  ({ newList: () => openListDialog(null), backup: backupJSON,
     restore: () => $('#fileInput').click() })[btn.dataset.act]();
});
$('#fab').addEventListener('click', () => state ? openProduct(state.sections[0], null) : openListDialog(null));
$('#search').addEventListener('input', render);
$('#btnOnlyNeeded').addEventListener('click', () => { state.onlyNeeded = !state.onlyNeeded; save(); render(); });

function clearMarks() {
  if (!confirm('Alle Markierungen entfernen, ohne zu archivieren?')) return;
  state.sections.forEach(s => s.products.forEach(p => { p.needed = false; p.done = false; }));
  state.onlyNeeded = false; save(); render(); toast('Markierungen entfernt');
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
  const blob = new Blob([JSON.stringify({ version: 4, lists: db.lists }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'einkaufszettel-' + todayISO() + '.json';
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  db.lastBackup = Date.now(); save(); refresh();
}
$('#fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const s = JSON.parse(await f.text());
    const data = toDb(s);
    if (!data) throw new Error('Format');
    if (Array.isArray(s.lists)) {
      if (confirm('Alle Listen durch das Backup ersetzen (' + data.lists.length + ' Listen)?')) {
        db = { ...data, lastBackup: db.lastBackup, since: db.since, snoozeUntil: db.snoozeUntil };
        save(); renderHome(); toast('Backup geladen');
      }
    } else {
      // Backup aus der Zeit vor mehreren Listen: als zusätzliche Liste übernehmen
      const list = data.lists[0];
      list.id = uid();
      db.lists.push(list); save(); renderHome(); toast('Backup als Liste „' + list.name + '“ hinzugefügt');
    }
  } catch { alert('Datei konnte nicht gelesen werden.'); }
  e.target.value = '';
});

/* ---------- App-Update ---------- */
function showUpdate(worker) {
  $('#updateBar').classList.remove('hidden');
  $('#btnUpdate').onclick = () => {
    navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
    worker.postMessage('skipWaiting');
  };
}

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2000);
}

applyIcons();
route();
requestPersistence();

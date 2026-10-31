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

/* Vorlage „Lebensmittel“: [{ name: Abschnitt, products: [Produktnamen] }] – vom Nutzer erweiterbar */
const defaultTemplate = () => DEFAULTS.map(([name, products]) => ({ name, products: [...products] }));

function newList(name, template = []) {
  return {
    id: uid(), name,
    sections: template.map(t => ({
      id: uid(), name: t.name, collapsed: false,
      products: t.products.map(n => ({ id: uid(), name: n, needed: false, done: false, note: '' }))
    })),
    trip: null, lastStore: '', onlyNeeded: false, archive: [], shared: null, seenAt: 0
  };
}
function defaultDb() {
  return { lists: [newList('Lebensmittel', defaultTemplate())], template: defaultTemplate(),
    since: Date.now(), lastBackup: 0, snoozeUntil: 0, userName: '' };
}

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
      return { id: str(p.id) || uid(), name: p.name.trim(), note: str(p.note), needed, done: needed && !!p.done,
        by: str(p.by), at: num(p.at) };
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
    archive,
    shared: isObj(s.shared) && str(s.shared.id) ? { id: s.shared.id } : null,
    seenAt: num(s.seenAt)
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
  return { lists, since: num(s.since) || Date.now(), lastBackup: num(s.lastBackup), snoozeUntil: num(s.snoozeUntil),
    userName: str(s.userName),
    template: Array.isArray(s.template)
      ? s.template.filter(isObj).map(t => ({ name: str(t.name).trim() || 'Allgemein',
          products: arr(t.products).filter(n => str(n).trim()).map(n => n.trim()) }))
      : defaultTemplate() };
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
  if (sync) db.lists.forEach(l => { if (l.shared) sync.push(l); });
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

let db = load();
let state = null; // gerade geöffnete Liste (null = Übersicht)
let fromHome = false;
let editing = null;
let editingSection = null; // ID des Abschnitts
let tripDialogMode = 'new';

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
  const invite = location.hash.match(/^#\/teilen\/([a-z0-9]{20,})$/);
  const m = location.hash.match(/^#\/liste\/(.+)$/);
  if (state && state.shared) { state.seenAt = Date.now(); save(); }
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
  if (invite) joinShared(invite[1]);
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
    if (list.shared) {
      const sh = document.createElement('span'); sh.className = 'tb-item';
      sh.innerHTML = ICON.share; sh.append('Geteilt'); sub.appendChild(sh);
      const fresh = newCount(list);
      if (fresh) { const nw = document.createElement('span'); nw.className = 'new-badge'; nw.textContent = fresh + ' neu'; sub.appendChild(nw); }
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
  else { const list = newList(name, $('#lTemplate').value === 'food' ? db.template : []); db.lists.push(list); save(); openList(list.id); }
  editingList = null;
});
function delList(list) {
  const n = list.archive.length;
  const msg = list.shared
    ? 'Geteilte Liste „' + list.name + '“ von diesem Gerät entfernen? Für die anderen bleibt sie erhalten.'
    : 'Liste „' + list.name + '“' + (n ? ' samt ' + n + ' archivierten Einkäufen' : '') + ' löschen?';
  if (!confirm(msg)) return;
  if (list.shared && sync) sync.unwatch(list);
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
  renderSyncState();
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
      li.className = 'item' + (p.needed ? ' needed' : '') + (p.needed && p.done ? ' done' : '') + (isNew(state, p) ? ' new' : '');

      const star = iconBtn('mark' + (p.needed ? ' on' : ''), p.needed ? 'starOn' : 'star',
        p.needed ? 'Vom Einkauf entfernen' : 'Zum Einkauf hinzufügen');
      star.addEventListener('click', () => { if (p.needed) { p.needed = false; p.done = false; } else markNeeded(p); save(); render(); });

      const cart = iconBtn('cart' + (p.done ? ' on' : ''), p.done ? 'boxOn' : 'box', 'Im Einkaufswagen');
      cart.disabled = !p.needed;
      cart.addEventListener('click', () => { p.done = !p.done; save(); render(); });

      const nameWrap = document.createElement('div');
      nameWrap.className = 'name';
      const b = document.createElement('b'); b.textContent = p.name;
      nameWrap.appendChild(b);
      const meta = [p.note, state.shared && p.needed && p.by && p.by !== db.userName ? 'von ' + p.by : ''].filter(Boolean).join(' · ');
      if (meta) { const n = document.createElement('div'); n.className = 'note'; n.textContent = meta; nameWrap.appendChild(n); }
      nameWrap.addEventListener('click', () => { if (!p.needed) markNeeded(p); else p.done = !p.done; save(); render(); });

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
  if (q) {
    const matches = catalogMatches(q);
    const exact = matches.find(m => lc(m.name) === q);
    const rest = matches.filter(m => m !== exact);
    if (rest.length) {
      const none = listEl.querySelector(':scope > .empty');
      if (none) none.remove();
      listEl.prepend(suggestionBox(rest));
    }
    listEl.prepend(quickAddButton($('#search').value.trim(), exact));
  }
  $('#counter').textContent = doneTotal + ' / ' + needTotal;
  $('#btnOnlyNeeded').classList.toggle('on', state.onlyNeeded);
}

const lc = s => s.toLowerCase();

/* Produkte aus anderen Listen und der Vorlage, die zur Suche passen und hier noch fehlen */
function catalogMatches(q) {
  const have = new Set();
  state.sections.forEach(s => s.products.forEach(p => have.add(lc(p.name))));
  const out = new Map();
  const add = (name, section, from) => {
    const k = lc(name);
    if (k.includes(q) && !have.has(k) && !out.has(k)) out.set(k, { name, section, from });
  };
  db.lists.forEach(l => { if (l !== state) l.sections.forEach(s => s.products.forEach(p => add(p.name, s.name, l.name))); });
  db.template.forEach(t => t.products.forEach(n => add(n, t.name, 'Vorlage')));
  const starts = m => lc(m.name).startsWith(q) ? 0 : 1;
  return [...out.values()].sort((a, b) => starts(a) - starts(b) || a.name.localeCompare(b.name, 'de')).slice(0, 6);
}
/* Produkt in die aktuelle Liste übernehmen – in den gleichnamigen Abschnitt (wird bei Bedarf angelegt) */
function adopt(m) {
  let sec = state.sections.find(s => lc(s.name) === lc(m.section));
  if (!sec) { sec = { id: uid(), name: m.section, collapsed: false, products: [] }; state.sections.push(sec); }
  addProductTo(sec, m.name, '', true);
  $('#search').value = ''; save(); render(); toast('„' + m.name + '“ übernommen und markiert');
}
function suggestionBox(matches) {
  const box = document.createElement('div');
  box.className = 'suggest';
  box.innerHTML = '<div class="suggest-head">Aus anderen Listen</div>';
  matches.forEach(m => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = ICON.plus + '<span class="sg-name"></span><span class="sg-from"></span>';
    b.querySelector('.sg-name').textContent = m.name;
    b.querySelector('.sg-from').textContent = m.section + ' · ' + m.from;
    b.addEventListener('click', () => adopt(m));
    box.appendChild(b);
  });
  return box;
}

/* Suchtreffer ohne exakten Namen → anlegen (oder aus anderer Liste übernehmen); vorhanden, aber ausgeblendet → markieren */
function quickAddButton(name, exact) {
  let found = null;
  state.sections.forEach(s => s.products.forEach(p => { if (p.name.toLowerCase() === name.toLowerCase()) found = p; }));
  if (found && (found.needed || !state.onlyNeeded)) return '';
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'quick-add'; b.id = 'quickAdd';
  b.innerHTML = ICON.plus + '<span></span>';
  b.querySelector('span').textContent = found ? '„' + found.name + '“ auf die Liste setzen'
    : exact ? '„' + exact.name + '“ übernehmen (' + exact.section + ')' : '„' + name + '“ hinzufügen';
  b.addEventListener('click', () => {
    if (!found && exact) return adopt(exact);
    if (!found) return openProduct(null, null, name);
    markNeeded(found);
    $('#search').value = ''; save(); render(); toast('Markiert');
  });
  return b;
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
      if (p) markNeeded(p);
      else { sec.products.push({ id: uid(), name: i.name, note: i.note, needed: true, done: false, by: db.userName, at: Date.now() }); created++; }
    });
  });
  state.trip = null;
  save(); render(); $('#dlgArchive').close();
  toast('Liste übernommen' + (created ? ' (' + created + ' Produkte neu angelegt)' : ''));
  setTimeout(() => openTripDialog('edit', trip.store !== 'Unbekannt' ? trip.store : ''), 150);
}

/* ---------- Produkt-Dialog ---------- */
const lastSection = {}; // zuletzt gewählter Abschnitt je Liste (nur für diese Sitzung)

function openProduct(sec, product, presetName) {
  editing = product ? { sectionId: sec.id, productId: product.id } : null;
  $('#dlgProductTitle').textContent = product ? 'Produkt bearbeiten' : 'Produkt hinzufügen';
  const sel = $('#pSection');
  sel.innerHTML = '';
  // aktuelle Liste zuerst, danach die übrigen – so lassen sich Produkte auch in andere Listen legen
  [state, ...db.lists.filter(l => l !== state)].forEach(list => {
    const g = document.createElement('optgroup');
    g.label = list === state ? list.name + ' (diese Liste)' : list.name;
    const opts = list.sections.length ? list.sections : [{ id: '', name: 'Allgemein' }];
    opts.forEach(s => {
      const o = document.createElement('option'); o.value = list.id + '|' + s.id;
      o.textContent = list === state ? s.name : list.name + ' › ' + s.name;
      g.appendChild(o);
    });
    sel.appendChild(g);
  });
  const remembered = state.sections.find(s => s.id === lastSection[state.id]);
  const def = sec || remembered || state.sections[0];
  sel.value = state.id + '|' + (def ? def.id : '');
  $('#pName').value = product ? product.name : (presetName || '');
  $('#pNote').value = product ? (product.note || '') : '';
  $('#pCopy').checked = false;
  tplInitial = !!product && inTemplate(product.name);
  $('#pTemplate').checked = tplInitial;
  toggleCopy();
  $('#dlgProduct').showModal();
  setTimeout(() => $('#pName').focus(), 50);
}
let tplInitial = false; // stand das Produkt beim Öffnen des Dialogs schon in der Vorlage?
const inTemplate = name => db.template.some(t => t.products.some(n => lc(n) === lc(name)));
function removeFromTemplate(name) { db.template.forEach(t => { t.products = t.products.filter(n => lc(n) !== lc(name)); }); }
function addToTemplate(name, sectionName) {
  if (inTemplate(name)) return;
  let t = db.template.find(x => lc(x.name) === lc(sectionName));
  if (!t) { t = { name: sectionName, products: [] }; db.template.push(t); }
  t.products.push(name);
}

function targetList() { return db.lists.find(l => l.id === $('#pSection').value.split('|')[0]) || state; }
function toggleCopy() { $('#pCopyWrap').classList.toggle('hidden', !editing || targetList() === state); }
$('#pSection').addEventListener('change', toggleCopy);

/* Auf den Einkaufszettel setzen – merkt sich, wer und wann (für „von …“ und „neu“ in geteilten Listen) */
function markNeeded(p) { p.needed = true; p.done = false; p.by = db.userName; p.at = Date.now(); }

/* Legt ein Produkt im Abschnitt an oder markiert ein gleichnamiges; true = neu angelegt */
function addProductTo(sec, name, note, needed) {
  const dupe = sec.products.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (dupe) {
    if (needed) markNeeded(dupe);
    dupe.note = note || dupe.note;
    return false;
  }
  sec.products.push({ id: uid(), name, note, needed, done: false, by: db.userName, at: Date.now() });
  return true;
}

$('#formProduct').addEventListener('submit', e => {
  if (!(e.submitter && e.submitter.value === 'ok')) { editing = null; return; }
  const name = $('#pName').value.trim();
  if (!name) { e.preventDefault(); return; }
  const note = $('#pNote').value.trim();
  const list = targetList();
  const secId = $('#pSection').value.split('|')[1];
  let target = list.sections.find(s => s.id === secId);
  if (!target) { target = { id: uid(), name: 'Allgemein', collapsed: false, products: [] }; list.sections.push(target); }
  const where = list === state ? '' : ' in „' + list.name + '“';
  // Vorlage pflegen: hinzufügen, wenn angehakt; entfernen nur, wenn das Häkchen bewusst gelöst wurde
  const oldName = editing ? (state.sections.find(s => s.id === editing.sectionId).products.find(x => x.id === editing.productId) || {}).name : '';
  if (oldName && lc(oldName) !== lc(name) && inTemplate(oldName)) { removeFromTemplate(oldName); addToTemplate(name, target.name); }
  if ($('#pTemplate').checked) addToTemplate(name, target.name);
  else if (tplInitial) removeFromTemplate(name);

  if (editing) {
    const src = state.sections.find(s => s.id === editing.sectionId);
    const p = src.products.find(x => x.id === editing.productId);
    if (list === state) {
      p.name = name; p.note = note;
      if (src.id !== target.id) { src.products = src.products.filter(x => x.id !== p.id); target.products.push(p); }
      toast('Gespeichert');
    } else {
      const keep = $('#pCopy').checked;
      if (keep) { p.name = name; p.note = note; }
      else src.products = src.products.filter(x => x.id !== p.id);
      addProductTo(target, name, note, p.needed);
      toast((keep ? 'Kopiert' : 'Verschoben') + where);
    }
  } else {
    const isNew = addProductTo(target, name, note, true);
    toast((isNew ? 'Hinzugefügt und markiert' : 'Bereits vorhanden – markiert') + where);
    $('#search').value = '';
  }
  lastSection[list.id] = target.id;
  editing = null; save(); render();
});

/* ---------- Abschnitt-Dialog ---------- */
function openSection(sec) {
  editingSection = sec ? sec.id : null;
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
  const sec = editingSection && state.sections.find(x => x.id === editingSection);
  if (sec) sec.name = name;
  else state.sections.push({ id: uid(), name, collapsed: false, products: [] });
  editingSection = null; save(); render();
});

/* ---------- Reihenfolge ändern (Abschnitte / Listen) ---------- */
function openOrder(title, getItems) {
  $('#dlgOrderTitle').textContent = title;
  const draw = () => {
    const items = getItems();
    const ul = $('#orderList');
    ul.innerHTML = '';
    items.forEach((item, i) => {
      const li = document.createElement('li');
      const n = document.createElement('span'); n.textContent = item.name;
      const up = iconBtn('act', 'up', 'Nach oben');
      const down = iconBtn('act', 'down', 'Nach unten');
      up.disabled = i === 0; down.disabled = i === items.length - 1;
      const move = d => { items.splice(i + d, 0, items.splice(i, 1)[0]); save(); draw(); refresh(); };
      up.addEventListener('click', () => move(-1));
      down.addEventListener('click', () => move(1));
      li.append(n, up, down);
      ul.appendChild(li);
    });
  };
  draw();
  $('#dlgOrder').showModal();
}

/* ---------- Menü & Aktionen ---------- */
function closeMenus() { $('#menu').classList.add('hidden'); $('#homeMenu').classList.add('hidden'); }
$('#btnMenu').addEventListener('click', e => { e.stopPropagation(); $('#menu').classList.toggle('hidden'); });
$('#btnHomeMenu').addEventListener('click', e => { e.stopPropagation(); $('#homeMenu').classList.toggle('hidden'); });
document.addEventListener('click', closeMenus);
$('#menu').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  closeMenus();
  ({ addProduct: () => openProduct(null, null),
     addSection: () => openSection(null),
     renameList: () => openListDialog(state),
     share: () => shareList(state),
     orderSections: () => openOrder('Abschnitte sortieren', () => state.sections),
     archive: () => { archiveTab = 'list'; openArchive(); },
     stats: () => { archiveTab = 'stats'; openArchive(); },
     clearMarks, export: exportText })[btn.dataset.act]();
});
$('#homeMenu').addEventListener('click', e => {
  const btn = e.target.closest('[data-act]'); if (!btn) return;
  closeMenus();
  ({ newList: () => openListDialog(null), orderLists: () => openOrder('Listen sortieren', () => db.lists),
     backup: backupJSON, name: () => askName(true),
     restore: () => $('#fileInput').click() })[btn.dataset.act]();
});
$('#fab').addEventListener('click', () => state ? openProduct(null, null) : openListDialog(null));
$('#search').addEventListener('input', render);
$('#search').addEventListener('keydown', e => { if (e.key === 'Enter' && $('#quickAdd')) { e.preventDefault(); $('#quickAdd').click(); } });
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
        if (sync) db.lists.forEach(l => sync.unwatch(l));
        db = { ...data, lastBackup: db.lastBackup, since: db.since, snoozeUntil: db.snoozeUntil, userName: db.userName,
          template: Array.isArray(s.template) ? data.template : db.template };
        save(); renderHome(); toast('Backup geladen');
        if (db.lists.some(l => l.shared)) loadSync().then(m => m && db.lists.forEach(l => l.shared && m.watch(l)));
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

/* ---------- Geteilte Listen (Firebase, siehe sync.js) ---------- */
let sync = null, syncLoading = null;

function loadSync() {
  if (!syncLoading) syncLoading = import('./sync.js').then(async m => {
    if (!m.configured()) throw new Error('nicht eingerichtet');
    await m.init({
      onChange: list => { save(); if (state === list || !state) refresh(); },
      onError: e => { console.error(e); toast('Synchronisierung fehlgeschlagen: ' + (e.code || e.message)); },
      onMissing: list => { toast('Die geteilte Liste „' + list.name + '“ existiert nicht (mehr).'); }
    });
    sync = m;
    db.lists.forEach(l => { if (l.shared) m.watch(l); });
    return m;
  }).catch(e => {
    syncLoading = null;
    toast(e.message === 'nicht eingerichtet' ? 'Teilen ist noch nicht eingerichtet (Firebase, siehe README).' : 'Keine Verbindung zum Teilen-Dienst.');
    console.error(e);
    return null;
  });
  return syncLoading;
}

/* Name einmalig abfragen – wird bei geteilten Listen neben eigenen Produkten angezeigt */
let nameResolve = null;
function askName(force) {
  if (db.userName && !force) return Promise.resolve(db.userName);
  $('#uName').value = db.userName;
  $('#dlgName').showModal();
  setTimeout(() => $('#uName').focus(), 50);
  return new Promise(res => { nameResolve = res; });
}
$('#formName').addEventListener('submit', e => {
  const ok = e.submitter && e.submitter.value === 'ok';
  const name = $('#uName').value.trim();
  if (ok && !name) { e.preventDefault(); return; }
  if (ok) { db.userName = name; save(); refresh(); }
  if (nameResolve) nameResolve(ok ? name : null);
  nameResolve = null;
});

async function shareList(list) {
  if (!list.shared) {
    if (!await askName()) return;
    const m = await loadSync(); if (!m) return;
    list.shared = { id: m.newSharedId() };
    list.seenAt = Date.now();
    m.watch(list, true);
    save(); refresh();
  }
  const link = location.origin + location.pathname + '#/teilen/' + list.shared.id;
  $('#shareLink').value = link;
  $('#btnShareSend').classList.toggle('hidden', !navigator.share);
  $('#btnShareSend').onclick = () => navigator.share({ title: list.name, text: 'Unser Einkaufszettel „' + list.name + '“', url: link }).catch(() => {});
  $('#btnShareCopy').onclick = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => toast('Link kopiert'));
    else { $('#shareLink').select(); document.execCommand('copy'); toast('Link kopiert'); }
  };
  $('#btnShareStop').onclick = () => {
    if (!confirm('Teilen auf diesem Gerät beenden? Die Liste bleibt hier als private Kopie erhalten.')) return;
    if (sync) sync.unwatch(list);
    list.shared = null; save(); refresh();
    $('#dlgShare').close(); toast('Teilen beendet');
  };
  $('#dlgShare').showModal();
}

async function joinShared(sid) {
  const known = db.lists.find(l => l.shared && l.shared.id === sid);
  if (known) return location.replace('#/liste/' + known.id);
  if (!await askName()) return location.replace('#');
  const m = await loadSync();
  if (!m) return location.replace('#');
  const list = newList('Geteilte Liste');
  list.shared = { id: sid };
  list.seenAt = 0;
  db.lists.push(list);
  m.watch(list);
  save();
  location.replace('#/liste/' + list.id);
  toast('Geteilte Liste hinzugefügt');
}

const isNew = (list, p) => !!list.shared && p.needed && p.at > list.seenAt && !!p.by && p.by !== db.userName;
function newCount(list) { return list.sections.reduce((n, s) => n + s.products.filter(p => isNew(list, p)).length, 0); }

function renderSyncState() {
  const el = $('#syncState');
  el.classList.toggle('hidden', !state.shared);
  if (!state.shared) return;
  const st = sync ? sync.status(state) : (navigator.onLine ? 'connecting' : 'offline');
  const text = { live: 'Geteilt – aktuell', pending: 'Geteilt – Änderungen werden gesendet', offline: 'Geteilt – offline, Änderungen werden später gesendet', connecting: 'Geteilt – verbinde…' }[st];
  el.className = 'sync ' + st;
  el.title = text; el.setAttribute('aria-label', text);
}
$('#syncState').addEventListener('click', () => shareList(state));

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
if (db.lists.some(l => l.shared)) loadSync();
window.addEventListener('online', () => state && renderSyncState());
window.addEventListener('offline', () => state && renderSyncState());

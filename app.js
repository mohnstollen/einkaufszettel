/* Einkaufszettel PWA – Daten in localStorage */
const KEY = 'einkaufszettel.v2';
const OLDKEY = 'einkaufszettel.v1';

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

function defaultState() {
  return {
    sections: DEFAULTS.map(([name, products]) => ({
      id: uid(), name, collapsed: false,
      products: products.map(n => ({ id: uid(), name: n, needed: false, done: false, note: '' }))
    })),
    onlyNeeded: false,
    archive: []
  };
}

let state = load();
let editing = null;
let editingSection = null;

function load() {
  try {
    const raw = localStorage.getItem(KEY) || localStorage.getItem(OLDKEY);
    if (!raw) return defaultState();
    const s = JSON.parse(raw);
    if (!s || !Array.isArray(s.sections)) return defaultState();
    // Migration v1 -> v2
    s.sections.forEach(sec => sec.products.forEach(p => {
      if (p.needed === undefined) p.needed = !!p.checked;
      if (p.done === undefined) p.done = false;
      delete p.checked;
    }));
    if (s.onlyNeeded === undefined) s.onlyNeeded = !!s.onlyChecked;
    delete s.onlyChecked;
    if (!Array.isArray(s.archive)) s.archive = [];
    return s;
  } catch { return defaultState(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch {} }

const $ = sel => document.querySelector(sel);
const listEl = $('#list');

/* Sortierung: benötigt (offen) → benötigt (erledigt) → Rest alphabetisch */
function rank(p) { return p.needed ? (p.done ? 1 : 0) : 2; }

function render() {
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
    const cntTxt = need.length
      ? need.filter(p => p.done).length + ' / ' + need.length + ' erledigt'
      : sec.products.length + ' Produkte';
    head.innerHTML = '<span class="chev">▾</span><h2></h2>' +
      '<span class="cnt"></span>' +
      '<button class="act" data-sec-edit title="Abschnitt bearbeiten">✎</button>' +
      '<button class="act del" data-sec-del title="Abschnitt löschen">🗑</button>';
    head.querySelector('h2').textContent = sec.name;
    head.querySelector('.cnt').textContent = cntTxt;
    if (need.length) head.querySelector('.cnt').classList.add('active');
    head.addEventListener('click', e => {
      if (e.target.closest('[data-sec-edit]')) { openSection(sec); return; }
      if (e.target.closest('[data-sec-del]')) { delSection(sec); return; }
      sec.collapsed = !sec.collapsed; save(); render();
    });
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

      // 1) Stern: auf die Einkaufsliste setzen
      const star = document.createElement('button');
      star.className = 'mark' + (p.needed ? ' on' : '');
      star.textContent = p.needed ? '★' : '☆';
      star.title = p.needed ? 'Vom Einkauf entfernen' : 'Zum Einkauf hinzufügen';
      star.addEventListener('click', () => {
        p.needed = !p.needed; if (!p.needed) p.done = false;
        save(); render();
      });

      // 2) Haken: im Einkaufswagen
      const cart = document.createElement('button');
      cart.className = 'cart' + (p.done ? ' on' : '');
      cart.textContent = p.done ? '☑' : '☐';
      cart.title = 'Im Einkaufswagen';
      cart.disabled = !p.needed;
      cart.addEventListener('click', () => { p.done = !p.done; save(); render(); });

      const nameWrap = document.createElement('div');
      nameWrap.className = 'name';
      const b = document.createElement('b'); b.textContent = p.name;
      nameWrap.appendChild(b);
      if (p.note) { const n = document.createElement('div'); n.className = 'note'; n.textContent = p.note; nameWrap.appendChild(n); }
      // Tippen auf den Namen: nicht benötigt → markieren; benötigt → abhaken/zurück
      nameWrap.addEventListener('click', () => {
        if (!p.needed) p.needed = true; else p.done = !p.done;
        save(); render();
      });

      const edit = document.createElement('button');
      edit.className = 'act'; edit.textContent = '✎'; edit.title = 'Bearbeiten';
      edit.addEventListener('click', () => openProduct(sec, p));

      const del = document.createElement('button');
      del.className = 'act del'; del.textContent = '🗑'; del.title = 'Löschen';
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

/* ---------- Neuer Einkauf + Archiv ---------- */
function newTrip() {
  const entries = [];
  state.sections.forEach(s => {
    const need = s.products.filter(p => p.needed);
    if (need.length) entries.push({
      section: s.name,
      items: need.map(p => ({ name: p.name, note: p.note || '', done: !!p.done }))
    });
  });

  if (!entries.length) {
    if (!confirm('Es ist nichts markiert. Trotzdem neuen Einkauf starten?')) return;
  } else {
    const total = entries.reduce((n, e) => n + e.items.length, 0);
    const done = entries.reduce((n, e) => n + e.items.filter(i => i.done).length, 0);
    if (!confirm('Aktuelle Liste (' + done + ' / ' + total + ' erledigt) archivieren und neuen Einkauf starten?')) return;
    state.archive.unshift({ id: uid(), date: new Date().toISOString(), entries });
    state.archive = state.archive.slice(0, 50);
  }

  // Markierungen löschen – Produkte selbst bleiben erhalten
  state.sections.forEach(s => s.products.forEach(p => { p.needed = false; p.done = false; }));
  state.onlyNeeded = false;
  save(); render();
  toast(entries.length ? 'Archiviert – neuer Einkauf gestartet' : 'Neuer Einkauf gestartet');
}

const fmtDate = iso => new Date(iso).toLocaleString('de-DE',
  { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function openArchive() {
  const box = $('#archiveBody');
  box.innerHTML = '';
  if (!state.archive.length) {
    box.innerHTML = '<div class="empty">Noch keine archivierten Einkäufe.</div>';
  }
  state.archive.forEach(trip => {
    const total = trip.entries.reduce((n, e) => n + e.items.length, 0);
    const done = trip.entries.reduce((n, e) => n + e.items.filter(i => i.done).length, 0);
    const det = document.createElement('details');
    det.className = 'trip';
    const sum = document.createElement('summary');
    sum.innerHTML = '<span class="trip-date"></span><span class="trip-cnt">' + done + ' / ' + total + '</span>';
    sum.querySelector('.trip-date').textContent = fmtDate(trip.date);
    det.appendChild(sum);

    trip.entries.forEach(e => {
      const h = document.createElement('div'); h.className = 'trip-sec'; h.textContent = e.section;
      det.appendChild(h);
      const ul = document.createElement('ul'); ul.className = 'trip-items';
      e.items.forEach(i => {
        const li = document.createElement('li');
        if (i.done) li.className = 'done';
        li.textContent = (i.done ? '☑ ' : '☐ ') + i.name + (i.note ? ' (' + i.note + ')' : '');
        ul.appendChild(li);
      });
      det.appendChild(ul);
    });

    const actions = document.createElement('div');
    actions.className = 'trip-actions';
    const reuse = document.createElement('button');
    reuse.className = 'btn'; reuse.textContent = 'Als neue Liste übernehmen';
    reuse.addEventListener('click', () => reuseTrip(trip));
    const rm = document.createElement('button');
    rm.className = 'btn ghost'; rm.textContent = 'Löschen';
    rm.addEventListener('click', () => {
      if (!confirm('Diesen Einkauf aus dem Archiv löschen?')) return;
      state.archive = state.archive.filter(t => t.id !== trip.id);
      save(); openArchive();
    });
    actions.append(reuse, rm);
    det.appendChild(actions);
    box.appendChild(det);
  });
  $('#dlgArchive').showModal();
}

function reuseTrip(trip) {
  if (!confirm('Aktuelle Markierungen ersetzen?')) return;
  state.sections.forEach(s => s.products.forEach(p => { p.needed = false; p.done = false; }));
  let missing = 0;
  trip.entries.forEach(e => {
    const sec = state.sections.find(s => s.name === e.section) || state.sections[state.sections.length - 1];
    e.items.forEach(i => {
      const p = sec.products.find(x => x.name.toLowerCase() === i.name.toLowerCase());
      if (p) { p.needed = true; p.done = false; }
      else { sec.products.push({ id: uid(), name: i.name, note: i.note, needed: true, done: false }); missing++; }
    });
  });
  save(); render(); $('#dlgArchive').close();
  toast('Liste übernommen' + (missing ? ' (' + missing + ' neu angelegt)' : ''));
}

/* ---------- Produkt-Dialog ---------- */
function openProduct(sec, product) {
  editing = product ? { sectionId: sec.id, productId: product.id } : null;
  $('#dlgProductTitle').textContent = product ? 'Produkt bearbeiten' : 'Produkt hinzufügen';
  const sel = $('#pSection');
  sel.innerHTML = '';
  state.sections.forEach(s => {
    const o = document.createElement('option');
    o.value = s.id; o.textContent = s.name;
    sel.appendChild(o);
  });
  sel.value = sec ? sec.id : (state.sections[0] || {}).id;
  $('#pName').value = product ? product.name : '';
  $('#pNote').value = product ? (product.note || '') : '';
  $('#dlgProduct').showModal();
  setTimeout(() => $('#pName').focus(), 50);
}

$('#formProduct').addEventListener('submit', e => {
  const ok = e.submitter && e.submitter.value === 'ok';
  if (!ok) { editing = null; return; }
  const name = $('#pName').value.trim();
  if (!name) { e.preventDefault(); return; }
  const note = $('#pNote').value.trim();
  const target = state.sections.find(s => s.id === $('#pSection').value);

  if (editing) {
    const src = state.sections.find(s => s.id === editing.sectionId);
    const p = src.products.find(x => x.id === editing.productId);
    p.name = name; p.note = note;
    if (src.id !== target.id) {
      src.products = src.products.filter(x => x.id !== p.id);
      target.products.push(p);
    }
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
  const ok = e.submitter && e.submitter.value === 'ok';
  if (!ok) { editingSection = null; return; }
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
  const act = e.target.dataset.act; if (!act) return;
  $('#menu').classList.add('hidden');
  ({ addProduct: () => openProduct(state.sections[0], null),
     addSection: () => openSection(null),
     archive: openArchive,
     clearMarks: clearMarks,
     export: exportText,
     backup: backupJSON,
     restore: () => $('#fileInput').click(),
     reset: resetAll })[act]();
});
$('#btnNewTrip').addEventListener('click', newTrip);
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
  const lines = ['Einkaufszettel – ' + fmtDate(new Date().toISOString()), ''];
  state.sections.forEach(s => {
    const need = s.products.filter(p => p.needed);
    if (!need.length) return;
    lines.push(s.name);
    need.sort((a, b) => (a.done - b.done) || a.name.localeCompare(b.name, 'de'));
    need.forEach(p => lines.push((p.done ? '[x] ' : '[ ] ') + p.name + (p.note ? ' (' + p.note + ')' : '')));
    lines.push('');
  });
  const txt = lines.length > 2 ? lines.join('\n').trim() : 'Nichts markiert.';
  $('#dlgTextTitle').textContent = 'Einkaufsliste';
  $('#txtArea').value = txt;
  $('#btnTextOk').onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(txt).then(() => toast('Kopiert')); };
  $('#dlgText').showModal();
}
function backupJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'einkaufszettel-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click(); URL.revokeObjectURL(a.href);
}
$('#fileInput').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const s = JSON.parse(await f.text());
    if (!Array.isArray(s.sections)) throw new Error('Format');
    if (!Array.isArray(s.archive)) s.archive = [];
    s.sections.forEach(sec => sec.products.forEach(p => {
      if (p.needed === undefined) p.needed = !!p.checked;
      if (p.done === undefined) p.done = false;
      delete p.checked;
    }));
    state = s; save(); render(); toast('Backup geladen');
  } catch { alert('Datei konnte nicht gelesen werden.'); }
  e.target.value = '';
});

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
}

render();

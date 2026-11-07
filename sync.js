/* Abgleich geteilter Listen über Firebase Firestore.
   Firestore-Aufbau: lists/{id} (Name, Einkauf), darunter sections/, products/, archive/ – je ein Dokument.
   Die App ändert ihre Listen wie gewohnt; push() vergleicht mit dem zuletzt bekannten Firestore-Stand
   und schreibt nur geänderte Felder. Eingehende Änderungen bauen die lokale Liste neu auf. */
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
const COLL = { s: 'sections', p: 'products', a: 'archive' };

let F, A, fdb, auth, api;
const subs = new Map(); // lokale Listen-ID → Abo

export const configured = () => !!firebaseConfig.apiKey;

export async function init(callbacks) {
  api = callbacks;
  const [{ initializeApp }, Au, Fs] = await Promise.all(
    ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(f => import(SDK + f)));
  F = Fs; A = Au;
  const app = initializeApp(firebaseConfig);
  auth = A.getAuth(app);
  // Lokaler Cache in IndexedDB: Listen funktionieren offline, Änderungen werden nachgeliefert
  fdb = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  if (firebaseConfig.emulator) {
    const { host, firestorePort, authPort } = firebaseConfig.emulator;
    F.connectFirestoreEmulator(fdb, host, firestorePort);
    A.connectAuthEmulator(auth, 'http://' + host + ':' + authPort, { disableWarnings: true });
  }
  await auth.authStateReady();
  if (!auth.currentUser) await A.signInAnonymously(auth);
}

/* 128 Bit Zufall als Listen-ID – zugleich der „Schlüssel“ im Einladungslink */
export function newSharedId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map(x => x.toString(36).padStart(2, '0')).join('');
}

function flatten(list) {
  const m = new Map();
  m.set('meta', { name: list.name, trip: list.trip, lastStore: list.lastStore });
  list.sections.forEach((s, i) => {
    m.set('s/' + s.id, { name: s.name, order: i });
    s.products.forEach(p => m.set('p/' + p.id,
      { name: p.name, note: p.note, sectionId: s.id, needed: p.needed, done: p.done, by: p.by || '', at: p.at || 0 }));
  });
  list.archive.forEach(t => m.set('a/' + t.id,
    { store: t.store, tripDate: t.tripDate, archivedAt: t.archivedAt, entries: t.entries }));
  return m;
}
function ref(sid, key) {
  if (key === 'meta') return F.doc(fdb, 'lists', sid);
  const [k, id] = key.split('/');
  return F.doc(fdb, 'lists', sid, COLL[k], id);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Lokale Änderungen einer geteilten Liste hochladen (nur Unterschiede) */
export function push(list) {
  const sub = subs.get(list.id);
  if (!sub || !sub.ready) return;
  const cur = flatten(list);
  const ops = [];
  cur.forEach((d, key) => {
    const old = sub.base.get(key);
    if (!old) return ops.push([key, d]);
    const diff = {};
    for (const f in d) if (!same(d[f], old[f])) diff[f] = d[f];
    if (Object.keys(diff).length) ops.push([key, diff]);
  });
  sub.base.forEach((_, key) => { if (!cur.has(key)) ops.push([key, null]); });
  if (!ops.length) return;
  ops.forEach(([key, d]) => d ? sub.base.set(key, { ...sub.base.get(key), ...d }) : sub.base.delete(key));
  for (let i = 0; i < ops.length; i += 400) {
    const batch = F.writeBatch(fdb);
    ops.slice(i, i + 400).forEach(([key, d]) =>
      d ? batch.set(ref(sub.sid, key), d, { merge: true }) : batch.delete(ref(sub.sid, key)));
    batch.commit().catch(e => api.onError(e));
  }
}

/* Lokale Liste aus dem Firestore-Stand neu aufbauen (Einklapp-Zustand bleibt erhalten) */
function rebuild(list, sub) {
  const meta = sub.base.get('meta') || {};
  if (meta.name) list.name = meta.name;
  list.trip = meta.trip || null;
  list.lastStore = meta.lastStore || '';
  const entries = [...sub.base.entries()];
  const of = prefix => entries.filter(([k]) => k.startsWith(prefix)).map(([k, d]) => [k.slice(2), d]);
  const old = new Map(list.sections.map(s => [s.id, s]));
  const byId = new Map();
  const sections = of('s/').sort((a, b) => (a[1].order || 0) - (b[1].order || 0)).map(([id, d]) => {
    const s = { id, name: d.name || 'Allgemein', collapsed: old.has(id) && old.get(id).collapsed, products: [] };
    byId.set(id, s);
    return s;
  });
  of('p/').forEach(([id, d]) => {
    let s = byId.get(d.sectionId);
    if (!s) { // Abschnitt fehlt (z. B. gleichzeitig gelöscht) → Produkt nicht verlieren
      s = { id: d.sectionId || 'allgemein', name: 'Allgemein', collapsed: false, products: [] };
      byId.set(s.id, s); sections.push(s);
    }
    s.products.push({ id, name: d.name || '', note: d.note || '', needed: !!d.needed, done: !!d.done, by: d.by || '', at: d.at || 0 });
  });
  list.sections = sections;
  list.archive = of('a/').map(([id, d]) => ({ id, ...d }))
    .sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
}

/* Geteilte Liste beobachten. fresh = gerade erst geteilt → lokaler Stand wird hochgeladen */
export function watch(list, fresh) {
  if (subs.has(list.id)) return;
  const sub = { sid: list.shared.id, base: new Map(), ready: !!fresh, got: new Set(), pending: {}, fromCache: true, unsubs: [] };
  subs.set(list.id, sub);
  if (fresh) push(list);

  const handle = prefix => snap => {
    if (prefix === 'meta') { if (snap.exists()) sub.base.set('meta', snap.data()); }
    else snap.docChanges().forEach(c => {
      const key = prefix + '/' + c.doc.id;
      if (c.type === 'removed') sub.base.delete(key); else sub.base.set(key, c.doc.data());
    });
    sub.pending[prefix] = snap.metadata.hasPendingWrites;
    sub.fromCache = snap.metadata.fromCache;
    sub.got.add(prefix);
    if (!sub.ready && sub.got.size === 4) sub.ready = true;
    if (!sub.ready) return;
    if (!sub.base.has('meta') && !snap.metadata.fromCache) return api.onMissing(list);
    rebuild(list, sub);
    api.onChange(list);
  };
  const opt = { includeMetadataChanges: true };
  const onErr = e => api.onError(e);
  sub.unsubs.push(F.onSnapshot(ref(sub.sid, 'meta'), opt, handle('meta'), onErr));
  for (const k in COLL) sub.unsubs.push(F.onSnapshot(F.collection(fdb, 'lists', sub.sid, COLL[k]), opt, handle(k), onErr));
}

export function unwatch(list) {
  const sub = subs.get(list.id);
  if (!sub) return;
  sub.unsubs.forEach(u => u());
  subs.delete(list.id);
}

/* 'connecting' | 'offline' | 'pending' | 'live' */
export function status(list) {
  const sub = subs.get(list.id);
  if (!sub || !sub.ready) return 'connecting';
  if (Object.values(sub.pending).some(Boolean)) return navigator.onLine ? 'pending' : 'offline';
  return sub.fromCache && !navigator.onLine ? 'offline' : 'live';
}

/* ---------- Cloud-Sicherung mit Google-Konto ----------
   users/{uid}            { updatedAt, device, parts, listen, rezepte }
   users/{uid}/teile/{i}  { data }   – die Sicherung als JSON, in Teile zerlegt (Firestore: max. 1 MiB je Dokument) */
const PART_SIZE = 700_000;

export function account() {
  const u = auth && auth.currentUser;
  const google = u && u.providerData.find(p => p.providerId === 'google.com');
  return google ? { uid: u.uid, email: google.email || u.email || '', name: google.displayName || '' } : null;
}

/* Anmelden: die bisherige anonyme Anmeldung wird mit dem Google-Konto verknüpft (gleiche uid, geteilte Listen
   laufen weiter). Ist das Google-Konto schon mit einer anderen uid verknüpft (z. B. von einem anderen Gerät),
   wird zu dieser gewechselt. */
export async function signInWithGoogle() {
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  // nur für Tests mit dem Auth-Emulator: Test-Google-Konto statt Popup
  const testUser = firebaseConfig.emulator && firebaseConfig.emulator.googleTestUser;
  const testCred = testUser && A.GoogleAuthProvider.credential(JSON.stringify(testUser));
  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      await (testCred ? A.linkWithCredential(auth.currentUser, testCred) : A.linkWithPopup(auth.currentUser, provider));
    } else await (testCred ? A.signInWithCredential(auth, testCred) : A.signInWithPopup(auth, provider));
  } catch (e) {
    if (e.code !== 'auth/credential-already-in-use') throw e;
    const cred = A.GoogleAuthProvider.credentialFromError(e) || testCred;
    if (!cred) throw e;
    await A.signInWithCredential(auth, cred);
  }
  return account();
}

export async function signOutGoogle() {
  await A.signOut(auth);
  await A.signInAnonymously(auth); // geteilte Listen brauchen weiterhin eine (anonyme) Anmeldung
}

function userDoc() {
  const a = account();
  if (!a) throw Object.assign(new Error('nicht angemeldet'), { code: 'not-signed-in' });
  return F.doc(fdb, 'users', a.uid);
}

/* Stand der Sicherung → { updatedAt, device, listen, rezepte } oder null. Bevorzugt vom Server, offline aus dem Cache */
export async function backupInfo() {
  const ref = userDoc();
  let snap;
  try { snap = await F.getDocFromServer(ref); } catch { snap = await F.getDoc(ref).catch(() => null); }
  return snap && snap.exists() ? snap.data() : null;
}

export async function uploadBackup(json, { device, listen, rezepte }) {
  const ref = userDoc();
  const parts = [];
  for (let i = 0; i < json.length; i += PART_SIZE) parts.push(json.slice(i, i + PART_SIZE));
  const updatedAt = Date.now();
  const batch = F.writeBatch(fdb);
  parts.forEach((data, i) => batch.set(F.doc(ref, 'teile', String(i)), { data }));
  batch.set(ref, { updatedAt, device, parts: parts.length, listen, rezepte });
  // ohne Netz bestätigt Firestore erst später – lokal ist die Sicherung dann schon vorgemerkt
  await Promise.race([batch.commit(), new Promise(r => setTimeout(r, 8000))]);
  return updatedAt;
}

export async function downloadBackup() {
  const info = await backupInfo();
  if (!info) return null;
  const ref = userDoc();
  const parts = await Promise.all(Array.from({ length: info.parts }, (_, i) =>
    F.getDocFromServer(F.doc(ref, 'teile', String(i))).catch(() => F.getDoc(F.doc(ref, 'teile', String(i))))));
  if (parts.some(p => !p.exists())) throw new Error('Sicherung unvollständig');
  return { info, json: parts.map(p => p.data().data).join('') };
}


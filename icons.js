/* Eingebettete SVG-Icons – unabhängig von Emoji-Schriften */
const SVG = (path, extra = '') =>
  '<svg class="ic" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" ' +
  'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' + extra + '>' + path + '</svg>';

const ICON = {
  store: SVG('<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z"/><path d="M5 13v8h14v-8"/><path d="M10 21v-5h4v5"/>'),
  calendar: SVG('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>'),
  edit: SVG('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: SVG('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>'),
  chevron: SVG('<path d="M6 9l6 6 6-6"/>'),
  star: SVG('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>'),
  starOn: SVG('<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z" fill="currentColor"/>'),
  box: SVG('<rect x="4" y="4" width="16" height="16" rx="3"/>'),
  boxOn: SVG('<rect x="4" y="4" width="16" height="16" rx="3" fill="currentColor"/><path d="M8 12.5l3 3 5-6" stroke="#fff"/>'),
  archive: SVG('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  chart: SVG('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  plus: SVG('<path d="M12 5v14M5 12h14"/>'),
  more: SVG('<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'),
  check: SVG('<path d="M5 12.5l4.5 4.5L19 7"/>'),
  open: SVG('<rect x="4" y="4" width="16" height="16" rx="3"/>')
};

/* Statische Platzhalter im HTML füllen: <span data-icon="store"></span> */
function applyIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = ICON[el.dataset.icon] || ''; });
}

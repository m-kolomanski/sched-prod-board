import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('[data-role="error"]');
const status = document.querySelector('[data-role="status"]');
const panel = document.querySelector('[data-testid="incident-panel"]');

// R6: footer shows the same sha as <meta name="build">.
const build = document.querySelector('meta[name="build"]')?.content || 'dev';
document.querySelector('[data-testid="build-sha"]').textContent = build;

// R5: viewer's own time zone and locale order (en-GB/de-DE → day before month).
const timeFmt = new Intl.DateTimeFormat(undefined, {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
});
export function localTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : timeFmt.format(d);
}

const incidents = new Map(); // incident id → latest incident data
const rows = new Map(); // incident id → <li>, kept across refreshes (rows are never removed or moved)
const acked = new Map(); // incident id → ack reply
const pending = new Set(); // incident ids with an ack in flight
let selectedId = null; // the incident the panel shows; bound by id, not by position

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'testid') n.dataset.testid = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else n[k] = v;
  }
  n.append(...children);
  return n;
}

function markRowAcked(li) {
  li.classList.add('is-acked');
  const act = li.querySelector('.act');
  if (!act.querySelector('[data-testid="acked"]')) {
    act.replaceChildren(el('span', { testid: 'acked', className: 'acked', textContent: '✓ acked' }));
  }
}

// SCHED-4515: Ack lives in the panel. The panel names one incident by id; rows moving under it change nothing.
function renderPanel() {
  const i = incidents.get(selectedId);
  if (!i) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  panel.dataset.id = i.id;
  const isAcked = acked.has(i.id);
  const action = isAcked
    ? el('p', { className: 'acked panel-acked', textContent: `✓ ${i.id} acked ${localTime(acked.get(i.id).ackedAt)}` })
    : el('button', {
        type: 'button', testid: 'panel-ack', className: 'ack', disabled: pending.has(i.id),
        textContent: pending.has(i.id) ? `Acking ${i.id}…` : `Ack ${i.id}`,
        onclick: () => onAck(i.id),
      });
  panel.replaceChildren(
    el('div', { className: 'panel-head' },
      el('h2', { textContent: i.id }),
      el('button', { type: 'button', className: 'close', title: 'Close', ariaLabel: 'Close panel', textContent: '×', onclick: () => select(null) }),
    ),
    el('p', { className: `sev ${i.severity}`, textContent: i.severity }),
    el('dl', {},
      el('dt', { textContent: 'service' }), el('dd', { textContent: i.service }),
      el('dt', { textContent: 'region' }), el('dd', { textContent: i.region }),
      el('dt', { textContent: 'summary' }), el('dd', { textContent: i.summary }),
      el('dt', { textContent: 'opened' }), el('dd', {}, el('time', { dateTime: i.openedAt, title: i.openedAt, textContent: localTime(i.openedAt) })),
    ),
    action,
  );
}

function select(id) {
  rows.get(selectedId)?.classList.remove('is-selected');
  rows.get(selectedId)?.setAttribute('aria-pressed', 'false');
  selectedId = id;
  rows.get(id)?.classList.add('is-selected');
  rows.get(id)?.setAttribute('aria-pressed', 'true');
  renderPanel();
}

async function onAck(id) {
  if (pending.has(id) || acked.has(id)) return;
  pending.add(id);
  renderPanel();
  try {
    const reply = await ack(id); // R2, now from the panel
    acked.set(id, reply);
    markRowAcked(rows.get(id));
  } catch (err) {
    console.error(err);
    showError(`Ack failed for ${id}: ${err.message}`);
  } finally {
    pending.delete(id);
    if (selectedId === id) renderPanel();
  }
}

function buildRow(i) {
  const li = el('li', {
    testid: 'incident-row', dataset: { id: i.id }, className: `row ${i.severity}`,
    tabIndex: 0, title: `Open ${i.id}`,
  },
    el('span', { className: 'id', textContent: i.id }),
    el('span', { className: 'sev', textContent: i.severity }),
    el('span', { className: 'what', textContent: `${i.service} · ${i.region} · ${i.summary}` }),
    el('time', { dateTime: i.openedAt, title: i.openedAt, textContent: localTime(i.openedAt) }),
    el('span', { className: 'act' }, el('span', { className: 'open', textContent: 'Open ›' })),
  );
  li.setAttribute('role', 'button');
  li.setAttribute('aria-pressed', 'false');
  li.addEventListener('click', () => select(i.id));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(i.id); }
  });
  if (acked.has(i.id)) markRowAcked(li);
  return li;
}

// R1: newest first, live. New incidents go in above older ones; existing rows stay in the DOM untouched.
function render(page) {
  for (const i of page.incidents) incidents.set(i.id, i);
  const fresh = page.incidents
    .filter((i) => !rows.has(i.id))
    .sort((a, b) => Date.parse(a.openedAt) - Date.parse(b.openedAt)); // oldest first, each goes on top
  for (const i of fresh) {
    const li = buildRow(i);
    rows.set(i.id, li);
    // place before the first existing row that is older than it (newest first)
    const after = [...rows.keys()].filter((id) => id !== i.id && Date.parse(incidents.get(id).openedAt) <= Date.parse(i.openedAt));
    const ref = list.firstChild && after.length
      ? [...list.children].find((n) => after.includes(n.dataset.id)) ?? null
      : null;
    list.insertBefore(li, ref);
    if (loaded) {
      li.classList.add('is-new');
      setTimeout(() => li.classList.remove('is-new'), 4000);
    }
  }
  empty.hidden = rows.size > 0;
  // The panel is not re-rendered on refresh: its Ack never moves or changes under a pointer.
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

let loaded = false;
async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page);
    errorBox.hidden = true;
    status.textContent = `updated ${new Date(page.updatedAt || Date.now()).toLocaleTimeString()}`;
    if (!loaded) {
      loaded = true;
      loader.remove(); // R3: gone once incidents load
      board.setAttribute('aria-busy', 'false');
    }
  } catch (err) {
    console.error(err);
    showError(`Could not load incidents: ${err.message}. Retrying…`);
    status.textContent = 'offline';
  } finally {
    setTimeout(refresh, REFRESH_MS); // R4: every 2 s while open, no overlapping requests
  }
}

document.addEventListener('keydown', (e) => { if (e.key === 'Escape') select(null); });
board.setAttribute('aria-busy', 'true');
refresh();

import { fetchIncidents, ack } from './api.js';

const REFRESH_MS = 2000; // R4

const board = document.querySelector('[data-testid="board"]');
const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('[data-role="error"]');
const status = document.querySelector('[data-role="status"]');

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

const rows = new Map(); // incident id → <li>, kept across refreshes
const acked = new Map(); // incident id → ack reply, survives every re-render

function markAcked(li, reply) {
  li.classList.add('is-acked');
  const btn = li.querySelector('[data-testid="ack"]');
  if (btn) btn.remove();
  if (!li.querySelector('[data-testid="acked"]')) {
    const mark = document.createElement('span');
    mark.dataset.testid = 'acked';
    mark.className = 'acked';
    mark.textContent = '✓ acked';
    if (reply?.ackedAt) mark.title = `acked ${localTime(reply.ackedAt)}`;
    li.querySelector('.act').append(mark);
  }
}

async function onAck(id, li, btn) {
  btn.disabled = true;
  btn.textContent = 'Acking…';
  try {
    const reply = await ack(id); // R2
    acked.set(id, reply);
    markAcked(li, reply);
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = 'Retry ack';
    showError(`Ack failed for ${id}: ${err.message}`);
  }
}

function span(cls, text) {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
}

function buildRow(i) {
  const li = document.createElement('li');
  li.dataset.testid = 'incident-row';
  li.dataset.id = i.id;
  li.className = `row ${i.severity}`;
  const time = document.createElement('time');
  time.dateTime = i.openedAt;
  time.textContent = localTime(i.openedAt);
  time.title = i.openedAt;
  const act = span('act', '');
  li.append(
    span('id', i.id),
    span('sev', i.severity),
    span('what', `${i.service} · ${i.region} · ${i.summary}`),
    time,
    act,
  );
  if (acked.has(i.id)) {
    markAcked(li, acked.get(i.id));
  } else {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.dataset.testid = 'ack';
    btn.className = 'ack';
    btn.textContent = 'Ack';
    btn.addEventListener('click', () => onAck(i.id, li, btn));
    act.append(btn);
  }
  return li;
}

// R1: newest first. Existing rows are reused, so Ack state and focus survive a refresh.
function render(incidents) {
  const sorted = [...incidents].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  const seen = new Set();
  let prev = null;
  for (const i of sorted) {
    seen.add(i.id);
    let li = rows.get(i.id);
    if (!li) {
      li = buildRow(i);
      li.classList.add('is-new');
      setTimeout(() => li.classList.remove('is-new'), 4000);
      rows.set(i.id, li);
    }
    const want = prev ? prev.nextSibling : list.firstChild;
    if (li !== want) list.insertBefore(li, want);
    prev = li;
  }
  for (const [id, li] of rows) {
    if (!seen.has(id)) { li.remove(); rows.delete(id); }
  }
  empty.hidden = sorted.length > 0;
}

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.hidden = false;
}

let loaded = false;
async function refresh() {
  try {
    const page = await fetchIncidents();
    render(page.incidents);
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

board.setAttribute('aria-busy', 'true');
refresh();

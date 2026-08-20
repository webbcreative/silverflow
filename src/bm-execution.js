import { BLACK_MARKET, QUALITY_NORMAL, SERVERS } from './constants.js';
import { fmtAge, fmtSilver } from './format.js';
import { quoteAgeHours } from './engine.js';

const quoteCache = new Map();
let scheduled = false;

export function fillGapPct(buyPrice, sellPrice) {
  const buy = Number(buyPrice || 0);
  const sell = Number(sellPrice || 0);
  if (!(buy > 0) || !(sell > 0)) return null;
  return (sell - buy) / buy;
}

export function executionCopy(mode = 'instant') {
  if (mode === 'order') {
    return {
      scannerNote: 'List-order projections assume the order eventually fills at the modeled target price. Albion Online Data Project top quotes do not include order-book depth, so fill time and full-batch execution are not guaranteed.',
      grossLabel: 'Target list gross sale',
      netLabel: 'Net proceeds if filled',
      profitLabel: 'Projected profit if fully filled',
      batchNetLabel: 'Net if filled',
      batchProfitLabel: 'Projected profit',
    };
  }
  return {
    scannerNote: 'Sell-now projections use the top observed Black Market buy quote. Albion Online Data Project does not expose order-book depth, so ×50/×100 projections assume every unit can clear at that top quote.',
    grossLabel: 'Gross at top buy quote*',
    netLabel: 'Net proceeds at top quote*',
    profitLabel: 'Projected profit at top quote*',
    batchNetLabel: 'Net at top quote*',
    batchProfitLabel: 'Projected profit',
  };
}

function currentMode() {
  return document.querySelector('#sale')?.value || 'instant';
}

function currentServer() {
  return document.querySelector('.segments button.on[data-server]')?.dataset.server || 'west';
}

function currentItemId(drawer) {
  return drawer?.querySelector('.dhead code')?.textContent?.trim() || '';
}

function modeledGrossSale(drawer) {
  const row = [...(drawer?.querySelectorAll('.cost-stack tbody tr') || [])]
    .find(tr => ['BM gross sale', 'Target list gross sale', 'Gross at top buy quote*'].includes(tr.querySelector('th')?.textContent?.trim()));
  return row?.querySelector('td')?.textContent?.trim() || '—';
}

async function fetchBmQuote(server, itemId) {
  const key = `${server}|${itemId}`;
  const cached = quoteCache.get(key);
  if (cached && Date.now() - cached.time < 30_000) return cached.value;
  const host = SERVERS[server]?.host || SERVERS.west.host;
  const url = `${host}/api/v2/stats/prices/${encodeURIComponent(itemId)}.json?locations=${encodeURIComponent(BLACK_MARKET)}&qualities=${QUALITY_NORMAL}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const rows = await response.json();
    const row = rows.find(x => x.item_id === itemId && x.city === BLACK_MARKET) || rows[0] || null;
    quoteCache.set(key, { time: Date.now(), value: row });
    return row;
  } finally {
    clearTimeout(timeout);
  }
}

function setScannerLabels(mode) {
  const copy = executionCopy(mode);
  for (const key of ['royal', 'caer']) {
    const th = document.querySelector(`th[data-sort="${key}"]`);
    if (th && !th.textContent.includes('Projected profit')) th.innerHTML = 'Projected profit / item*<br><small>No focus / Focus</small>';
  }
  for (const key of ['royalProfit50', 'caerProfit50']) {
    const th = document.querySelector(`th[data-sort="${key}"]`);
    if (th && !th.textContent.includes('Projected profit')) th.innerHTML = 'Projected profit ×50*<br><small>Assumes full fill</small>';
  }
  const heading = document.querySelector('.heading');
  if (!heading) return;
  let note = document.querySelector('#execution-assumption-note');
  if (!note) {
    note = document.createElement('div');
    note.id = 'execution-assumption-note';
    note.className = 'execution-assumption-note';
    heading.insertAdjacentElement('afterend', note);
  }
  if (note.textContent !== copy.scannerNote) note.textContent = copy.scannerNote;
}

function renameAnalysisLabels(drawer, mode) {
  const copy = executionCopy(mode);
  for (const card of drawer.querySelectorAll('.analysis-batches > div')) {
    for (const span of card.querySelectorAll('span')) {
      if (span.textContent.startsWith('Net sale ')) span.textContent = `${copy.batchNetLabel} ${span.textContent.slice('Net sale '.length)}`;
    }
    for (const strong of card.querySelectorAll('strong')) {
      if (strong.textContent.startsWith('Profit ')) strong.textContent = `${copy.batchProfitLabel} ${strong.textContent.slice('Profit '.length)}`;
    }
  }
  const rows = [...drawer.querySelectorAll('.cost-stack tbody tr')];
  for (const row of rows) {
    const th = row.querySelector('th');
    if (!th) continue;
    const label = th.textContent.trim();
    if (label === 'BM gross sale') th.textContent = copy.grossLabel;
    if (label === 'Net BM proceeds') th.textContent = copy.netLabel;
    if (label === 'Profit') th.textContent = copy.profitLabel;
  }
}

function quoteCard(label, value, age = null, extra = '') {
  return `<div class="execution-stat"><small>${label}</small><strong>${value}</strong>${age == null ? '' : `<span>${fmtAge(age)}</span>`}${extra ? `<em>${extra}</em>` : ''}</div>`;
}

async function renderExecutionPanel(drawer, mode) {
  const route = drawer.querySelector('.analysis-route');
  if (!route) return;
  const itemId = currentItemId(drawer);
  const server = currentServer();
  if (!itemId) return;
  let panel = drawer.querySelector('.execution-panel');
  if (!panel) {
    panel = document.createElement('section');
    panel.className = 'execution-panel';
    route.insertAdjacentElement('afterend', panel);
  }
  const signature = `${server}|${itemId}|${mode}|${modeledGrossSale(drawer)}`;
  if (panel.dataset.signature === signature && panel.dataset.loaded === 'true') return;
  panel.dataset.signature = signature;
  panel.dataset.loaded = 'false';
  panel.innerHTML = '<div class="execution-loading">Checking latest Black Market top quotes…</div>';
  try {
    const row = await fetchBmQuote(server, itemId);
    if (panel.dataset.signature !== signature) return;
    const buy = Number(row?.buy_price_max || 0);
    const sell = Number(row?.sell_price_min || 0);
    const buyAge = quoteAgeHours(row?.buy_price_max_date);
    const sellAge = quoteAgeHours(row?.sell_price_min_date);
    const modeled = modeledGrossSale(drawer);
    const gap = fillGapPct(buy, sell);
    const gapSilver = buy > 0 && sell > 0 ? sell - buy : null;
    const gapText = gap == null ? '—' : `${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}%`;
    const gapExtra = gapSilver == null ? '' : `${gapSilver >= 0 ? '+' : ''}${fmtSilver(gapSilver)} per item`;
    const cards = mode === 'order'
      ? [
          quoteCard('Modeled list target (scan)', modeled),
          quoteCard('Latest top BM buy', buy > 0 ? fmtSilver(buy) : 'Missing', buyAge),
          quoteCard('Latest lowest BM sell listing', sell > 0 ? fmtSilver(sell) : 'Missing', sellAge),
          quoteCard('Latest buy→sell gap', gapText, null, gapExtra),
        ]
      : [
          quoteCard('Modeled top buy (scan)', modeled),
          quoteCard('Latest top BM buy', buy > 0 ? fmtSilver(buy) : 'Missing', buyAge),
          quoteCard('Latest lowest BM sell listing', sell > 0 ? fmtSilver(sell) : 'Missing', sellAge),
          quoteCard('Order-book depth', 'Unavailable', null, '×50/×100 cannot be guaranteed'),
        ];
    const warning = mode === 'order'
      ? 'A sell order is not guaranteed to fill at the modeled target. It must be reached by Black Market demand and can be delayed by competing/undercutting orders. Batch projections assume every unit eventually fills at that price.'
      : 'The top BM buy quote is an observed best price, not a depth guarantee. The public price feed does not expose how many units are available at that price, so large batches may clear at lower prices or wait for new demand.';
    panel.innerHTML = `<div class="execution-panel-head"><div><b>Black Market execution context</b><small>${mode === 'order' ? 'List order · conditional fill' : 'Sell now · top quote only'}</small></div><span>Latest quote check</span></div><div class="execution-grid">${cards.join('')}</div><p>${warning}</p><p class="fee-assumption">Net proceeds still use Silverflow’s current fee model. This panel changes certainty/wording, not the fee-rate assumptions.</p>`;
    panel.dataset.loaded = 'true';
  } catch (error) {
    if (panel.dataset.signature !== signature) return;
    panel.innerHTML = `<div class="execution-panel-head"><div><b>Black Market execution context</b><small>Latest quote check unavailable</small></div></div><p>Could not refresh the latest Black Market quote (${String(error.message || error)}). The calculation remains a projection based on the scan snapshot; fill and order depth are not guaranteed.</p>`;
    panel.dataset.loaded = 'true';
  }
}

function decorate() {
  if (typeof document === 'undefined') return;
  const mode = currentMode();
  setScannerLabels(mode);
  const drawer = document.querySelector('.drawer');
  if (!drawer) return;
  renameAnalysisLabels(drawer, mode);
  renderExecutionPanel(drawer, mode);
}

function scheduleDecorate() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    decorate();
  });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const start = () => {
    decorate();
    const target = document.querySelector('#app') || document.body;
    new MutationObserver(scheduleDecorate).observe(target, { childList: true, subtree: true });
    document.addEventListener('change', event => {
      if (event.target?.id === 'sale') scheduleDecorate();
    });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

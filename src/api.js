import { BLACK_MARKET, QUALITY_NORMAL, SERVERS } from './constants.js';

const memory = new Map();

function cacheKey(parts) { return parts.join('|'); }
function encodeLocations(locations) { return locations.join(','); }

export function chunkItemIds(ids, maxChars = 2800) {
  const chunks = [];
  let current = [];
  let length = 0;
  for (const id of [...new Set(ids)].filter(Boolean)) {
    const next = id.length + (current.length ? 1 : 0);
    if (current.length && length + next > maxChars) {
      chunks.push(current);
      current = [];
      length = 0;
    }
    current.push(id);
    length += next;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

async function fetchJson(url, cacheMs = 120_000) {
  const cached = memory.get(url);
  if (cached && Date.now() - cached.time < cacheMs) return cached.value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    const value = await res.json();
    memory.set(url, { time: Date.now(), value });
    return value;
  } finally { clearTimeout(timeout); }
}

export async function fetchPrices(server, itemIds, locations, onProgress = () => {}) {
  const host = SERVERS[server].host;
  const chunks = chunkItemIds(itemIds);
  const rows = [];
  let done = 0;
  for (const chunk of chunks) {
    const url = `${host}/api/v2/stats/prices/${encodeURIComponent(chunk.join(','))}.json?locations=${encodeURIComponent(encodeLocations(locations))}&qualities=${QUALITY_NORMAL}`;
    const data = await fetchJson(url);
    rows.push(...data);
    done += 1;
    onProgress(done, chunks.length);
  }
  return rows;
}

function isoDate(d) { return d.toISOString().slice(0, 10); }

export async function fetchHistory(server, itemIds, days = 14, onProgress = () => {}) {
  const host = SERVERS[server].host;
  const chunks = chunkItemIds(itemIds, 2500);
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const rows = [];
  let done = 0;
  for (const chunk of chunks) {
    const url = `${host}/api/v2/stats/history/${encodeURIComponent(chunk.join(','))}.json?date=${isoDate(start)}&end_date=${isoDate(end)}&locations=${encodeURIComponent(BLACK_MARKET)}&qualities=${QUALITY_NORMAL}&time-scale=24`;
    try {
      const data = await fetchJson(url, 600_000);
      rows.push(...data);
    } catch (error) {
      console.warn('History batch failed', error);
    }
    done += 1;
    onProgress(done, chunks.length);
  }
  return rows;
}

export function buildPriceLookup(rows, overrides = []) {
  const map = new Map(rows.map(r => [cacheKey([r.item_id, r.city]), r]));
  const overrideMap = new Map(overrides.map(o => [cacheKey([o.server, o.itemId, o.city, o.side]), Number(o.price)]));
  return {
    get: (itemId, city) => map.get(cacheKey([itemId, city])),
    override: (server, itemId, city, side) => overrideMap.get(cacheKey([server, itemId, city, side])),
  };
}

export function buildVolumeMap(historyRows, days = 14) {
  const map = new Map();
  for (const row of historyRows || []) {
    const total = (row.data || []).reduce((sum, point) => sum + Number(point.item_count || 0), 0);
    const observedDays = Math.max(1, (row.data || []).length || days);
    map.set(row.item_id, total / observedDays);
  }
  return map;
}

export async function loadCatalog() {
  for (const path of ['./data/catalog.json', './data/catalog.seed.json']) {
    try {
      const res = await fetch(path, { cache: 'no-cache' });
      if (res.ok) return { items: await res.json(), source: path.includes('.seed') ? 'seed' : 'generated' };
    } catch { /* try fallback */ }
  }
  throw new Error('No catalog data is available.');
}

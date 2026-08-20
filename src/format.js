export const fmtSilver = value => Number.isFinite(value)
  ? new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(value))
  : '—';
export const fmtPct = value => Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
export const fmtAge = hours => !Number.isFinite(hours) ? 'missing' : hours < 1 ? `${Math.round(hours * 60)}m` : `${hours.toFixed(1)}h`;
export const fmtVolume = value => Number.isFinite(value) ? Number(value).toFixed(value < 10 ? 1 : 0) : '—';
export function humanizeId(id = '') {
  return id.replace(/^T\d_/, '').replace(/@\d$/, '').replace(/_LEVEL\d/g, '').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}
export function itemTierLabel(item) { return `${item.tier}.${item.enchantment || 0}`; }
export function itemIcon(id) { return `https://render.albiononline.com/v1/item/${encodeURIComponent(id)}.png?quality=1&size=64`; }

export const SERVERS = {
  west: { label: 'Americas', host: 'https://west.albion-online-data.com' },
  europe: { label: 'Europe', host: 'https://europe.albion-online-data.com' },
  east: { label: 'Asia', host: 'https://east.albion-online-data.com' },
};

export const ROYAL_CITIES = ['Bridgewatch', 'Fort Sterling', 'Lymhurst', 'Martlock', 'Thetford'];
export const ALL_CRAFT_CITIES = [...ROYAL_CITIES, 'Caerleon'];
export const BLACK_MARKET = 'Black Market';
export const QUALITY_NORMAL = 1;

export const DEFAULT_SETTINGS = {
  server: 'west',
  premium: true,
  wallet: 5_000_000,
  budget: 5_000_000,
  stationFee: 350,
  extraProductionBonus: 0,
  freshnessHours: 12,
  minProfit: 0,
  minRoi: 0,
  minVolume: 0,
  affordableOnly: true,
  tier: 4,
  enchants: [1, 2, 3, 4],
  category: 'all',
  acquisitionMode: 'instant',
  saleMode: 'instant',
  customQuantity: 25,
};

export const STORAGE_KEYS = {
  settings: 'silverflow:settings:v1',
  favorites: 'silverflow:favorites:v1',
  overrides: 'silverflow:overrides:v1',
};

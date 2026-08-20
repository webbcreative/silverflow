import { ROYAL_CITIES } from './constants.js';

export const MARKET_FEES = {
  premiumTax: 0.04,
  nonPremiumTax: 0.08,
  setupFee: 0.025,
};

export function resourceReturnRate({ specialty = false, focus = false, extraProductionBonus = 0 } = {}) {
  const bonus = 0.18 + (specialty ? 0.15 : 0) + (focus ? 0.59 : 0) + Number(extraProductionBonus || 0) / 100;
  return bonus / (1 + bonus);
}

export function quoteAgeHours(timestamp, now = Date.now()) {
  if (!timestamp || String(timestamp).startsWith('0001-')) return Infinity;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return Infinity;
  return Math.max(0, (now - parsed) / 3_600_000);
}

export function freshnessLabel(hours, maxHours = 12) {
  if (!Number.isFinite(hours)) return { label: 'Missing', className: 'missing', factor: 0 };
  if (hours <= maxHours / 2) return { label: 'Fresh', className: 'fresh', factor: 1 };
  if (hours <= maxHours) return { label: 'Aging', className: 'aging', factor: 0.72 };
  return { label: 'Stale', className: 'stale', factor: 0.25 };
}

export function priceFor(record, mode, overrideLookup, server) {
  if (!record) return { price: 0, timestamp: null };
  const side = mode === 'instant' ? 'sell' : 'buy';
  const override = overrideLookup?.(server, record.item_id, record.city, side);
  if (Number.isFinite(override) && override > 0) return { price: override, timestamp: new Date().toISOString(), overridden: true };
  if (mode === 'instant') return { price: Number(record.sell_price_min || 0), timestamp: record.sell_price_min_date };
  return { price: Number(record.buy_price_max || 0), timestamp: record.buy_price_max_date };
}

export function salePriceFor(record, mode, overrideLookup, server) {
  if (!record) return { price: 0, timestamp: null };
  const side = mode === 'instant' ? 'buy' : 'sell';
  const override = overrideLookup?.(server, record.item_id, record.city, side);
  if (Number.isFinite(override) && override > 0) return { price: override, timestamp: new Date().toISOString(), overridden: true };
  if (mode === 'instant') return { price: Number(record.buy_price_max || 0), timestamp: record.buy_price_max_date };
  return { price: Number(record.sell_price_min || 0), timestamp: record.sell_price_min_date };
}

function evaluateVariant({ variant, city, specialtyCity, focus, settings, priceLookup, overrideLookup }) {
  const rrr = resourceReturnRate({ specialty: specialtyCity === city, focus, extraProductionBonus: settings.extraProductionBonus });
  let grossMaterials = 0;
  let returnableGross = 0;
  let oldestMaterialAge = 0;
  const materials = [];
  const amountCrafted = Math.max(1, Number(variant.amountCrafted || 1));
  for (const material of variant.materials) {
    const record = priceLookup(material.id, city);
    const quote = priceFor(record, settings.acquisitionMode, overrideLookup, settings.server);
    if (!quote.price) return null;
    const countPerItem = Number(material.count || 0) / amountCrafted;
    const lineGross = quote.price * countPerItem;
    grossMaterials += lineGross;
    if (material.returnable) returnableGross += lineGross;
    const age = quoteAgeHours(quote.timestamp);
    oldestMaterialAge = Math.max(oldestMaterialAge, age);
    materials.push({ ...material, count: countPerItem, craftCount: material.count, unitPrice: quote.price, gross: lineGross, ageHours: age, overridden: !!quote.overridden });
  }
  const returnedValue = returnableGross * rrr;
  const trueMaterials = grossMaterials - returnedValue;
  const buySetup = settings.acquisitionMode === 'order' ? grossMaterials * MARKET_FEES.setupFee : 0;
  const flatSilver = Number(variant.silver || 0) / amountCrafted;
  const station = Number(settings.stationFee || 0);
  const trueCraftCost = trueMaterials + buySetup + flatSilver + station;
  const cashRequired = grossMaterials + buySetup + flatSilver + station;
  return { variant, city, rrr, grossMaterials, returnableGross, returnedValue, trueMaterials, buySetup, flatSilver, station, trueCraftCost, cashRequired, oldestMaterialAge, materials };
}

export function evaluateCraftCity(args) {
  const candidates = (args.recipe.variants || []).map(variant => evaluateVariant({ ...args, variant })).filter(Boolean);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => a.trueCraftCost - b.trueCraftCost)[0];
}

export function applySale({ craft, bmRecord, settings, overrideLookup, volume = 0, quantity = 1 }) {
  if (!craft || !bmRecord) return null;
  const sale = salePriceFor(bmRecord, settings.saleMode, overrideLookup, settings.server);
  if (!sale.price) return null;
  const taxRate = settings.premium ? MARKET_FEES.premiumTax : MARKET_FEES.nonPremiumTax;
  const saleTax = sale.price * taxRate;
  const saleSetup = settings.saleMode === 'order' ? sale.price * MARKET_FEES.setupFee : 0;
  const netSale = sale.price - saleTax - saleSetup;
  const profit = netSale - craft.trueCraftCost;
  const roi = craft.cashRequired > 0 ? profit / craft.cashRequired : 0;
  const saleAge = quoteAgeHours(sale.timestamp);
  const worstAge = Math.max(craft.oldestMaterialAge, saleAge);
  const fresh = freshnessLabel(worstAge, settings.freshnessHours);
  const batch = { quantity, capital: craft.cashRequired * quantity, trueCost: craft.trueCraftCost * quantity, grossSale: sale.price * quantity, netSale: netSale * quantity, profit: profit * quantity };
  return { ...craft, salePrice: sale.price, saleTax, saleSetup, netSale, profit, roi, saleAge, worstAge, freshness: fresh, volume, batch };
}

export function evaluateItem({ recipe, settings, priceLookup, bmRecord, volume, overrideLookup }) {
  const focusStates = [false, true];
  const result = { recipe, modes: {} };
  for (const focus of focusStates) {
    const key = focus ? 'focus' : 'baseline';
    const royalCandidates = ROYAL_CITIES.map(city => {
      const craft = evaluateCraftCity({ recipe, city, specialtyCity: recipe.bonusCity, focus, settings, priceLookup, overrideLookup });
      return applySale({ craft, bmRecord, settings, overrideLookup, volume });
    }).filter(Boolean);
    const bestRoyal = royalCandidates.sort((a, b) => b.profit - a.profit)[0] || null;
    const caerleonCraft = evaluateCraftCity({ recipe, city: 'Caerleon', specialtyCity: recipe.bonusCity, focus, settings, priceLookup, overrideLookup });
    const caerleon = applySale({ craft: caerleonCraft, bmRecord, settings, overrideLookup, volume });
    result.modes[key] = { bestRoyal, caerleon };
  }
  const baselineCandidates = [result.modes.baseline.bestRoyal, result.modes.baseline.caerleon].filter(Boolean);
  if (!baselineCandidates.length) return null;
  const freshCandidates = baselineCandidates.filter(x => x.worstAge <= settings.freshnessHours);
  const primary = (freshCandidates.length ? freshCandidates : baselineCandidates).sort((a, b) => b.profit - a.profit)[0];
  const liquidity = Math.log1p(Math.max(0, volume || 0));
  result.score = Math.max(0, primary.profit) * Math.max(1, liquidity) * primary.freshness.factor;
  result.primary = primary;
  return result;
}

export function batchMetrics(scenario, quantity) {
  if (!scenario) return null;
  return { quantity, capital: scenario.cashRequired * quantity, trueCost: scenario.trueCraftCost * quantity, returnedValue: scenario.returnedValue * quantity, netSale: scenario.netSale * quantity, profit: scenario.profit * quantity, roi: scenario.roi };
}

export function componentBatchMetrics(scenario, material, quantity = 1) {
  if (!scenario || !material) return null;
  const q = Math.max(0, Number(quantity || 0));
  const requiredQty = Number(material.count || 0) * q;
  const gross = Number(material.gross || 0) * q;
  const returnedQty = material.returnable ? requiredQty * Number(scenario.rrr || 0) : 0;
  const returnedValue = material.returnable ? gross * Number(scenario.rrr || 0) : 0;
  return {
    quantity: q,
    requiredQty,
    gross,
    returnedQty,
    returnedValue,
    consumedQty: requiredQty - returnedQty,
    consumedCost: gross - returnedValue,
  };
}

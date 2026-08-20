import test from 'node:test';
import assert from 'node:assert/strict';
import { applySale, evaluateCraftCity, MARKET_FEES, resourceReturnRate } from '../src/engine.js';

const settings = {
  server: 'west', premium: true, acquisitionMode: 'instant', saleMode: 'instant',
  stationFee: 0, extraProductionBonus: 0, freshnessHours: 12,
};

const recipe = {
  id: 'TEST', bonusCity: 'Lymhurst', variants: [{ amountCrafted: 1, silver: 0, materials: [
    { id: 'CLOTH', count: 8, returnable: true },
    { id: 'ARTIFACT', count: 1, returnable: false },
  ] }],
};

const priceRows = {
  'CLOTH|Lymhurst': { item_id: 'CLOTH', city: 'Lymhurst', sell_price_min: 2100, sell_price_min_date: new Date().toISOString(), buy_price_max: 2000, buy_price_max_date: new Date().toISOString() },
  'ARTIFACT|Lymhurst': { item_id: 'ARTIFACT', city: 'Lymhurst', sell_price_min: 400, sell_price_min_date: new Date().toISOString(), buy_price_max: 350, buy_price_max_date: new Date().toISOString() },
};
const lookup = (id, city) => priceRows[`${id}|${city}`];

const close = (a, b, epsilon = 1e-6) => assert.ok(Math.abs(a - b) < epsilon, `${a} ≈ ${b}`);

test('resource return rate uses Albion production-bonus conversion', () => {
  close(resourceReturnRate({}), 0.18 / 1.18);
  close(resourceReturnRate({ specialty: true }), 0.33 / 1.33);
  close(resourceReturnRate({ focus: true }), 0.77 / 1.77);
  close(resourceReturnRate({ specialty: true, focus: true }), 0.92 / 1.92);
});

test('return rate only reduces return-eligible materials', () => {
  const craft = evaluateCraftCity({ recipe, city: 'Lymhurst', specialtyCity: 'Lymhurst', focus: false, settings, priceLookup: lookup });
  assert.equal(craft.grossMaterials, 17_200);
  assert.equal(craft.returnableGross, 16_800);
  close(craft.returnedValue, 16_800 * (0.33 / 1.33));
  close(craft.trueCraftCost, 17_200 - craft.returnedValue);
  assert.ok(craft.cashRequired > craft.trueCraftCost);
});

test('instant Black Market sale charges transaction tax but no setup fee', () => {
  const craft = evaluateCraftCity({ recipe, city: 'Lymhurst', specialtyCity: 'Lymhurst', focus: false, settings, priceLookup: lookup });
  const bm = { item_id: 'TEST', city: 'Black Market', buy_price_max: 32_000, buy_price_max_date: new Date().toISOString(), sell_price_min: 34_000, sell_price_min_date: new Date().toISOString() };
  const sale = applySale({ craft, bmRecord: bm, settings, volume: 50 });
  assert.equal(sale.saleSetup, 0);
  assert.equal(sale.saleTax, 32_000 * MARKET_FEES.premiumTax);
  assert.equal(sale.netSale, 32_000 * (1 - MARKET_FEES.premiumTax));
});

test('listed sale adds setup fee and non-premium doubles transaction tax', () => {
  const local = { ...settings, premium: false, saleMode: 'order' };
  const craft = evaluateCraftCity({ recipe, city: 'Lymhurst', specialtyCity: 'Lymhurst', focus: false, settings: local, priceLookup: lookup });
  const bm = { item_id: 'TEST', city: 'Black Market', buy_price_max: 32_000, buy_price_max_date: new Date().toISOString(), sell_price_min: 34_000, sell_price_min_date: new Date().toISOString() };
  const sale = applySale({ craft, bmRecord: bm, settings: local, volume: 50 });
  assert.equal(sale.saleTax, 34_000 * MARKET_FEES.nonPremiumTax);
  assert.equal(sale.saleSetup, 34_000 * MARKET_FEES.setupFee);
});


test('multi-output recipes normalize material and silver cost per produced item', () => {
  const multi = {
    id: 'MULTI', bonusCity: 'Lymhurst', variants: [{ amountCrafted: 10, silver: 1_000, materials: [
      { id: 'CLOTH', count: 20, returnable: true },
      { id: 'ARTIFACT', count: 10, returnable: false },
    ] }],
  };
  const craft = evaluateCraftCity({ recipe: multi, city: 'Lymhurst', specialtyCity: 'Lymhurst', focus: false, settings, priceLookup: lookup });
  assert.equal(craft.grossMaterials, 4_600);
  assert.equal(craft.returnableGross, 4_200);
  assert.equal(craft.flatSilver, 100);
  close(craft.materials[0].count, 2);
  close(craft.materials[1].count, 1);
});

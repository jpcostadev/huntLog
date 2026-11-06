import type { TibiaCoinPriceTier, TibiaCoinRates } from './models';

export type TibiaCoinEstimate = {
  gpPerTc: number;
  tcEquivalent: number;
  realValue: number | null;
  packageCount: number;
  soldTc: number;
  priceTier: TibiaCoinPriceTier | null;
};

export type TibiaCoinTradeEstimate = {
  gpPerTc: number;
  gpValue: number;
  saleRevenue: number | null;
  priceTier: TibiaCoinPriceTier | null;
  packageCount: number;
  soldTc: number;
};

export function selectTibiaCoinSaleTier(tcQuantity: number, tiers: TibiaCoinPriceTier[]) {
  const usable = tiers.filter(tier => tier.minimumTc >= 0 && tier.lotTc > 0 && tier.realPrice > 0).sort((a, b) => a.minimumTc - b.minimumTc);
  if (!usable.length) return null;
  const eligible = usable.filter(tier => tier.minimumTc <= tcQuantity);
  return eligible[eligible.length - 1] ?? null;
}

export function estimateTibiaCoinTrade(tcQuantity: number, rates: TibiaCoinRates): TibiaCoinTradeEstimate {
  const gpPerTc = rates.tcAmount > 0 ? rates.gpAmount / rates.tcAmount : 0;
  const priceTier = selectTibiaCoinSaleTier(tcQuantity, rates.sellTiers ?? []);
  const legacyRealPerTc = rates.realPer250 / 250;
  const packageCount = priceTier && tcQuantity > 0 ? tcQuantity / priceTier.lotTc : 0;
  const soldTc = priceTier ? tcQuantity : 0;
  const saleRevenue = priceTier
    ? packageCount * priceTier.realPrice
    : (rates.sellTiers?.length ? null : tcQuantity * legacyRealPerTc);
  return {
    gpPerTc,
    gpValue: tcQuantity * gpPerTc,
    saleRevenue: saleRevenue !== null && (saleRevenue > 0 || Boolean(priceTier)) ? saleRevenue : null,
    priceTier,
    packageCount,
    soldTc,
  };
}

export function estimateHuntValueInReal(profitGp: number, rates: TibiaCoinRates): TibiaCoinEstimate {
  const gpPerTc = rates.tcAmount > 0 ? rates.gpAmount / rates.tcAmount : 0;
  const tcEquivalent = gpPerTc > 0 ? profitGp / gpPerTc : 0;
  const trade = estimateTibiaCoinTrade(tcEquivalent, rates);
  return { gpPerTc, tcEquivalent, realValue: trade.saleRevenue, packageCount: trade.packageCount, soldTc: trade.soldTc, priceTier: trade.priceTier };
}

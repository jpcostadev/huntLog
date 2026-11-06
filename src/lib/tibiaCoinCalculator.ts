import type { TibiaCoinRates } from './models';

export type TibiaCoinEstimate = {
  gpPerTc: number;
  tcEquivalent: number;
  realValue: number | null;
};

export type TibiaCoinTradeEstimate = {
  gpPerTc: number;
  buyRealPerTc: number;
  sellRealPerTc: number;
  gpValue: number;
  buyCost: number;
  saleRevenue: number;
  cashProfit: number;
};

export function estimateTibiaCoinTrade(tcQuantity: number, rates: TibiaCoinRates): TibiaCoinTradeEstimate {
  const gpPerTc = rates.tcAmount > 0 ? rates.gpAmount / rates.tcAmount : 0;
  const cashLot = rates.realLotAmount > 0 ? rates.realLotAmount : 250;
  const buyRealPerTc = rates.realBuyAmount > 0 ? rates.realBuyAmount / cashLot : 0;
  const sellRealPerTc = rates.realSellAmount > 0 ? rates.realSellAmount / cashLot : rates.realPer250 / 250;
  const buyCost = tcQuantity * buyRealPerTc;
  const saleRevenue = tcQuantity * sellRealPerTc;
  return {
    gpPerTc,
    buyRealPerTc,
    sellRealPerTc,
    gpValue: tcQuantity * gpPerTc,
    buyCost,
    saleRevenue,
    cashProfit: saleRevenue - buyCost,
  };
}

export function estimateHuntValueInReal(profitGp: number, rates: TibiaCoinRates): TibiaCoinEstimate {
  const gpPerTc = rates.tcAmount > 0 ? rates.gpAmount / rates.tcAmount : 0;
  const tcEquivalent = gpPerTc > 0 ? profitGp / gpPerTc : 0;
  const sellRealPerTc = rates.realLotAmount > 0 && rates.realSellAmount > 0
    ? rates.realSellAmount / rates.realLotAmount
    : rates.realPer250 / 250;
  const realValue = gpPerTc > 0 && sellRealPerTc > 0 ? tcEquivalent * sellRealPerTc : null;
  return { gpPerTc, tcEquivalent, realValue };
}

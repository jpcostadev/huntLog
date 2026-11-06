import type { TibiaCoinRates } from './models';

export type TibiaCoinEstimate = {
  gpPerTc: number;
  tcEquivalent: number;
  realValue: number | null;
};

export function estimateHuntValueInReal(profitGp: number, rates: TibiaCoinRates): TibiaCoinEstimate {
  const gpPerTc = rates.tcAmount > 0 ? rates.gpAmount / rates.tcAmount : 0;
  const tcEquivalent = gpPerTc > 0 ? profitGp / gpPerTc : 0;
  const realValue = gpPerTc > 0 && rates.realPer250 > 0 ? tcEquivalent * rates.realPer250 / 250 : null;
  return { gpPerTc, tcEquivalent, realValue };
}

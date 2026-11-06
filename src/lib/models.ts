export type SessionEntry = { count: number; name: string };

export type TibiaSession = {
  rawText?: string;
  startedAt: string;
  endedAt: string;
  rawXpGain: number;
  xpPerHour: number;
  rawXpPerHour: number;
  balance: number;
  damage: number;
  damagePerHour: number;
  healing: number;
  healingPerHour: number;
  monsters: SessionEntry[];
  items: SessionEntry[];
};

export type Hunt = {
  id: number;
  date: string;
  character: string;
  vocation: string;
  level: number;
  location: string;
  duration: number;
  xp: number;
  loot: number;
  supplies: number;
  session: TibiaSession | null;
};

export type CharacterProfile = {
  name: string;
  vocation: string;
  level: number;
  isPrimary: boolean;
  registeredXp: number;
};

export type CharacterInput = Omit<CharacterProfile, 'registeredXp'>;

export type HuntInput = Omit<Hunt, 'id'>;

export type HuntData = {
  hunts: Hunt[];
  characters: CharacterProfile[];
};

export type TibiaCoinPriceTier = { minimumTc: number; lotTc: number; realPrice: number };

export type TibiaCoinRates = {
  /** Legacy normalized sell quote retained for old reports and saved settings. */
  realPer250: number;
  realLotAmount: number;
  realBuyAmount: number;
  realSellAmount: number;
  tcAmount: number;
  gpAmount: number;
  sellTiers?: TibiaCoinPriceTier[];
};

export const DEFAULT_TIBIA_COIN_RATES: TibiaCoinRates = {
  realPer250: 0,
  realLotAmount: 1,
  realBuyAmount: 0,
  realSellAmount: 0,
  tcAmount: 25,
  gpAmount: 0,
  sellTiers: [],
};

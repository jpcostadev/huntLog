export type SessionEntry = { count: number; name: string };

export type TibiaSession = {
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

import { DEFAULT_TIBIA_COIN_RATES, type CharacterInput, type CharacterProfile, type Hunt, type HuntData, type HuntInput, type TibiaCoinRates } from './models';

const STORAGE_KEY = 'huntlog.local.v1';
const TC_RATES_KEY = 'huntlog.tibia-coin-rates.v1';
const HUNT_LOCATIONS_KEY = 'huntlog.saved-hunt-locations.v1';
type StoredData = { hunts: Hunt[]; characters: CharacterProfile[] };

function read(): StoredData {
  if (typeof localStorage === 'undefined') return { hunts: [], characters: [] };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { hunts: [], characters: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<StoredData>;
    return { hunts: (parsed.hunts ?? []).map((hunt) => ({ ...hunt, id: Number(hunt.id), session: hunt.session ?? null })), characters: parsed.characters ?? [] };
  } catch {
    return { hunts: [], characters: [] };
  }
}

function write(data: StoredData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export async function loadSavedHuntLocations(): Promise<string[]> {
  if (typeof localStorage === 'undefined') return [];
  try {
    const saved = JSON.parse(localStorage.getItem(HUNT_LOCATIONS_KEY) ?? '[]') as unknown;
    return Array.isArray(saved) ? saved.filter((name): name is string => typeof name === 'string') : [];
  } catch { return []; }
}

export async function saveHuntLocation(name: string) {
  const normalized = name.trim();
  if (!normalized || typeof localStorage === 'undefined') return;
  const current = await loadSavedHuntLocations();
  const names = [normalized, ...current.filter(item => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase())].slice(0, 100);
  localStorage.setItem(HUNT_LOCATIONS_KEY, JSON.stringify(names));
}

export async function loadTibiaCoinRates(): Promise<TibiaCoinRates> {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_TIBIA_COIN_RATES };
  try {
    const value = JSON.parse(localStorage.getItem(TC_RATES_KEY) ?? 'null') as Partial<TibiaCoinRates> | null;
    const legacySell = Number.isFinite(value?.realPer250) ? Number(value?.realPer250) : 0;
    const realLotAmount = Number.isFinite(value?.realLotAmount) && Number(value?.realLotAmount) > 0 ? Number(value?.realLotAmount) : (legacySell > 0 ? 250 : 1);
    const realSellAmount = Number.isFinite(value?.realSellAmount) ? Number(value?.realSellAmount) : legacySell;
    const sellTiers = Array.isArray(value?.sellTiers) ? value.sellTiers.filter(tier => Number.isFinite(tier.minimumTc) && Number.isFinite(tier.lotTc) && Number(tier.lotTc) > 0 && Number.isFinite(tier.realPrice)).map(tier => ({ minimumTc: Number(tier.minimumTc), lotTc: Number(tier.lotTc), realPrice: Number(tier.realPrice) })) : (realSellAmount > 0 ? [{ minimumTc: realLotAmount, lotTc: realLotAmount, realPrice: realSellAmount }] : []);
    return {
      realPer250: realLotAmount > 0 ? realSellAmount * 250 / realLotAmount : legacySell,
      realLotAmount,
      realBuyAmount: Number.isFinite(value?.realBuyAmount) ? Number(value?.realBuyAmount) : 0,
      realSellAmount,
      tcAmount: 25,
      gpAmount: Number.isFinite(value?.gpAmount) ? Number(value?.gpAmount) : 0,
      sellTiers,
    };
  } catch {
    return { ...DEFAULT_TIBIA_COIN_RATES };
  }
}

export async function saveTibiaCoinRates(rates: TibiaCoinRates) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(TC_RATES_KEY, JSON.stringify(rates));
}

function refreshProfiles(hunts: Hunt[], profiles: CharacterProfile[]): CharacterProfile[] {
  const byName = new Map(profiles.map((profile) => [profile.name.toLowerCase(), profile]));
  for (const hunt of hunts) {
    const key = hunt.character.toLowerCase();
    const previous = byName.get(key);
    byName.set(key, {
      name: hunt.character,
      vocation: hunt.vocation,
      level: Math.max(previous?.level ?? 0, hunt.level),
      isPrimary: previous?.isPrimary ?? false,
      registeredXp: (previous?.registeredXp ?? 0) + hunt.xp,
    });
  }
  // Profiles read from storage already contain cumulative XP. Recompute it from sessions.
  for (const profile of byName.values()) {
    profile.registeredXp = hunts
      .filter((hunt) => hunt.character.toLowerCase() === profile.name.toLowerCase())
      .reduce((sum, hunt) => sum + hunt.xp, 0);
  }
  return [...byName.values()].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || a.name.localeCompare(b.name));
}

export async function loadHuntData(): Promise<HuntData> {
  const data = read();
  const characters = refreshProfiles(data.hunts, data.characters);
  write({ ...data, characters });
  return { hunts: [...data.hunts].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id), characters };
}

export async function saveHunt(input: HuntInput, id: number | null, makePrimary: boolean) {
  const data = read();
  const hunts = [...data.hunts];
  if (id === null) hunts.push({ ...input, id: Date.now() });
  else {
    const index = hunts.findIndex((hunt) => hunt.id === id);
    if (index < 0) throw new Error('A hunt que você está editando não existe mais.');
    hunts[index] = { ...input, id };
  }

  const profiles = refreshProfiles(hunts, data.characters);
  const target = profiles.find((profile) => profile.name.toLowerCase() === input.character.toLowerCase());
  if (target) {
    target.name = input.character;
    target.vocation = input.vocation;
    target.level = Math.max(target.level, input.level);
    if (makePrimary) {
      for (const profile of profiles) profile.isPrimary = profile.name.toLowerCase() === input.character.toLowerCase();
    }
  }
  write({ hunts, characters: profiles });
}

export async function setPrimaryCharacter(name: string) {
  const data = read();
  const characters = refreshProfiles(data.hunts, data.characters).map((profile) => ({
    ...profile,
    isPrimary: profile.name.toLowerCase() === name.toLowerCase(),
  }));
  write({ ...data, characters });
}

export async function saveCharacter(input: CharacterInput) {
  const data = read();
  const profiles = refreshProfiles(data.hunts, data.characters);
  const existing = profiles.find((profile) => profile.name.toLowerCase() === input.name.trim().toLowerCase());
  const saved: CharacterProfile = {
    name: input.name.trim(),
    vocation: input.vocation,
    level: Math.max(existing?.level ?? 0, input.level),
    isPrimary: input.isPrimary,
    registeredXp: existing?.registeredXp ?? 0,
  };
  const characters = [...profiles.filter((profile) => profile.name.toLowerCase() !== saved.name.toLowerCase()), saved];
  if (saved.isPrimary) {
    for (const profile of characters) profile.isPrimary = profile.name.toLowerCase() === saved.name.toLowerCase();
  }
  write({ ...data, characters });
}

export async function deleteHunt(id: number) {
  const data = read();
  if (!data.hunts.some(hunt => hunt.id === id)) throw new Error('A hunt não foi encontrada para apagar.');
  const hunts = data.hunts.filter((hunt) => hunt.id !== id);
  write({ ...data, hunts, characters: refreshProfiles(hunts, data.characters) });
  if (read().hunts.some(hunt => hunt.id === id)) throw new Error('A hunt permaneceu salva após a tentativa de apagar.');
}

export async function deleteHunts(ids: number[]) {
  const targets = new Set(ids.map(Number));
  if (!targets.size) return;
  const data = read();
  const hunts = data.hunts.filter(hunt => !targets.has(Number(hunt.id)));
  if (hunts.length === data.hunts.length) throw new Error('As hunts selecionadas não foram encontradas. Atualize a lista e tente novamente.');
  write({ ...data, hunts, characters: refreshProfiles(hunts, data.characters) });
  if (read().hunts.some(hunt => targets.has(Number(hunt.id)))) throw new Error('Algumas hunts permaneceram salvas após a tentativa de apagar.');
}

export async function clearHunts() {
  const data = read();
  write({ ...data, hunts: [], characters: refreshProfiles([], data.characters) });
  if (read().hunts.length) throw new Error('O histórico permaneceu salvo após a tentativa de limpar.');
}

import * as SQLite from 'expo-sqlite';
import { DEFAULT_TIBIA_COIN_RATES, type CharacterInput, type CharacterProfile, type Hunt, type HuntData, type HuntInput, type TibiaCoinRates } from './models';

const dbPromise = SQLite.openDatabaseAsync('tibia-hunts.db');

async function database() {
  const db = await dbPromise;
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS hunts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      character TEXT NOT NULL,
      vocation TEXT NOT NULL,
      level INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      loot INTEGER NOT NULL DEFAULT 0,
      supplies INTEGER NOT NULL DEFAULT 0
      ,session_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE IF NOT EXISTS characters (
      name TEXT PRIMARY KEY NOT NULL,
      vocation TEXT NOT NULL DEFAULT 'EK',
      level INTEGER NOT NULL DEFAULT 0,
      is_primary INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
  `);

  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(hunts)');
  if (!columns.some((column) => column.name === 'session_json')) {
    await db.execAsync("ALTER TABLE hunts ADD COLUMN session_json TEXT NOT NULL DEFAULT '{}' ");
  }

  // Import profiles from hunts saved by older app versions.
  const names = await db.getAllAsync<{ character: string; vocation: string; level: number }>(
    'SELECT character, vocation, MAX(level) AS level FROM hunts GROUP BY character',
  );
  for (const profile of names) {
    await db.runAsync(
      `INSERT INTO characters (name, vocation, level) VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         vocation=excluded.vocation,
         level=MAX(characters.level, excluded.level)`,
      profile.character,
      profile.vocation,
      profile.level,
    );
  }
  return db;
}

export async function loadSavedHuntLocations(): Promise<string[]> {
  const db = await database();
  const row = await db.getFirstAsync<{value:string}>('SELECT value FROM app_settings WHERE key = ?', 'saved_hunt_locations');
  if (!row) return [];
  try {
    const names = JSON.parse(row.value) as unknown;
    return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string') : [];
  } catch { return []; }
}

export async function saveHuntLocation(name: string) {
  const normalized = name.trim();
  if (!normalized) return;
  const db = await database();
  const current = await loadSavedHuntLocations();
  const names = [normalized, ...current.filter(item => item.toLocaleLowerCase() !== normalized.toLocaleLowerCase())].slice(0, 100);
  await db.runAsync('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', 'saved_hunt_locations', JSON.stringify(names));
}

export async function loadTibiaCoinRates(): Promise<TibiaCoinRates> {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', 'tibia_coin_rates');
  if (!row) return { ...DEFAULT_TIBIA_COIN_RATES };
  try {
    const value = JSON.parse(row.value) as Partial<TibiaCoinRates>;
    const legacySell = Number.isFinite(value.realPer250) ? Number(value.realPer250) : 0;
    const realLotAmount = Number.isFinite(value.realLotAmount) && Number(value.realLotAmount) > 0 ? Number(value.realLotAmount) : (legacySell > 0 ? 250 : 1);
    const realSellAmount = Number.isFinite(value.realSellAmount) ? Number(value.realSellAmount) : legacySell;
    const normalizeTiers = (tiers: TibiaCoinRates['sellTiers']) => (Array.isArray(tiers) ? tiers : []).filter(tier => Number.isFinite(tier.minimumTc) && Number.isFinite(tier.lotTc) && Number(tier.lotTc) > 0 && Number.isFinite(tier.realPrice)).map(tier => ({ minimumTc: Number(tier.minimumTc), lotTc: Number(tier.lotTc), realPrice: Number(tier.realPrice) }));
    return {
      realPer250: realLotAmount > 0 ? realSellAmount * 250 / realLotAmount : legacySell,
      realLotAmount,
      realBuyAmount: Number.isFinite(value.realBuyAmount) ? Number(value.realBuyAmount) : 0,
      realSellAmount,
      tcAmount: 25,
      gpAmount: Number.isFinite(value.gpAmount) ? Number(value.gpAmount) : 0,
      sellTiers: value.sellTiers ? normalizeTiers(value.sellTiers) : (realSellAmount ? [{ minimumTc: realLotAmount, lotTc: realLotAmount, realPrice: realSellAmount }] : []),
    };
  } catch {
    return { ...DEFAULT_TIBIA_COIN_RATES };
  }
}

export async function saveTibiaCoinRates(rates: TibiaCoinRates) {
  const db = await database();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    'tibia_coin_rates', JSON.stringify(rates),
  );
}

export async function loadHuntData(): Promise<HuntData> {
  const db = await database();
  const [hunts, characters] = await Promise.all([
    db.getAllAsync<Omit<Hunt, 'session'> & { session_json?: string }>('SELECT * FROM hunts ORDER BY date DESC, id DESC'),
    db.getAllAsync<Omit<CharacterProfile, 'isPrimary'> & { isPrimary: number }>(`
      SELECT characters.name, characters.vocation, characters.level,
        characters.is_primary AS isPrimary,
        COALESCE(SUM(hunts.xp), 0) AS registeredXp
      FROM characters
      LEFT JOIN hunts ON hunts.character = characters.name
      GROUP BY characters.name
      ORDER BY characters.is_primary DESC, characters.name COLLATE NOCASE ASC
    `),
  ]);
  return { hunts: hunts.map(({ session_json, ...hunt }) => {
    const value = session_json ? JSON.parse(session_json) : null;
    return { ...hunt, session: value && typeof value === 'object' && 'startedAt' in value ? value : null };
  }), characters: characters.map((c) => ({ ...c, isPrimary: Boolean(c.isPrimary) })) };
}

export async function saveHunt(input: HuntInput, id: number | null, makePrimary: boolean) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    if (makePrimary) await db.runAsync('UPDATE characters SET is_primary = 0');

    if (id === null) {
      await db.runAsync(
        `INSERT INTO hunts (date, character, vocation, level, location, duration, xp, loot, supplies, session_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.date, input.character, input.vocation, input.level, input.location,
        input.duration, input.xp, input.loot, input.supplies, JSON.stringify(input.session ?? null),
      );
    } else {
      await db.runAsync(
        `UPDATE hunts SET date=?, character=?, vocation=?, level=?, location=?, duration=?, xp=?, loot=?, supplies=?, session_json=? WHERE id=?`,
        input.date, input.character, input.vocation, input.level, input.location,
        input.duration, input.xp, input.loot, input.supplies, JSON.stringify(input.session ?? null), id,
      );
    }

    await db.runAsync(
      `INSERT INTO characters (name, vocation, level, is_primary) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         vocation=excluded.vocation,
         level=MAX(characters.level, excluded.level),
         is_primary=excluded.is_primary`,
      input.character, input.vocation, input.level, makePrimary ? 1 : 0,
    );
  });
}

export async function setPrimaryCharacter(name: string) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    await db.runAsync('UPDATE characters SET is_primary=0');
    await db.runAsync('UPDATE characters SET is_primary=1 WHERE name=?', name);
  });
}

export async function saveCharacter(input: CharacterInput) {
  const db = await database();
  await db.withTransactionAsync(async () => {
    if (input.isPrimary) await db.runAsync('UPDATE characters SET is_primary = 0');
    await db.runAsync(
      `INSERT INTO characters (name, vocation, level, is_primary) VALUES (?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         vocation=excluded.vocation,
         level=MAX(characters.level, excluded.level),
         is_primary=excluded.is_primary`,
      input.name.trim(), input.vocation, input.level, input.isPrimary ? 1 : 0,
    );
  });
}

export async function deleteHunt(id: number) {
  const db = await database();
  await db.runAsync('DELETE FROM hunts WHERE id=?', id);
}

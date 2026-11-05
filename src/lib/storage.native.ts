import * as SQLite from 'expo-sqlite';
import type { CharacterInput, CharacterProfile, Hunt, HuntData, HuntInput } from './models';

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

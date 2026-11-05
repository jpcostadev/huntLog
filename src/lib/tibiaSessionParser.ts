import type { SessionEntry, TibiaSession } from './models';

export type ParsedTibiaSession = {
  date: string;
  duration: number;
  xp: number;
  loot: number;
  supplies: number;
  details: TibiaSession;
};

const valueFor = (text: string, label: string) => {
  const match = text.match(new RegExp(`^${label}:\\s*([\\d,.]+)`, 'im'));
  return match ? Number(match[1].replace(/[,.]/g, '')) : 0;
};

function entriesIn(text: string, heading: string): SessionEntry[] {
  const section = text.split(new RegExp(`^${heading}:\\s*$`, 'im'))[1]?.split(/^[A-Z][^\n:]*:\s*$/m)[0] ?? '';
  return [...section.matchAll(/^\s*(\d+)\s*x\s+(.+?)\s*$/gim)].map(([, count, name]) => ({ count: Number(count), name }));
}

export function parseTibiaSession(source: string): ParsedTibiaSession {
  const text = source.replace(/\r/g, '').trim();
  const period = text.match(/Session data:\s*From\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})\s+to\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})/i);
  const xp = valueFor(text, 'XP Gain');
  const loot = valueFor(text, 'Loot');
  const supplies = valueFor(text, 'Supplies');
  if (!period || !xp || !/^Session:/im.test(text)) {
    throw new Error('Texto não reconhecido. Copie a sessão completa em “Session data” no Tibia.');
  }
  const [, startDate, startTime, endDate, endTime] = period;
  const durationMatch = text.match(/^Session:\s*(\d+):(\d{2})h/im);
  const startMs = new Date(`${startDate}T${startTime}`).getTime();
  const endMs = new Date(`${endDate}T${endTime}`).getTime();
  const duration = durationMatch ? Number(durationMatch[1]) * 60 + Number(durationMatch[2]) : Math.round((endMs - startMs) / 60000);
  if (!duration || duration < 0 || !Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    throw new Error('Não consegui identificar o horário ou a duração da sessão.');
  }
  return {
    date: startDate,
    duration,
    xp,
    loot,
    supplies,
    details: {
      startedAt: `${startDate} ${startTime}`,
      endedAt: `${endDate} ${endTime}`,
      rawXpGain: valueFor(text, 'Raw XP Gain'),
      xpPerHour: valueFor(text, 'XP/h'),
      rawXpPerHour: valueFor(text, 'Raw XP/h'),
      balance: valueFor(text, 'Balance'),
      damage: valueFor(text, 'Damage'),
      damagePerHour: valueFor(text, 'Damage/h'),
      healing: valueFor(text, 'Healing'),
      healingPerHour: valueFor(text, 'Healing/h'),
      monsters: entriesIn(text, 'Killed Monsters'),
      items: entriesIn(text, 'Looted Items'),
    },
  };
}

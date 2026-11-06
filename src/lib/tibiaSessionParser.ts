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
  const safeLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*${safeLabel}:\\s*([\\d,.]+)`, 'im'));
  return match ? Number(match[1].replace(/[,.]/g, '')) : 0;
};

function entriesIn(text: string, heading: string): SessionEntry[] {
  const safeHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const section = text.split(new RegExp(`^\\s*${safeHeading}:\\s*$`, 'im'))[1]?.split(/^\s*[A-Z][^\n:]*:\s*$/im)[0] ?? '';
  return [...section.matchAll(/^\s*(\d+)\s*x\s+(.+?)\s*$/gim)].map(([, count, name]) => ({ count: Number(count), name }));
}

export function parseTibiaSession(source: string): ParsedTibiaSession {
  const text = source.replace(/[\uFEFF\u200B]/g, '').replace(/\r/g, '').trim();
  if (!text) throw new Error('Cole o texto completo da sessão copiado do Tibia.');
  const fullPeriod = text.match(/^\s*Session data:\s*From\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})\s+to\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})/im);
  const clippedPeriod = text.match(/^\s*(\d{2}:\d{2}:\d{2})\s+to\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})/im);
  const xp = valueFor(text, 'XP Gain');
  const loot = valueFor(text, 'Loot');
  const supplies = valueFor(text, 'Supplies');
  if (!fullPeriod && !clippedPeriod) throw new Error('Não encontrei o período da hunt. Copie a sessão desde a linha com a data e os horários.');
  if (!/^\s*Session:\s*\d+:\d{2}h/im.test(text)) throw new Error('Não encontrei a duração “Session:”. Copie a sessão completa, não apenas a lista de itens.');
  if (!/^\s*XP Gain:\s*[\d,.]+/im.test(text)) throw new Error('Não encontrei “XP Gain”. Copie novamente a sessão inteira desde a primeira linha.');
  let startDate: string, startTime: string, endDate: string, endTime: string;
  if (fullPeriod) [, startDate, startTime, endDate, endTime] = fullPeriod;
  else {
    [, startTime, endDate, endTime] = clippedPeriod!;
    startDate = endDate;
    if (startTime > endTime) {
      const previousDay = new Date(`${endDate}T00:00:00Z`);
      previousDay.setUTCDate(previousDay.getUTCDate() - 1);
      startDate = `${previousDay.getUTCFullYear()}-${String(previousDay.getUTCMonth() + 1).padStart(2, '0')}-${String(previousDay.getUTCDate()).padStart(2, '0')}`;
    }
  }
  const durationMatch = text.match(/^\s*Session:\s*(\d+):(\d{2})h/im);
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
      rawText: text,
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

const tibiaNumber = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value || 0);

export function formatTibiaSessionText(session: TibiaSession, hunt: { duration: number; xp: number; loot: number; supplies: number }): string {
  if (session.rawText?.trim()) return session.rawText;

  const splitTimestamp = (value: string) => {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})$/);
    return match ? `${match[1]}, ${match[2]}` : value;
  };
  const hours = Math.floor(hunt.duration / 60);
  const minutes = Math.max(0, hunt.duration % 60);
  const lines = [
    `Session data: From ${splitTimestamp(session.startedAt)} to ${splitTimestamp(session.endedAt)}`,
    `Session: ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}h`,
    `Raw XP Gain: ${tibiaNumber(session.rawXpGain)}`,
    `XP Gain: ${tibiaNumber(hunt.xp)}`,
    `Raw XP/h: ${tibiaNumber(session.rawXpPerHour)}`,
    `XP/h: ${tibiaNumber(session.xpPerHour)}`,
    `Loot: ${tibiaNumber(hunt.loot)}`,
    `Supplies: ${tibiaNumber(hunt.supplies)}`,
    `Balance: ${tibiaNumber(session.balance)}`,
    `Damage: ${tibiaNumber(session.damage)}`,
    `Damage/h: ${tibiaNumber(session.damagePerHour)}`,
    `Healing: ${tibiaNumber(session.healing)}`,
    `Healing/h: ${tibiaNumber(session.healingPerHour)}`,
    'Killed Monsters:',
    ...session.monsters.map(entry => `${tibiaNumber(entry.count)}x ${entry.name}`),
    'Looted Items:',
    ...session.items.map(entry => `${tibiaNumber(entry.count)}x ${entry.name}`),
  ];
  return lines.join('\n');
}

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
  const period = text.match(/^\s*Session data:\s*From\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})\s+to\s+(\d{4}-\d{2}-\d{2}),\s*(\d{2}:\d{2}:\d{2})/im);
  const xp = valueFor(text, 'XP Gain');
  const loot = valueFor(text, 'Loot');
  const supplies = valueFor(text, 'Supplies');
  if (!period) throw new Error('Não encontrei o cabeçalho “Session data: From…”. Copie desde a primeira linha da sessão no Tibia, incluindo os horários.');
  if (!/^\s*Session:\s*\d+:\d{2}h/im.test(text)) throw new Error('Não encontrei a duração “Session:”. Copie a sessão completa, não apenas a lista de itens.');
  if (!/^\s*XP Gain:\s*[\d,.]+/im.test(text)) throw new Error('Não encontrei “XP Gain”. Copie novamente a sessão inteira desde a primeira linha.');
  const [, startDate, startTime, endDate, endTime] = period;
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

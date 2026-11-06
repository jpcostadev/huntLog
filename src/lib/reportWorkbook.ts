import { strToU8, zipSync } from 'fflate';
import type { Hunt, TibiaCoinRates } from './models';
import { estimateHuntValueInReal } from './tibiaCoinCalculator';

type CellValue = string | number;
type Sheet = { name: string; rows: CellValue[][] };

const xmlEscape = (value: string) => value
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

function columnName(index: number) {
  let value = index + 1;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function worksheet(rows: CellValue[][]) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
      const text = xmlEscape(String(value ?? ''));
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`;
}

export function buildHuntWorkbook(hunts: Hunt[], rates: TibiaCoinRates = { realPer250: 0, realLotAmount: 250, realBuyAmount: 0, realSellAmount: 0, tcAmount: 25, gpAmount: 0, sellTiers: [] }) {
  const total = hunts.reduce((sum, hunt) => ({
    xp: sum.xp + hunt.xp,
    loot: sum.loot + hunt.loot,
    supplies: sum.supplies + hunt.supplies,
    minutes: sum.minutes + hunt.duration,
  }), { xp: 0, loot: 0, supplies: 0, minutes: 0 });
  const overallEstimate = estimateHuntValueInReal(total.loot - total.supplies, rates);
  const sheets: Sheet[] = [
    { name: 'Resumo', rows: [
      ['HUNTLOG TIBIA · RELATÓRIO DE HUNTS'],
      ['Sessões exportadas', hunts.length],
      ['XP total', total.xp],
      ['Loot bruto (gp)', total.loot],
      ['Supplies (gp)', total.supplies],
      ['Lucro líquido (gp)', total.loot - total.supplies],
      ['Tempo total (minutos)', total.minutes],
      ['Lote usado para calcular (TC)', rates.tcAmount],
      ['Preço do lote (gp)', rates.gpAmount],
      ['Taxa calculada (gp/TC)', overallEstimate.gpPerTc],
      ['Faixa aplicada ao lucro (TC mínimos)', overallEstimate.priceTier?.minimumTc ?? 'Nenhuma faixa aplicável'],
      ['Pacote da faixa aplicada (TC)', overallEstimate.priceTier?.lotTc ?? ''],
      ['Preço do pacote aplicado (R$)', overallEstimate.priceTier?.realPrice ?? ''],
      ['Lucro convertido (TC)', overallEstimate.realValue === null ? '' : overallEstimate.tcEquivalent],
      ['Pacotes completos estimados', overallEstimate.packageCount],
      ['TC incluídos nos pacotes', overallEstimate.soldTc],
      ['TC restantes fora de pacote', overallEstimate.remainingTc],
      ['Estimativa do lucro (R$)', overallEstimate.realValue ?? 'Configure as taxas no aplicativo'],
      ['Gerado em', new Date().toLocaleString('pt-BR')],
    ] },
    { name: 'Hunts', rows: [
      ['Data', 'Personagem', 'Vocação', 'Level', 'Local / Respawn', 'Duração (min)', 'XP ganho', 'XP/h', 'XP bruto', 'XP bruto/h', 'Loot (gp)', 'Supplies (gp)', 'Lucro (gp)', 'Balance (gp)', 'Dano', 'Dano/h', 'Cura', 'Cura/h', 'Equivalente TC', 'Pacotes TC', 'TC em pacotes', 'TC restantes', 'Estimativa (R$)'],
      ...hunts.map(hunt => {
        const estimate = estimateHuntValueInReal(hunt.loot - hunt.supplies, rates);
        return [hunt.date, hunt.character, hunt.vocation, hunt.level, hunt.location, hunt.duration, hunt.xp,
        hunt.session?.xpPerHour ?? Math.round(hunt.duration ? hunt.xp * 60 / hunt.duration : 0), hunt.session?.rawXpGain ?? 0,
        hunt.session?.rawXpPerHour ?? 0, hunt.loot, hunt.supplies, hunt.loot - hunt.supplies, hunt.session?.balance ?? 0,
        hunt.session?.damage ?? 0, hunt.session?.damagePerHour ?? 0, hunt.session?.healing ?? 0, hunt.session?.healingPerHour ?? 0,
        estimate.gpPerTc > 0 ? estimate.tcEquivalent : '', estimate.packageCount, estimate.soldTc, estimate.remainingTc, estimate.realValue ?? '']
      }),
    ] },
    { name: 'Monstros', rows: [
      ['Data', 'Personagem', 'Local / Respawn', 'Quantidade', 'Monstro'],
      ...hunts.flatMap(hunt => (hunt.session?.monsters ?? []).map(monster => [hunt.date, hunt.character, hunt.location, monster.count, monster.name])),
    ] },
    { name: 'Itens', rows: [
      ['Data', 'Personagem', 'Local / Respawn', 'Quantidade', 'Item'],
      ...hunts.flatMap(hunt => (hunt.session?.items ?? []).map(item => [hunt.date, hunt.character, hunt.location, item.count, item.name])),
    ] },
  ];

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${xmlEscape(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`;
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(contentTypes),
    '_rels/.rels': strToU8(rootRels),
    'xl/workbook.xml': strToU8(workbook),
    'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
  };
  sheets.forEach((sheet, index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(worksheet(sheet.rows)); });
  return zipSync(files, { level: 6 });
}

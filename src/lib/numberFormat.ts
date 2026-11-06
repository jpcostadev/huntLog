const fullNumber = new Intl.NumberFormat('pt-BR');
const brlNumber = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const units = [
  { size: 1e12, suffix: 'T' },
  { size: 1e9, suffix: 'B' },
  { size: 1e6, suffix: 'M' },
  { size: 1e3, suffix: 'k' },
];

export function formatCompactNumber(value: number) {
  const absolute = Math.abs(value);
  if (!Number.isFinite(value) || absolute < 1000) return fullNumber.format(Number.isFinite(value) ? value : 0);
  let unitIndex = units.findIndex(unit => absolute >= unit.size);
  if (unitIndex < 0) return fullNumber.format(value);
  const currentUnit = units[unitIndex];
  if (unitIndex > 0 && Math.round((absolute / currentUnit.size) * 10) / 10 >= 1000) unitIndex--;
  const unit = units[unitIndex];
  const scaled = value / unit.size;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: Math.abs(scaled) < 10 ? 1 : 0 }).format(scaled)}${unit.suffix}`;
}

export function formatCompactReais(value: number) {
  if (Math.abs(value) < 1000) return brlNumber.format(value);
  return `${value < 0 ? '-R$' : 'R$'} ${formatCompactNumber(Math.abs(value))}`;
}

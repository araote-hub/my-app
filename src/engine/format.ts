import type { Value } from './evaluate';

const SIGNIFICANT_DIGITS = 12;

/** Formats a result the way the TI-92 shows it. */
export function formatValue(v: Value): string {
  if (typeof v === 'number') return formatNumber(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  switch (v.type) {
    case 'list':
      return `{${v.items.map(formatNumber).join(' ')}}`;
    case 'solutions':
      return v.roots.map((r) => `${v.name}=${formatNumber(r)}`).join(' or ');
    case 'done':
      return 'Done';
  }
}

/** 12 significant digits, "⁻" for negatives, "ᴇ" for scientific notation, "undef" for undefined results. */
export function formatNumber(v: number): string {
  if (Number.isNaN(v)) return 'undef';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '⁻∞';
  if (v === 0) return '0';

  const sign = v < 0 ? '⁻' : '';
  const a = Number(Math.abs(v).toPrecision(SIGNIFICANT_DIGITS));
  if (a >= 1e12 || a < 1e-4) {
    const [mantissa, exp] = a.toExponential(SIGNIFICANT_DIGITS - 1).split('e');
    const m = mantissa.replace(/\.?0+$/, '');
    const e = Number(exp);
    return `${sign}${m}ᴇ${e < 0 ? '⁻' : ''}${Math.abs(e)}`;
  }
  return sign + String(a);
}

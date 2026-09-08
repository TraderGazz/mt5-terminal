/**
 * Number / price / money formatting helpers (design.md §3, §7).
 * All prices & money must be rendered with the `tnum` (tabular-nums) utility.
 */

/** Typographic minus used by MT5 RU for negative values. */
export const MINUS = '\u2212';

const moneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFormatter = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 0,
});

/** Price with a fixed number of digits, e.g. formatPrice(1.08427, 5) → "1.08427". */
export function formatPrice(value: number, digits: number): string {
  return value.toFixed(digits);
}

/**
 * Split a formatted price into the main part and the trailing pip digit,
 * for MT5-style trailing-digit emphasis (last digit rendered at 70% size).
 */
export function splitPrice(value: number, digits: number): { main: string; pip: string } {
  const s = formatPrice(value, digits);
  return { main: s.slice(0, -1), pip: s.slice(-1) };
}

/** Spread in points, e.g. 12 → "12". */
export function formatSpread(points: number): string {
  return intFormatter.format(points);
}

/** "1 250 000,00 ₽" (narrow nbsp thousands, comma decimals, RUB sign). */
export function formatMoney(value: number): string {
  const prefix = value < 0 ? MINUS : '';
  return `${prefix}${moneyFormatter.format(Math.abs(value))} ₽`;
}

/** "+12 450,00 ₽" / "−3 200,50 ₽" — always signed. */
export function formatSignedMoney(value: number): string {
  const prefix = value < 0 ? MINUS : '+';
  return `${prefix}${moneyFormatter.format(Math.abs(value))} ₽`;
}

/** "+0.12%" / "−0.34%" — always signed, dot decimals like MT5. */
export function formatPercent(value: number): string {
  const prefix = value < 0 ? MINUS : '+';
  return `${prefix}${Math.abs(value).toFixed(2)}%`;
}

/** Volume lots, e.g. 0.5 → "0.50". */
export function formatVolume(value: number): string {
  return value.toFixed(2);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "14:32:05" */
export function formatTime(d: number | Date): string {
  const dt = typeof d === 'number' ? new Date(d) : d;
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
}

/** "14:32" */
export function formatTimeShort(d: number | Date): string {
  const dt = typeof d === 'number' ? new Date(d) : d;
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

/** "12.05.2025" */
export function formatDate(d: number | Date): string {
  const dt = typeof d === 'number' ? new Date(d) : d;
  return `${pad2(dt.getDate())}.${pad2(dt.getMonth() + 1)}.${dt.getFullYear()}`;
}

/** "12.05.2025 14:32" (MT5 history style) */
export function formatDateTime(d: number | Date): string {
  return `${formatDate(d)} ${formatTimeShort(d)}`;
}

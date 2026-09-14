import { MINUS, formatTimeShort } from '@/lib/format';
import { DAY, startOfDay } from './historyFilter';

/** Formatting helpers local to the history pages (lib/format is read-only). */

const pad2 = (n: number) => String(n).padStart(2, '0');

const plainMoneyFormatter = new Intl.NumberFormat('ru-RU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Signed money without the currency sign: "−45,20" / "1 450,00". */
export function formatPlainMoney(value: number): string {
  return `${value < 0 ? MINUS : ''}${plainMoneyFormatter.format(Math.abs(value))}`;
}

/**
 * MT5-style money: thousands separated by a regular space, decimal part after
 * a DOT, plain hyphen minus: "-68 247.12" / "3 690 482.00". No currency sign.
 */
export function formatMoneyMT5(value: number): string {
  const [int, frac] = Math.abs(value).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0 ? '-' : ''}${grouped}.${frac}`;
}

/** Always-signed MT5 money: "+10 000.00" / "-250.50". */
export function formatSignedMoneyMT5(value: number): string {
  return `${value < 0 ? '' : '+'}${formatMoneyMT5(value)}`;
}

// Same MT5 server-time (UTC+3) display convention as lib/format.ts: stored
// timestamps are true UTC (mt5-bridge normalize.js corrects the EA's own
// +3h broker-clock offset on ingest), so reading them back for display
// needs +3h shifted in before UTC getters — otherwise this shows true UTC
// instead of the terminal's own server-time clock.
const BROKER_OFFSET_MS = 3 * 3600 * 1000;
const toBroker = (ts: number) => new Date(ts + BROKER_OFFSET_MS);

/** "02.09 10:15" — compact day+time used inside history rows. */
export function formatDayTime(ts: number): string {
  const d = toBroker(ts);
  // formatTimeShort applies its own +3h broker shift, so pass the raw ts.
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth() + 1)} ${formatTimeShort(ts)}`;
}

const MONTHS_GEN = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

/** iOS section header label: «СЕГОДНЯ», «ВЧЕРА» or «3 СЕНТЯБРЯ». */
export function daySectionLabel(ts: number, now: number = Date.now()): string {
  const day = startOfDay(ts);
  if (day === startOfDay(now)) return 'СЕГОДНЯ';
  if (day === startOfDay(now - DAY)) return 'ВЧЕРА';
  const d = toBroker(ts);
  return `${d.getUTCDate()} ${MONTHS_GEN[d.getUTCMonth()]}`.toUpperCase();
}

const MONTHS_SHORT = [
  'янв.',
  'февр.',
  'мар.',
  'апр.',
  'мая',
  'июня',
  'июля',
  'авг.',
  'сент.',
  'окт.',
  'нояб.',
  'дек.',
];

/** «10 авг. 2025 г.» — MT5 iOS date-pill format on the period picker. */
export function formatRuShortDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()} г.`;
}

/** "2026.08.28 23:45:03" — MT5 iOS history row timestamp (yyyy.mm.dd hh:mm:ss). */
export function formatFullDateTime(ts: number): string {
  const d = toBroker(ts);
  return `${d.getUTCFullYear()}.${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
}

/** "2026-09-04" — value format of <input type="date">. */
export function toISODate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses the <input type="date"> value to a local timestamp (start of day). */
export function parseISODate(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

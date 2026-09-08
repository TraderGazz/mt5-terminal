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

/** "02.09 10:15" — compact day+time used inside history rows. */
export function formatDayTime(ts: number): string {
  const d = new Date(ts);
  return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)} ${formatTimeShort(d)}`;
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
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`.toUpperCase();
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
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
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

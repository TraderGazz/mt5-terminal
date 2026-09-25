/** MT5-style money: ASCII minus, space thousands, dot decimals ("-40 128 812.93"). */
export function money(value: number): string {
  const [int, dec] = Math.abs(value).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${value < 0 ? '-' : ''}${grouped}.${dec}`;
}

/** Цена с нужным числом знаков после запятой (по умолчанию 5, как EURUSD). */
export function price(value: number, digits = 5): string {
  return value === 0 ? '—' : value.toFixed(digits);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026.09.01 18:30:22" — формат даты/времени как в оригинале MT5. */
export function dt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** Объём без лишних нулей: 1.00 → "1", 0.50 → "0.5". */
export function lots(volume: number): string {
  return String(Math.round(volume * 100) / 100);
}

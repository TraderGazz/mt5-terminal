/**
 * Re-exports of shared formatters + a digits helper for report generation.
 * Keeps ReportsSection focused on UI; no shared files are modified.
 */
import { getSymbolMeta } from '@/mocks';

export {
  formatDate,
  formatDateTime,
  formatMoney,
  formatPrice,
  formatSignedMoney,
} from '@/lib/format';

/** Digits for a symbol with a safe fallback (FX majors = 5). */
export function getSymbolDigitsSafe(symbol: string): number {
  return getSymbolMeta(symbol)?.digits ?? 5;
}

/**
 * /embed/history — minimal chromeless History embed for the AlfaForex site
 * (embed-history.md). No NavBar / TabBar, fluid width 320–768px, read-only.
 * Host may preset filters via ?symbol=EURUSD&period=week.
 */
import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useQuotes } from '@/mocks';
import { getDeals, useDealsVersion } from '@/mocks-trade/editStore';
import { formatTimeShort } from '@/lib/format';
import EmbedFilterBar, { PERIOD_PRESETS } from '@/components/embed/EmbedFilterBar';
import { EmbedDealList, EmbedTotalsFooter } from '@/components/embed/EmbedDealList';

const DAY = 86400_000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function EmbedHistory() {
  const [params, setParams] = useSearchParams();
  const symbol = params.get('symbol') ?? 'all';
  const periodParam = params.get('period') ?? 'month';
  const period = PERIOD_PRESETS.some((p) => p.id === periodParam) ? periodParam : 'month';

  const quotes = useQuotes();
  const syncedAt = quotes[0]?.updatedAt ?? Date.now();

  // Reads through editStore so «(изм.)» edits propagate here too.
  const dealsVersion = useDealsVersion();

  const symbols = useMemo(
    () => Array.from(new Set(getDeals().map((d) => d.symbol))).sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dealsVersion],
  );

  const filtered = useMemo(() => {
    const preset = PERIOD_PRESETS.find((p) => p.id === period) ?? PERIOD_PRESETS[3];
    const from = !Number.isFinite(preset.days)
      ? 0
      : preset.days === 0
        ? startOfToday()
        : preset.id === 'yesterday'
          ? startOfToday() - DAY
          : Date.now() - preset.days * DAY;
    const to = preset.id === 'yesterday' ? startOfToday() : Infinity;
    return getDeals().filter(
      (d) =>
        (symbol === 'all' || d.symbol === symbol) &&
        d.closeTime >= from &&
        d.closeTime < to,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, period, dealsVersion]);

  const setParam = (key: string, value: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if ((key === 'symbol' && value === 'all') || (key === 'period' && value === 'month')) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
        return next;
      },
      { replace: true },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-bg-secondary">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[768px] flex-col">
        <EmbedFilterBar
          symbols={symbols}
          symbol={symbol}
          onSymbol={(s) => setParam('symbol', s)}
          period={period}
          onPeriod={(p) => setParam('period', p)}
        />
        <div className="flex-1">
          <EmbedDealList key={`${symbol}:${period}`} deals={filtered} />
        </div>
        <p className="tnum px-4 pb-2 text-center text-[10px] text-text-secondary">
          Данные синхронизированы с MT5 · {formatTimeShort(syncedAt)}
        </p>
        <EmbedTotalsFooter deals={filtered} />
      </div>
    </div>
  );
}

/**
 * /embed/trade — minimal chromeless Trade embed for the AlfaForex site
 * (embed-trade.md). No NavBar / TabBar, fluid width 320–768px, read-only.
 * Host may pass ?user= token (accepted silently; mock data stage).
 */
import { useSearchParams } from 'react-router';
import { POSITIONS, useQuotes } from '@/mocks';
import { formatTime } from '@/lib/format';
import EmbedAccountBar from '@/components/embed/EmbedAccountBar';
import EmbedPositions from '@/components/embed/EmbedPositions';

export default function EmbedTrade() {
  const [params] = useSearchParams();
  // postMessage-ready: host site may preset the user token (?user=…).
  void params.get('user');

  const quotes = useQuotes();
  const tick = quotes[0]?.tick ?? 0;
  const updatedAt = quotes[0]?.updatedAt ?? Date.now();

  const floatingPnl = POSITIONS.reduce((s, p) => s + p.profit, 0);

  return (
    <div className="min-h-[100dvh] bg-bg-secondary">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[768px] flex-col">
        <EmbedAccountBar floatingPnl={floatingPnl} tick={tick} />
        <h2 className="px-4 pb-1.5 pt-3 text-[13px] font-medium uppercase tracking-wide text-text-secondary">
          Открытые позиции · {POSITIONS.length}
        </h2>
        <EmbedPositions />
        <p className="tnum mt-auto px-4 py-3 text-center text-[10px] text-text-secondary">
          Обновлено {formatTime(updatedAt)} · синхронизация с MT5 каждые 5 мин
        </p>
      </div>
    </div>
  );
}

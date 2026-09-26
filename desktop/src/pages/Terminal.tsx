import { useOutletContext } from 'react-router';
import Chart from '@/components/Chart';
import BottomPanel from '@/components/BottomPanel';
import { SymbolBar } from '@/components/Toolbar';
import type { TerminalOutletContext } from '@/components/Shell';

/**
 * Главный экран терминала (заявка заказчика: «Торговля»/«История» — точная
 * копия оригинала MT5) — график сверху, под ним закреплённая панель с
 * вкладками (BottomPanel), как в самом MT5: это НЕ отдельные страницы,
 * переключение происходит внутри одной и той же панели, график остаётся
 * виден всегда.
 */
export default function TerminalPage() {
  const { timeframe } = useOutletContext<TerminalOutletContext>();

  return (
    <div className="flex h-full flex-col">
      <SymbolBar symbol="EURUSD" timeframe={timeframe} />
      <div className="min-h-0 flex-1">
        <Chart timeframe={timeframe} />
      </div>
      {/* Полоса вкладок открытых графиков, как в оригинале (у нас всегда
          один график — вкладка декоративная, некликабельная). */}
      <div className="flex h-6 shrink-0 items-center border-b border-hairline bg-grouped px-1 text-[12px]">
        <span className="flex items-center gap-1 rounded-t border border-b-0 border-hairline bg-white px-2 py-0.5 text-[#3a3a3c]">
          <svg viewBox="0 0 16 16" className="h-2.5 w-2.5 text-text-2" fill="none" stroke="currentColor" strokeWidth="1.4">
            <rect x="4" y="7" width="8" height="6" rx="1" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
          EURUSD, {timeframe}
        </span>
      </div>
      <div className="h-[280px] shrink-0">
        <BottomPanel />
      </div>
    </div>
  );
}

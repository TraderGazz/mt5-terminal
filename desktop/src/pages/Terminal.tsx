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
      <div className="h-[280px] shrink-0">
        <BottomPanel />
      </div>
    </div>
  );
}

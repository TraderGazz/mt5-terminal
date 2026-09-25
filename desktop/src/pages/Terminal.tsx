import Chart from '@/components/Chart';
import BottomPanel from '@/components/BottomPanel';

/**
 * Главный экран терминала (заявка заказчика: «Торговля»/«История» — точная
 * копия оригинала MT5) — график сверху, под ним закреплённая панель с
 * вкладками (BottomPanel), как в самом MT5: это НЕ отдельные страницы,
 * переключение происходит внутри одной и той же панели, график остаётся
 * виден всегда.
 */
export default function TerminalPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <Chart />
      </div>
      <div className="h-[280px] shrink-0">
        <BottomPanel />
      </div>
    </div>
  );
}

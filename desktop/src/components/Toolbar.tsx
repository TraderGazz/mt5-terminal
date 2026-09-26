import type { ReactNode } from 'react';

const MENU = ['Файл', 'Вид', 'Вставка', 'Графики', 'Сервис', 'Окно', 'Справка'];

/** Строка меню (декоративная — заказчик просил именно внешний вид, эти пункты в оригинале открывают выпадающие меню, здесь не реализовано). */
export function MenuBar() {
  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-hairline bg-[#F0F0F0] px-3 text-[13px] text-[#3a3a3c]">
      {MENU.map((m) => (
        <span key={m} className="cursor-default py-1 hover:text-black">{m}</span>
      ))}
    </div>
  );
}

/** Реально поддерживаются сервером только M1—D1 (см. server/routes/candles.js), W1/MN — для вида, как в оригинале, но неактивны. */
const TIMEFRAMES: { tf: string; enabled: boolean }[] = [
  { tf: 'M1', enabled: true }, { tf: 'M5', enabled: true }, { tf: 'M15', enabled: true },
  { tf: 'M30', enabled: true }, { tf: 'H1', enabled: true }, { tf: 'H4', enabled: true },
  { tf: 'D1', enabled: true }, { tf: 'W1', enabled: false }, { tf: 'MN', enabled: false },
];

function ToolIcon({ children, title, active }: { children: ReactNode; title: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={title}
      disabled
      className={`flex h-6 w-6 shrink-0 cursor-not-allowed items-center justify-center rounded ${
        active ? 'bg-[#d7e6fb] text-accent' : 'text-[#5a5a5e]'
      }`}
    >
      {children}
    </button>
  );
}

const Divider = () => <span className="mx-1 h-4 w-px shrink-0 bg-[#d0d0d4]" />;

/**
 * Иконочная панель инструментов, как в оригинале — под меню, над графиком.
 * Реально работают только кнопки таймфрейма (переключают график) и
 * «Новый ордер» (переключает на вкладку Торговля, где кнопка открытия
 * сделки уже есть в мобильной версии — здесь просто placeholder на вид,
 * т.к. просмотр ПК-версии для трейдинга отдельно не заказывался). Остальные
 * иконки — декоративные placeholder'ы: у нас нет доступа к оригинальным
 * иконкам MT5 (нет интернета в этом окружении), задача была решить общий
 * вид и плотность панели, а не пиксель каждой иконки.
 */
export function Toolbar({ timeframe, onTimeframe }: { timeframe: string; onTimeframe: (tf: string) => void }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 overflow-hidden border-b border-hairline bg-[#f5f5f7] px-2">
      <ToolIcon title="Новый график">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2" y="2" width="4" height="8" /><rect x="7" y="5" width="4" height="7" /><rect x="12" y="3" width="2" height="9" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Сохранить">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Печать">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="3" y="6" width="10" height="6" rx="1" /><path d="M4.5 6V3h7v3" />
        </svg>
      </ToolIcon>
      <Divider />
      <ToolIcon title="IDE">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M5 4L2 8l3 4M11 4l3 4-3 4" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Защищено">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="3.5" y="7" width="9" height="6" rx="1" /><path d="M5 7V5a3 3 0 0 1 6 0v2" />
        </svg>
      </ToolIcon>
      <Divider />
      <label className="flex shrink-0 cursor-not-allowed items-center gap-1 px-1 text-[11px] text-[#8e8e93]">
        <input type="checkbox" disabled className="h-3 w-3" />
        Алготрейдинг
      </label>
      <button
        type="button"
        disabled
        className="ml-1 flex shrink-0 cursor-not-allowed items-center gap-1 rounded border border-hairline bg-white px-2 py-0.5 text-[12px] text-[#3a3a3c]"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3 text-accent" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M8 2v12M2 8h12" />
        </svg>
        Новый ордер
      </button>
      <Divider />
      <ToolIcon title="Окна графиков">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2" y="2" width="5" height="5" /><rect x="9" y="2" width="5" height="5" /><rect x="2" y="9" width="12" height="5" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Сетка">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2" y="2" width="12" height="12" /><path d="M2 6h12M2 10h12M6 2v12M10 2v12" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Курсор" active>
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
          <path d="M3 2l9 9-4 1-1.5 4L3 2z" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Крестовина">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M8 1v14M1 8h14" />
        </svg>
      </ToolIcon>
      <Divider />
      <ToolIcon title="Линия">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M3 13L13 3" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Каналы">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M2 12L12 2M4 14L14 4" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Текст">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
          <path d="M3 3h10M8 3v10" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Фигуры">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2.5" y="2.5" width="6" height="6" /><circle cx="11" cy="11" r="3" />
        </svg>
      </ToolIcon>
      <Divider />
      <ToolIcon title="Увеличить">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="7" cy="7" r="4.5" /><path d="M13.5 13.5L10.5 10.5" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Уменьшить">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="7" cy="7" r="4.5" /><path d="M13.5 13.5L10.5 10.5M5 7h4" />
        </svg>
      </ToolIcon>
      <Divider />
      {TIMEFRAMES.map(({ tf, enabled }) => (
        <button
          key={tf}
          type="button"
          disabled={!enabled}
          onClick={() => enabled && onTimeframe(tf)}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${
            !enabled
              ? 'cursor-not-allowed text-[#c7c7cc]'
              : tf === timeframe
                ? 'bg-accent text-white'
                : 'text-[#3a3a3c] hover:bg-white'
          }`}
        >
          {tf}
        </button>
      ))}
      <Divider />
      <ToolIcon title="Поиск">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="7" cy="7" r="4.5" /><path d="M13.5 13.5L10.5 10.5" />
        </svg>
      </ToolIcon>
      <div className="ml-auto flex shrink-0 items-center gap-2 pr-1">
        <span className="rounded bg-[#e5e5e5] px-1.5 py-0.5 text-[11px] text-[#5a5a5e]">LVL</span>
        <span className="h-3.5 w-3.5 rounded-sm bg-accent" title="Соединение установлено" />
      </div>
    </div>
  );
}

/** Строка символа над графиком, как в оригинале ("EURUSD, M5"). */
export function SymbolBar({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  return (
    <div className="flex h-6 shrink-0 items-center gap-1.5 border-b border-hairline bg-white px-3 text-[12px] font-medium text-[#3a3a3c]">
      <span className="h-2.5 w-2.5 rounded-[2px] bg-accent" />
      {symbol}, {timeframe}
    </div>
  );
}

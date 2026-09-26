import type { ReactNode } from 'react';

const MENU = ['Файл', 'Вид', 'Вставка', 'Графики', 'Сервис', 'Окно', 'Справка'];

/** Строка меню (декоративная — заказчик просил именно внешний вид, эти пункты в оригинале открывают выпадающие меню, здесь не реализовано). */
export function MenuBar() {
  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-hairline bg-white px-3 text-[13px] text-[#3a3a3c]">
      {MENU.map((m) => (
        <span key={m} className="cursor-default py-1 hover:text-black">{m}</span>
      ))}
    </div>
  );
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

function ToolIcon({ children, title }: { children: ReactNode; title: string }) {
  return (
    <button
      type="button"
      title={title}
      disabled
      className="flex h-6 w-6 shrink-0 cursor-not-allowed items-center justify-center rounded text-[#8e8e93]"
    >
      {children}
    </button>
  );
}

/**
 * Иконочная панель инструментов, как в оригинале — под меню, над графиком.
 * Реально работают только кнопки таймфрейма (переключают график), остальные
 * иконки декоративные placeholder'ы: у нас нет доступа к оригинальным
 * иконкам MT5 (нет интернета в этом окружении), точь-в-точь их не
 * скопировать — задача была решить общий вид панели, а не пиксель иконок.
 */
export function Toolbar({ timeframe, onTimeframe }: { timeframe: string; onTimeframe: (tf: string) => void }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-1 border-b border-hairline bg-[#f5f5f7] px-2">
      <ToolIcon title="Новый ордер">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
          <path d="M8 2v12M2 8h12" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Сохранить">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Печать">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="3" y="6" width="10" height="6" rx="1" />
          <path d="M4.5 6V3h7v3" />
        </svg>
      </ToolIcon>
      <span className="mx-1 h-4 w-px bg-hairline" />
      <ToolIcon title="Крестовина">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <path d="M8 1v14M1 8h14" />
        </svg>
      </ToolIcon>
      <ToolIcon title="Увеличить">
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.2">
          <circle cx="7" cy="7" r="4.5" /><path d="M13.5 13.5L10.5 10.5" />
        </svg>
      </ToolIcon>
      <span className="mx-1 h-4 w-px bg-hairline" />
      {TIMEFRAMES.map((tf) => (
        <button
          key={tf}
          type="button"
          onClick={() => onTimeframe(tf)}
          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
            tf === timeframe ? 'bg-accent text-white' : 'text-[#3a3a3c] hover:bg-white'
          }`}
        >
          {tf}
        </button>
      ))}
    </div>
  );
}

/** Строка символа над графиком, как в оригинале ("EURUSD, M5"). */
export function SymbolBar({ symbol, timeframe }: { symbol: string; timeframe: string }) {
  return (
    <div className="flex h-6 shrink-0 items-center border-b border-hairline bg-white px-3 text-[12px] font-medium text-[#3a3a3c]">
      {symbol}, {timeframe}
    </div>
  );
}

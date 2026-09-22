import type { ReactNode } from 'react';

/**
 * Phone-column shell (design.md §7): max-width 430px centered on desktop over
 * a neutral backdrop with subtle side borders. Full-bleed on real phones.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    // h-[100dvh] + overflow-hidden (не min-h): страница сама никогда не
    // скроллится, весь скролл — только через внутренние контейнеры (#app-scroll
    // и т.п.). С min-h, если контент вылезал за экран хоть на пиксель,
    // появлялся ВТОРОЙ, страничный скролл поверх внутреннего — два
    // независимых скролла конфликтовали и интерфейс визуально "проваливался"
    // при свайпе (баг-репорт заказчика).
    <div className="h-[100dvh] w-full overflow-hidden bg-[#00000014]">
      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col overflow-hidden bg-bg-grouped sm:border-x sm:border-[#0000001f]">
        {children}
      </div>
    </div>
  );
}

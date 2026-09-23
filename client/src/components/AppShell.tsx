import { useEffect, type ReactNode } from 'react';

/**
 * Phone-column shell (design.md §7): max-width 430px centered on desktop over
 * a neutral backdrop with subtle side borders. Full-bleed on real phones.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  // overflow-hidden на самом div'е не спасает от боковых эффектов iOS
  // Safari: эластичный оверскролл документа (html/body) может утащить за
  // собой всю страницу целиком (жест на графике/списке распознаётся как
  // скролл document, а не внутреннего контейнера) — заголовок с NavBar
  // уезжает за верх экрана, хотя внутри AppShell ничего логически не
  // скроллилось (баг-репорт: "страница опять съезжает", повторяется на
  // Чарте). Жёстко запрещаем скролл html/body, пока смонтирован любой
  // экран мобильной оболочки, и возвращаем как было при размонтировании —
  // /admin эту обёртку не использует вообще, там страница должна
  // скроллиться как обычно, поэтому лочим только здесь, не глобально в CSS.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

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

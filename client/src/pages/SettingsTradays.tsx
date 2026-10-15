import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';

declare global {
  interface Window {
    TradaysWidget?: { Calendar: new (opts: Record<string, unknown>, elId: string) => void };
  }
}

const WIDGET_SCRIPT_SRC = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=22';
const CONTAINER_ID = 'tradaysEconomicCalendar';

/**
 * «Настройки → Tradays» (заявка заказчика: раньше была заглушка «Режим
 * просмотра»). Реальный публичный виджет экономического календаря Tradays —
 * не требует ключа/регистрации, тот же, что встраивают сами брокеры.
 */
export default function SettingsTradaysPage() {
  const navigate = useNavigate();
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    const init = () => {
      if (window.TradaysWidget) {
        new window.TradaysWidget.Calendar(
          { width: '100%', height: '100%', mode: '2' },
          CONTAINER_ID,
        );
      }
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${WIDGET_SCRIPT_SRC}"]`);
    if (existing) {
      if (window.TradaysWidget) init();
      else existing.addEventListener('load', init);
      return;
    }
    const script = document.createElement('script');
    script.src = WIDGET_SCRIPT_SRC;
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);
  }, []);

  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="Tradays" solid left={<BackButton onClick={() => navigate(-1)} />} />
      <div className="min-h-[600px] flex-1 px-2 py-2">
        <div id={CONTAINER_ID} className="h-full min-h-[600px] w-full" />
      </div>
    </div>
  );
}

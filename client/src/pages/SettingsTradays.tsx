import { useEffect, useId } from 'react';
import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';

// Реальная (не выдуманная) форма API — проверено содержимым самого
// widget.js: он не экспортирует класс, а вешает на window функцию
// economicCalendar(opts), плюс window.calendarCompletedID — массив уже
// инициализированных containerId (повторный вызов с тем же id — no-op,
// поэтому id должен быть уникальным на каждый маунт страницы, иначе при
// повторном заходе виджет молча не отрисуется).
declare global {
  interface Window {
    economicCalendar?: (opts: Record<string, unknown>) => void;
    calendarCompletedID?: string[];
  }
}

const WIDGET_SCRIPT_SRC = 'https://www.tradays.com/c/js/widgets/calendar/widget.js?v=22';

function loadScriptOnce(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
  if (existing) {
    return (existing as HTMLScriptElement & { dataset: { loaded?: string } }).dataset.loaded === '1'
      ? Promise.resolve()
      : new Promise((resolve) => existing.addEventListener('load', () => resolve(), { once: true }));
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = '1';
      resolve();
    };
    document.body.appendChild(script);
  });
}

/**
 * «Настройки → Tradays» (заявка заказчика: раньше была заглушка «Режим
 * просмотра»). Реальный публичный виджет экономического календаря Tradays —
 * не требует ключа/регистрации, тот же, что встраивают сами брокеры.
 */
export default function SettingsTradaysPage() {
  const navigate = useNavigate();
  const containerId = `tradays-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    loadScriptOnce(WIDGET_SCRIPT_SRC).then(() => {
      if (!cancelled) window.economicCalendar?.({ width: '100%', height: '100%', mode: 2, lang: 'ru', containerId });
    });
    return () => {
      cancelled = true;
    };
  }, [containerId]);

  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="Tradays" solid left={<BackButton onClick={() => navigate(-1)} />} />
      <div className="min-h-[600px] flex-1 px-2 py-2">
        <div id={containerId} className="h-full min-h-[600px] w-full" />
      </div>
    </div>
  );
}

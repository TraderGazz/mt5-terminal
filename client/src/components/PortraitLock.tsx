import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Заявка заказчика 2026-10-21: при повороте телефона сайт поворачивается
 * вместе с ним — manifest.webmanifest "orientation": "portrait" должен был
 * это предотвращать, но Safari на iOS это поле часто игнорирует даже в
 * установленном (standalone) режиме. Фикс через CSS-трюк (components.css
 * ".force-portrait") надёжнее — держит портретную раскладку независимо от
 * браузера. Не применяется к /admin и /embed/* — эти страницы рассчитаны
 * на десктоп/любую ориентацию, принудительный портрет там был бы вреден.
 */
const EXEMPT_PREFIXES = ['/admin', '/embed'];

export default function PortraitLock() {
  const location = useLocation();
  useEffect(() => {
    const exempt = EXEMPT_PREFIXES.some((p) => location.pathname.startsWith(p));
    document.documentElement.classList.toggle('force-portrait', !exempt);
  }, [location.pathname]);
  return null;
}

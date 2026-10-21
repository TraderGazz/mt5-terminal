import { useEffect } from 'react';
import { useLocation } from 'react-router';

/**
 * Заявка заказчика 2026-10-21: при повороте телефона сайт поворачивается
 * вместе с ним. manifest.webmanifest "orientation": "portrait" ничего не
 * даёт в Safari на iOS — WebKit вообще не реализует блокировку ориентации,
 * ни в обычной вкладке, ни в установленном (standalone) PWA. Чистый CSS
 * @media(orientation) тоже оказался ненадёжным на практике (подтверждено
 * на проде: не сработал ни на html, ни на body). Пересчитываем размеры и
 * поворот через JS в пикселях (не vw/vh — те "плавают" из-за динамической
 * панели Safari) на событие resize/orientationchange — надёжнее, т.к. не
 * зависит от того, успел ли движок пересчитать CSS-медиазапрос вовремя.
 * Не применяется к /admin и /embed/* — им нужна обычная раскладка.
 */
const EXEMPT_PREFIXES = ['/admin', '/embed'];

function applyLock(active: boolean) {
  const body = document.body;
  if (!active) {
    body.style.cssText = '';
    return;
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w <= h) {
    // Уже портрет — ничего не трогаем.
    body.style.cssText = '';
    return;
  }
  // Альбомная ориентация при активной блокировке — разворачиваем body
  // обратно в портрет средствами transform, размеры в пикселях.
  // top:${h}px якорит собственный (0,0) угла box'а в точке (0, h) страницы;
  // rotate(-90deg) вокруг этой точки переносит правильные углы box'а ровно
  // в [0,w]×[0,h] — проверено матрично, без лишних translate.
  body.style.position = 'fixed';
  body.style.top = `${h}px`;
  body.style.left = '0';
  body.style.width = `${h}px`;
  body.style.height = `${w}px`;
  body.style.margin = '0';
  body.style.overflow = 'hidden';
  body.style.transformOrigin = 'top left';
  body.style.transform = 'rotate(-90deg)';
}

export default function PortraitLock() {
  const location = useLocation();

  useEffect(() => {
    const exempt = EXEMPT_PREFIXES.some((p) => location.pathname.startsWith(p));
    if (exempt) {
      applyLock(false);
      return;
    }
    applyLock(true);
    const onResize = () => applyLock(true);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      applyLock(false);
    };
  }, [location.pathname]);

  return null;
}

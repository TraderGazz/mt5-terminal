/**
 * Брокерский логотип (Альфа-Форекс): красный квадрат со свечным глифом —
 * белая свеча сверху и тёмная снизу на фоне тонких вертикальных линий сетки.
 * Используется в шапке «Авторизация» (32px) и на странице «Счёт» (64px).
 */
export default function BrokerLogo({ size = 32 }: { size?: number }) {
  return (
    <div
      className="shrink-0 overflow-hidden bg-[#EF3124]"
      style={{ width: size, height: size, borderRadius: size * 0.14 }}
      aria-hidden
    >
      <svg viewBox="0 0 64 64" width={size} height={size}>
        {/* фоновая сетка */}
        <g stroke="#D92A20" strokeWidth="2">
          <line x1="12" y1="0" x2="12" y2="64" />
          <line x1="30" y1="0" x2="30" y2="64" />
          <line x1="48" y1="0" x2="48" y2="64" />
        </g>
        {/* белая свеча: тело от верхнего края + фитиль вниз */}
        <rect x="18" y="0" width="17" height="27" fill="#FFFFFF" />
        <line x1="26.5" y1="27" x2="26.5" y2="46" stroke="#FFFFFF" strokeWidth="2.5" />
        {/* тёмная свеча: фитили + тело */}
        <line x1="43" y1="22" x2="43" y2="60" stroke="#3D3D3D" strokeWidth="2.5" />
        <rect x="35" y="32" width="16" height="18" fill="#3D3D3D" />
      </svg>
    </div>
  );
}

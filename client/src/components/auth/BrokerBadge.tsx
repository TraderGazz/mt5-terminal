/**
 * Generic broker badge (auth.md §1, design.md §12): white candlestick-chart
 * glyph on a #007AFF rounded square. Trademark-safe — NOT the MT5 logo.
 * Same mark as the PWA icon set.
 */
export default function BrokerBadge({ size = 64 }: { size?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-[14px] bg-accent"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} fill="none">
        <g stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round">
          <line x1="8" y1="10" x2="8" y2="25" />
          <line x1="16" y1="6" x2="16" y2="21" />
          <line x1="24" y1="3" x2="24" y2="15" />
        </g>
        <g fill="#FFFFFF">
          <rect x="5.5" y="14" width="5" height="7" rx="1" />
          <rect x="13.5" y="10" width="5" height="7" rx="1" />
          <rect x="21.5" y="7" width="5" height="5" rx="1" />
        </g>
      </svg>
    </div>
  );
}

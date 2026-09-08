/**
 * MT5 iOS settings icon squares — pixel-traced from the original app
 * (primary ref: image(19), 427px). Each icon is a self-contained SVG with
 * its own colored rounded-square background, so it renders identically at
 * any size (list rows 31px, stub modal 54px). Glyph geometry is drawn on a
 * 32×32 grid; the corner radius (~23%) matches the iOS squircle look.
 *
 * Style contract (original MT5 iOS, light theme): standard iOS system
 * colors (#34C759 / #5AC8FA / #FF9500 / #FF3B30 / #007AFF / #8E8E93) and
 * THIN WHITE OUTLINE glyphs (SF-Symbols-like, stroke ~1.7 on the 32 grid),
 * not filled shapes.
 */

import type { ComponentType } from 'react';

export interface SettingsIconProps {
  size: number;
}

export type SettingsIcon = ComponentType<SettingsIconProps>;

const R = 7.5; // corner radius on the 32-unit grid (~23%)
const SW = 1.7; // glyph stroke width — thin iOS outline

/** Новый счет — iOS green #34C759, outline person bust + plus. */
export function IconNewAccount({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#34C759" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="13" cy="11.4" r="3.5" />
        <path d="M6 23.6c0-4.6 3.1-7.2 7-7.2s7 2.6 7 7.2" />
        <path d="M23.4 9.4v6M20.4 12.4h6" />
      </g>
    </svg>
  );
}

/** Почта — iOS light blue #5AC8FA, outline envelope. */
export function IconMail({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#5AC8FA" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="7" y="10.4" width="18" height="12" rx="2" />
        <path d="M8.2 11.9l7.8 5.6 7.8-5.6" />
      </g>
    </svg>
  );
}

/** Новости — iOS orange #FF9500, outline open book. */
export function IconNews({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#FF9500" />
      <g transform="translate(16 16) scale(0.9) translate(-16 -16)">
        <path
          d="M16 11.6c-2.4-1.9-5.9-2-8.9-1.5v12.6c3-.5 6.5-.4 8.9 1.5 2.4-1.9 5.9-2 8.9-1.5V10.1c-3-.5-6.5-.4-8.9 1.5zm0 0v12.6"
          fill="none"
          stroke="#fff"
          strokeWidth={SW}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/** Tradays — iOS red #FF3B30, straight outline calendar with two binders. */
export function IconTradays({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#FF3B30" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="8.8" y="9" width="14.4" height="14.4" rx="2.2" />
        <path d="M8.8 13.2h14.4" />
        <path d="M12.4 7v3.2M19.6 7v3.2" />
      </g>
    </svg>
  );
}

/** Чат и сообщения — iOS blue #007AFF, outline thumbs-up. */
export function IconChat({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#007AFF" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 14.6h2.6c.6 0 1 .4 1 1v7.4c0 .6-.4 1-1 1H7c-.6 0-1-.4-1-1v-7.4c0-.6.4-1 1-1z" />
        <path d="M10.6 23.6v-8.8l4-5.9c.8-1.2 2.7-.7 2.7.8l-.4 3.7h5.9c1.2 0 2.1 1.1 1.8 2.3l-1.7 6.3c-.3 1-1.2 1.6-2.3 1.6h-10z" />
      </g>
    </svg>
  );
}

/** Сообщество трейдеров — iOS blue #007AFF, all-white italic «MQL5». */
export function IconCommunity({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#007AFF" />
      <text
        x="16"
        y="20.4"
        textAnchor="middle"
        textLength="23"
        lengthAdjust="spacingAndGlyphs"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="9.2"
        fontWeight="800"
        fontStyle="italic"
        fill="#fff"
      >
        MQL5
      </text>
    </svg>
  );
}

/** MQL5 Algo Trading — iOS blue #007AFF, outline paper plane. */
export function IconAlgo({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#007AFF" />
      <g
        transform="rotate(-12 16 16)"
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M25.8 6.4L7 14.5l6.9 2.4 2.5 7.6 3.3-6.1z" />
        <path d="M13.9 16.9L25.8 6.4" />
      </g>
    </svg>
  );
}

/** OTP — iOS green #34C759, outline key (bow ring + shaft with teeth). */
export function IconOtp({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#34C759" />
      <g
        transform="rotate(-45 16 16)"
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="20.4" cy="16" r="3.9" />
        <path d="M16.5 16H8" />
        <path d="M10.6 16v3.1M13.4 16v2.3" />
      </g>
    </svg>
  );
}

/** Интерфейс — iOS blue #007AFF solid square, white «A文» (A larger). */
export function IconInterface({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#007AFF" />
      <text
        x="6.6"
        y="21.6"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="14.5"
        fontWeight="700"
        fill="#fff"
      >
        A
      </text>
      <text
        x="16.6"
        y="21.2"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        fontSize="12"
        fontWeight="500"
        fill="#fff"
      >
        文
      </text>
    </svg>
  );
}

/** Чарты — iOS blue #007AFF, L-axes + two outline candlesticks. */
export function IconCharts({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#007AFF" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M8.6 7.6v15.2c0 .8.6 1.4 1.4 1.4h14" />
        <path d="M13.6 9.8v2.4M13.6 18.6v2" />
        <rect x="12" y="12.2" width="3.2" height="6.4" rx="0.9" />
        <path d="M19.8 8.2v2.2M19.8 16.8v2.4" />
        <rect x="18.2" y="10.4" width="3.2" height="6.4" rx="0.9" />
      </g>
    </svg>
  );
}

/** Журнал — iOS gray #8E8E93, outline document with folded corner + lines. */
export function IconJournal({ size }: SettingsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx={R} fill="#8E8E93" />
      <g
        fill="none"
        stroke="#fff"
        strokeWidth={SW}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 24.4V7.6h8.6l4 4v12.8z" />
        <path d="M18.6 7.6v4h4" />
        <path d="M12.8 15.4h6.4M12.8 18.4h6.4M12.8 21.4h4.6" />
      </g>
    </svg>
  );
}

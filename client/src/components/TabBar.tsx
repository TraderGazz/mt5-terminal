import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { ArrowDownUp, History, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentRole } from '@/components/auth/session';

/** Props shared by lucide icons and the two custom inline-SVG icons below. */
interface TabIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/**
 * «Чарт» tab icon (MT5 iOS): two candlesticks — the left one filled, the
 * right one hollow. Lucide has no filled-body candlestick icon, so this is
 * an inline SVG traced from the original app (ref image(28)).
 */
function CandlesIcon({ size = 24, strokeWidth = 1.7, className }: TabIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* left candle — filled body */}
      <line x1="8" y1="3" x2="8" y2="21" />
      <rect x="5.3" y="8.5" width="5.4" height="7.6" rx="1" fill="currentColor" stroke="none" />
      {/* right candle — hollow body */}
      <line x1="16" y1="5" x2="16" y2="22" />
      <rect x="13.3" y="9" width="5.4" height="7" rx="1" />
    </svg>
  );
}

/**
 * «Торговля» tab icon (MT5 iOS): a rising zig-zag line inside a rounded
 * square frame. No lucide equivalent — inline SVG from ref image(28).
 */
function TradeIcon({ size = 24, strokeWidth = 1.7, className }: TabIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="4" y="4.5" width="16" height="15" rx="2.5" />
      <polyline points="7.5,15 10.5,11.5 13,13.5 16.5,8.5" />
    </svg>
  );
}

type TabIcon = (props: TabIconProps) => ReactNode;

interface TabDef {
  to: string;
  label: string;
  icon: TabIcon;
  strokeWidth?: number;
  end?: boolean;
  /** Active tint — defaults to iOS blue; «Торговля» is red (#FF3B30) in MT5 iOS. */
  activeClassName?: string;
  /** ВРЕМЕННО (по просьбе заказчика): рендерится серым, не тапается. */
  disabled?: boolean;
}

/**
 * The 5 MT5 tabs (MT5 iOS refs image(24)/(28)): Котировки = down/up arrows,
 * Чарт = candlesticks, Торговля = chart line in a square, История = history
 * clock, Настройки = gear. Inactive glyphs are near-black thin line icons,
 * the active one is #007AFF — except «Торговля», which is red #FF3B30 in
 * the original MT5 iOS (ref image(29)).
 */
const TABS: TabDef[] = [
  { to: '/', label: 'Котировки', icon: ArrowDownUp, strokeWidth: 2, end: true },
  { to: '/chart', label: 'Чарт', icon: CandlesIcon, strokeWidth: 1.7 },
  { to: '/trade', label: 'Торговля', icon: TradeIcon, strokeWidth: 1.7, activeClassName: 'text-[#FF3B30]' },
  // disabled переопределяется ниже по роли (только admin видит активной,
  // пока в истории есть расхождения с оригиналом — заявка заказчика).
  { to: '/history', label: 'История', icon: History, strokeWidth: 1.7, disabled: true },
  { to: '/settings', label: 'Настройки', icon: Settings, strokeWidth: 1.7 },
];

/**
 * Floating bottom tab bar (MT5 iOS style): a translucent white «pill»
 * (85% white + backdrop blur, soft shadow) floating above the bottom
 * safe-area edge with ~20px side margins. Tabs are black thin line icons
 * with small black labels; the ACTIVE tab gets a light-gray content-sized
 * pill backdrop (iOS systemFill ≈ rgba(120,120,128,0.16)) with a #007AFF
 * icon + label — NOT a filled blue circle.
 *
 * Rendered by Layout INSIDE the phone column (absolute overlay at the
 * bottom) — the column is `relative`, so the pill never leaves the 430px
 * frame. Layout adds matching bottom padding to the scroll container.
 */
export default function TabBar() {
  // История временно скрыта только для viewer (инвесторский логин, заявка
  // заказчика: пока не разберёмся с расхождениями в данных, инвестор её не
  // видит) — admin и trader видят её как обычно.
  const historyVisible = useCurrentRole() !== 'viewer';
  return (
    <nav
      aria-label="Основная навигация"
      className="pointer-events-none absolute inset-x-5 z-40"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
    >
      <div className="pointer-events-auto flex h-[74px] items-stretch rounded-[26px] bg-white/85 p-2 shadow-[0_8px_28px_rgba(0,0,0,0.14)] backdrop-blur-[20px] backdrop-saturate-[180%]">
        {TABS.map(({ to, label, icon: Icon, strokeWidth, end, activeClassName = 'text-accent', disabled: staticDisabled }) => {
          const disabled = to === '/history' ? staticDisabled && !historyVisible : staticDisabled;
          if (disabled) {
            return (
              <span
                key={to}
                aria-disabled="true"
                className="flex min-w-0 flex-1 cursor-not-allowed items-center justify-center"
              >
                <span className="flex flex-col items-center justify-center gap-[3px] rounded-[20px] px-3 py-2 opacity-35">
                  <Icon size={22} strokeWidth={strokeWidth} className="shrink-0 text-[#1C1C1E]" />
                  <span className="whitespace-nowrap text-[11px] font-medium leading-[13px] text-[#1C1C1E]">
                    {label}
                  </span>
                </span>
              </span>
            );
          }
          return (
            <NavLink
              key={to}
              to={to}
              end={end}
              className="flex min-w-0 flex-1 items-center justify-center"
            >
              {({ isActive }) => (
                <span
                  className={cn(
                    'flex flex-col items-center justify-center gap-[3px] rounded-[20px] px-3 py-2 transition-colors duration-200',
                    isActive && 'bg-[rgba(120,120,128,0.16)]',
                  )}
                >
                  <Icon
                    size={22}
                    strokeWidth={strokeWidth}
                    className={cn(
                      'shrink-0 transition-colors duration-200',
                      isActive ? activeClassName : 'text-[#1C1C1E]',
                    )}
                  />
                  <span
                    className={cn(
                      'whitespace-nowrap text-[11px] font-medium leading-[13px] transition-colors duration-200',
                      isActive ? activeClassName : 'text-[#1C1C1E]',
                    )}
                  >
                    {label}
                  </span>
                </span>
              )}
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

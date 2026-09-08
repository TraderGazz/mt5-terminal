import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavBarProps {
  /** Centered title (17px/600). */
  title?: ReactNode;
  /** Optional 11px secondary line under the title. */
  subtitle?: ReactNode;
  /**
   * Left slot: BackButton, icon button(s) or a text button. Icon-only
   * <button> children are auto-wrapped in the MT5-style 40px white circle.
   */
  left?: ReactNode;
  /** Right slot: 1–2 action buttons (same auto-circle rule as `left`). */
  right?: ReactNode;
  /** Full-width custom center content; overrides title/subtitle when set. */
  center?: ReactNode;
  /**
   * 'confirm' renders the right slot inside a blue (#007AFF) circle with a
   * white glyph — the MT5 iOS «apply» button (e.g. history period picker).
   */
  rightVariant?: 'default' | 'confirm';
  /**
   * When true the sticky bar gets an opaque fill matching the grouped page
   * background (#EFEFF4), so scrolling content slides under the title
   * without showing through. Default MT5 bars stay fully transparent.
   */
  solid?: boolean;
  /**
   * MT5 iOS «plain» header (e.g. the Quotes screen on its white background):
   * slot buttons render as-is — no floating white circles — and `solid`
   * fills the bar white instead of the grouped gray. Default off; other
   * pages are unaffected.
   */
  plain?: boolean;
  /**
   * @deprecated The MT5-style bar is transparent and has no bottom hairline;
   * the prop is kept for backward compatibility and is ignored.
   */
  hairline?: boolean;
}

/** Floating 40px circle button backdrop (white, blurred, soft shadow). */
const CIRCLE_CLS =
  'flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-[0_2px_12px_rgba(0,0,0,0.10)] backdrop-blur-[12px] backdrop-saturate-[180%]';

/** Blue confirm circle (MT5 iOS «apply»): #007AFF fill, white glyph, glow shadow. */
const CONFIRM_CLS = cn(
  CIRCLE_CLS,
  'bg-accent shadow-[0_4px_14px_rgba(0,122,255,0.35)] [&_button]:text-white',
);

function hasTextChildren(el: ReactElement): boolean {
  return Children.toArray(
    (el.props as { children?: ReactNode }).children,
  ).some(
    (c) => (typeof c === 'string' && c.trim() !== '') || typeof c === 'number',
  );
}

/** Icon-only <button> that is not already a styled circle → wrap candidate. */
function isCircleCandidate(child: ReactNode): child is ReactElement {
  return (
    isValidElement(child) &&
    child.type === 'button' &&
    (child.props as Record<string, unknown>)['data-navbar-circle'] == null &&
    !hasTextChildren(child)
  );
}

/** Wrap the icon-only buttons of a slot in floating white circles (MT5 iOS). */
function circleSlot(node: ReactNode): ReactNode {
  return Children.map(node, (child) =>
    isCircleCandidate(child) ? <span className={CIRCLE_CLS}>{child}</span> : child,
  );
}

/**
 * 44px navigation bar (MT5 iOS style): fully transparent — the grouped page
 * background shows through, no hairline. Left/right slots default to round
 * 40px buttons with a white translucent fill; the title stays centered.
 *
 * Pages render it as the first child of their content; it sticks to the top
 * of the app scroll container.
 */
export default function NavBar({
  title,
  subtitle,
  left,
  right,
  center,
  rightVariant = 'default',
  solid = false,
  plain = false,
}: NavBarProps) {
  return (
    <header className={cn('sticky top-0 z-40', solid && (plain ? 'bg-white' : 'bg-bg-grouped'))}>
      <div className="relative flex h-11 items-center px-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {plain ? left : circleSlot(left)}
        </div>
        <div className="pointer-events-none absolute inset-x-16 flex flex-col items-center justify-center">
          {center != null ? (
            center
          ) : (
            <>
              {title != null && (
                <span className="max-w-full truncate text-[17px] font-semibold leading-[20px] tracking-[-0.41px] text-black">
                  {title}
                </span>
              )}
              {subtitle != null && (
                <span className="max-w-full truncate text-[11px] leading-[13px] text-text-secondary">
                  {subtitle}
                </span>
              )}
            </>
          )}
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-end gap-2.5">
          {rightVariant === 'confirm' ? (
            <span className={CONFIRM_CLS}>{right}</span>
          ) : plain ? (
            right
          ) : (
            circleSlot(right)
          )}
        </div>
      </div>
    </header>
  );
}

/**
 * Standard MT5-style back button: chevron-left inside a 40px white circle.
 * An optional label (e.g. «Назад») renders to the right of the circle.
 */
export function BackButton({ label, onClick }: { label?: string; onClick: () => void }) {
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        aria-label={label ?? 'Назад'}
        onClick={onClick}
        data-navbar-circle
        className={cn(CIRCLE_CLS, 'text-black transition-opacity duration-150 active:opacity-60')}
      >
        <ChevronLeft size={22} strokeWidth={2.2} />
      </button>
      {label != null && (
        <span className="text-[17px] tracking-[-0.41px] text-accent">{label}</span>
      )}
    </span>
  );
}

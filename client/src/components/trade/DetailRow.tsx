import { useRef, useState, type ReactNode } from 'react';

interface DetailRowProps {
  label: string;
  value: ReactNode;
  /** Raw string copied to clipboard on long-press (trade-detail.md). */
  copyValue?: string;
  onCopy?: (value: string) => void;
  /** Hide the bottom hairline (last row of a group). */
  last?: boolean;
  valueClassName?: string;
}

/**
 * iOS label/value row (44px, label 15px secondary left, value 15px
 * tabular-nums right, hairline inset 16px). Long-press (550ms) copies the
 * value and flashes the row background per trade-detail.md.
 */
export default function DetailRow({
  label,
  value,
  copyValue,
  onCopy,
  last = false,
  valueClassName = '',
}: DetailRowProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [flash, setFlash] = useState(false);
  const canCopy = copyValue != null && onCopy != null;

  const clear = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = () => {
    if (!canCopy) return;
    clear();
    timerRef.current = setTimeout(() => {
      onCopy(copyValue);
      setFlash(true);
      setTimeout(() => setFlash(false), 300);
    }, 550);
  };

  return (
    <div
      className={`relative flex min-h-11 items-center justify-between gap-4 px-4 transition-colors duration-300 ${
        flash ? 'bg-fill' : 'bg-transparent'
      } ${canCopy ? 'select-none' : ''}`}
      onTouchStart={start}
      onTouchEnd={clear}
      onTouchMove={clear}
      onMouseDown={start}
      onMouseUp={clear}
      onMouseLeave={clear}
      onContextMenu={canCopy ? (e) => e.preventDefault() : undefined}
    >
      <span className="shrink-0 text-[15px] leading-[20px] text-text-secondary">{label}</span>
      <span
        className={`tnum min-w-0 truncate text-right text-[15px] leading-[20px] text-black ${valueClassName}`}
      >
        {value}
      </span>
      {!last && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-4 right-0 h-px bg-separator"
          style={{ height: '0.5px' }}
        />
      )}
    </div>
  );
}

/** iOS grouped card wrapper: white, radius 10px, clips row hairlines. */
export function RowGroup({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[10px] bg-white">{children}</div>;
}

import type { ReactNode } from 'react';

interface FlatRowProps {
  label: string;
  value: ReactNode;
  /** Hide the bottom hairline (last row of a block). */
  last?: boolean;
  valueClassName?: string;
}

/**
 * Flat MT5 iOS label/value row on the grouped gray background (#EFEFF4):
 * black 15px label left, tabular-nums value right, full-width hairline under
 * each row. No white card — rows sit directly on the page background.
 */
export default function FlatRow({
  label,
  value,
  last = false,
  valueClassName = '',
}: FlatRowProps) {
  return (
    <div className="relative flex min-h-[34px] items-center justify-between gap-4 px-4 py-1.5">
      <span className="shrink-0 text-[15px] leading-[20px] text-black">{label}</span>
      <span
        className={`tnum min-w-0 truncate text-right text-[15px] leading-[20px] text-black ${valueClassName}`}
      >
        {value}
      </span>
      {!last && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 right-0 bg-separator"
          style={{ height: '0.5px' }}
        />
      )}
    </div>
  );
}

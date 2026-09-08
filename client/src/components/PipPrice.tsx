import { splitPrice } from '@/lib/format';

interface PipPriceProps {
  value: number;
  digits: number;
  className?: string;
}

/**
 * Price with MT5-style trailing pip-digit emphasis (design.md §3): the last
 * digit renders at 70% size, superscript-offset. Always tabular-nums.
 */
export default function PipPrice({ value, digits, className = '' }: PipPriceProps) {
  const { main, pip } = splitPrice(value, digits);
  return (
    <span className={`tnum ${className}`}>
      {main}
      <span className="align-super text-[0.7em] leading-none">{pip}</span>
    </span>
  );
}

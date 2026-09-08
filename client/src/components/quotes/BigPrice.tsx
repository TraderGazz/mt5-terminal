import { splitPrice } from '@/lib/format';

interface BigPriceProps {
  value: number;
  digits: number;
  className?: string;
}

/**
 * MT5 iOS big quote price (Quotes screen): small head digits, a large bold
 * pip pair, and — for 3/5-digit symbols — the final pipette digit rendered as
 * a superscript aligned to the top of the big digits («1.15 81 ¹»).
 * Built on the shared splitPrice() helper. Always tabular-nums.
 */
export default function BigPrice({ value, digits, className = '' }: BigPriceProps) {
  const { main, pip } = splitPrice(value, digits);
  // Odd digit counts (3, 5) have a fractional pip («pipette») as the last digit.
  const pipette = digits >= 3 && digits % 2 === 1;
  const head = pipette ? main.slice(0, -2) : main.slice(0, -1);
  const big = pipette ? main.slice(-2) : `${main.slice(-1)}${pip}`;

  return (
    <span className={`tnum inline-flex items-baseline ${className}`}>
      <span className="text-[19px] font-semibold leading-none">{head}</span>
      <span className="text-[29px] font-bold leading-none">{big}</span>
      {pipette && (
        <span className="self-start text-[17px] font-semibold leading-none">{pip}</span>
      )}
    </span>
  );
}

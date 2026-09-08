interface TypeChipProps {
  type: 'buy' | 'sell';
  /** Optional trailing text, e.g. formatted volume «0.50». */
  suffix?: string;
}

/**
 * MT5 buy/sell pill (trade.md): 13px/500, buy = accent text on accent-10%
 * tint, sell = loss text on loss-10% tint, radius 4px, padding 2px 6px.
 */
export default function TypeChip({ type, suffix }: TypeChipProps) {
  const isBuy = type === 'buy';
  return (
    <span
      className={`tnum rounded-[4px] px-1.5 py-0.5 text-[13px] font-medium leading-[16px] ${
        isBuy ? 'bg-[#007AFF1A] text-accent' : 'bg-[#FF3B301A] text-loss'
      }`}
    >
      {type}
      {suffix != null && suffix !== '' ? ` ${suffix}` : ''}
    </span>
  );
}

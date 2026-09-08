/**
 * Embed Trade — compact account bar (embed-trade.md §1): Баланс / Средства /
 * Своб. маржа inline pairs + floating P/L chip that pulses on each quote tick.
 */
import { motion } from 'framer-motion';
import { ACCOUNT } from '@/mocks';
import { formatMoney, formatSignedMoney } from '@/lib/format';

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex flex-col">
      <span className="text-[11px] leading-[13px] text-text-secondary">{label}</span>
      <span className="tnum whitespace-nowrap text-[14px] font-semibold leading-[18px] text-black">
        {value}
      </span>
    </span>
  );
}

export default function EmbedAccountBar({
  floatingPnl,
  tick,
}: {
  floatingPnl: number;
  /** Monotonic tick counter — restarts the pulse animation. */
  tick: number;
}) {
  const positive = floatingPnl >= 0;
  return (
    <div className="hairline-b flex items-center gap-5 overflow-x-auto bg-white px-4 py-3">
      <Metric label="Баланс" value={formatMoney(ACCOUNT.balance)} />
      <Metric label="Средства" value={formatMoney(ACCOUNT.equity)} />
      <Metric label="Своб. маржа" value={formatMoney(ACCOUNT.freeMargin)} />
      <span className="ml-auto shrink-0">
        <motion.span
          key={tick}
          initial={{ scale: 1.06, opacity: 0.7 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className={`tnum inline-block whitespace-nowrap rounded-md px-2 py-1 text-[13px] font-semibold ${
            positive
              ? 'bg-[rgba(52,199,89,0.12)] text-[#1F9D41]'
              : 'bg-[rgba(255,59,48,0.10)] text-loss'
          }`}
        >
          {formatSignedMoney(floatingPnl)}
        </motion.span>
      </span>
    </div>
  );
}

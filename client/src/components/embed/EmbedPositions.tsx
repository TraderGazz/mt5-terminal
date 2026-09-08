/**
 * Embed Trade — open positions list (embed-trade.md §3): same row anatomy as
 * the Trade page position cells, read-only, staggered entrance, EmptyState.
 */
import { motion } from 'framer-motion';
import { Briefcase } from 'lucide-react';
import { POSITIONS, getSymbolMeta, type Position } from '@/mocks';
import { formatPrice, formatSignedMoney, formatVolume } from '@/lib/format';

function PositionRow({ position, index }: { position: Position; index: number }) {
  const digits = getSymbolMeta(position.symbol)?.digits ?? 5;
  const positive = position.profit >= 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.03 }}
      className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 transition-colors active:bg-[#D9D9DE]"
    >
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[17px] font-semibold text-black">{position.symbol}</span>
          <span
            className={`rounded px-1 text-[11px] font-semibold uppercase ${
              position.type === 'buy'
                ? 'bg-[rgba(52,199,89,0.12)] text-[#1F9D41]'
                : 'bg-[rgba(255,59,48,0.10)] text-loss'
            }`}
          >
            {position.type}
          </span>
          <span className="tnum text-[13px] text-text-secondary">
            {formatVolume(position.volume)}
          </span>
        </p>
        <p className="tnum mt-0.5 text-[13px] text-text-secondary">
          {formatPrice(position.openPrice, digits)} → {formatPrice(position.currentPrice, digits)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`tnum text-[15px] font-semibold ${
            positive ? 'text-[#1F9D41]' : 'text-loss'
          }`}
        >
          {formatSignedMoney(position.profit)}
        </p>
        <p className="tnum text-[11px] text-text-secondary">#{position.id}</p>
      </div>
    </motion.div>
  );
}

export default function EmbedPositions() {
  if (POSITIONS.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
        <Briefcase size={48} strokeWidth={1.2} className="text-text-secondary" />
        <p className="text-[17px] font-semibold text-text-secondary">Нет открытых позиций</p>
        <p className="text-[13px] text-text-secondary">
          Новые позиции появятся после синхронизации с MT5
        </p>
      </div>
    );
  }

  return (
    <div className="hairline-t bg-white">
      <div className="divide-y divide-separator/70">
        {POSITIONS.map((p, i) => (
          <PositionRow key={p.id} position={p} index={i} />
        ))}
      </div>
    </div>
  );
}

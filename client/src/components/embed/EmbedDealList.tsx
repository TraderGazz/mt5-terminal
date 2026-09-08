/**
 * Embed History — closed-deals list grouped by day (embed-history.md §2) +
 * sticky totals footer (§3). Read-only, rows show pressed state only.
 */
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { getSymbolMeta, type Deal } from '@/mocks';
import {
  formatDate,
  formatPrice,
  formatSignedMoney,
  formatTimeShort,
  formatVolume,
} from '@/lib/format';

function dayKey(ts: number): string {
  return formatDate(ts);
}

function DealRow({ deal, index }: { deal: Deal; index: number }) {
  const digits = getSymbolMeta(deal.symbol)?.digits ?? 5;
  const positive = deal.profit >= 0;
  const sub: string[] = [];
  if (deal.swap !== 0) sub.push(`своп ${formatSignedMoney(deal.swap)}`);
  if (deal.commission !== 0) sub.push(`комиссия ${formatSignedMoney(deal.commission)}`);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 12) * 0.025 }}
      className="flex items-center justify-between gap-3 bg-white px-4 py-2.5 transition-colors active:bg-[#D9D9DE]"
    >
      <div className="min-w-0">
        <p className="flex items-baseline gap-1.5">
          <span className="text-[16px] font-semibold text-black">{deal.symbol}</span>
          <span
            className={`text-[12px] font-medium ${
              deal.type === 'buy' ? 'text-[#1F9D41]' : 'text-loss'
            }`}
          >
            {deal.type} {formatVolume(deal.volume)}
          </span>
          {deal.isEdited && (
            <span className="text-[11px] text-text-secondary">(изм.)</span>
          )}
        </p>
        <p className="tnum mt-0.5 text-[12px] text-text-secondary">
          {formatPrice(deal.openPrice, digits)} → {formatPrice(deal.closePrice, digits)}
          {' · '}
          {formatTimeShort(deal.openTime)}–{formatTimeShort(deal.closeTime)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`tnum text-[15px] font-semibold ${
            positive ? 'text-[#1F9D41]' : 'text-loss'
          }`}
        >
          {formatSignedMoney(deal.profit)}
        </p>
        {sub.length > 0 && (
          <p className="tnum text-[10px] text-text-secondary">{sub.join(' · ')}</p>
        )}
      </div>
    </motion.div>
  );
}

export function EmbedDealList({ deals }: { deals: Deal[] }) {
  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 px-8 py-16 text-center">
        <Clock size={48} strokeWidth={1.2} className="text-text-secondary" />
        <p className="text-[17px] font-semibold text-text-secondary">Нет сделок</p>
        <p className="text-[13px] text-text-secondary">
          За выбранный период закрытых сделок не найдено
        </p>
      </div>
    );
  }

  const groups: { day: string; items: Deal[] }[] = [];
  for (const d of deals) {
    const key = dayKey(d.closeTime);
    const last = groups[groups.length - 1];
    if (last && last.day === key) last.items.push(d);
    else groups.push({ day: key, items: [d] });
  }

  let rowIndex = 0;
  return (
    <div className="flex flex-col gap-3 pb-3 pt-2">
      {groups.map((g) => (
        <section key={g.day}>
          <h3 className="px-4 pb-1.5 pt-1 text-[13px] font-medium uppercase tracking-wide text-text-secondary">
            {g.day}
          </h3>
          <div className="hairline-t hairline-b divide-y divide-separator/70 bg-white">
            {g.items.map((d) => (
              <DealRow key={d.ticket} deal={d} index={rowIndex++} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TotalItem({ label, value }: { label: string; value: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      <span className="text-[10px] uppercase text-text-secondary">{label}</span>
      <span
        className={`tnum text-[12px] font-semibold ${
          value > 0 ? 'text-[#1F9D41]' : value < 0 ? 'text-loss' : 'text-black'
        }`}
      >
        {formatSignedMoney(value)}
      </span>
    </span>
  );
}

export function EmbedTotalsFooter({ deals }: { deals: Deal[] }) {
  const profit = deals.reduce((s, d) => s + d.profit, 0);
  const swap = deals.reduce((s, d) => s + d.swap, 0);
  const commission = deals.reduce((s, d) => s + d.commission, 0);
  const total = profit + swap + commission;

  return (
    <div className="hairline-t sticky bottom-0 flex flex-wrap items-center gap-x-3 gap-y-1 bg-tabbar/95 px-4 py-2.5 backdrop-blur">
      <TotalItem label="Прибыль" value={profit} />
      <TotalItem label="Своп" value={swap} />
      <TotalItem label="Комиссия" value={commission} />
      <TotalItem label="Итог" value={total} />
    </div>
  );
}

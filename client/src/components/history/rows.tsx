import { useEffect, useRef, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowDownLeft, ArrowUpRight, Clock, Pencil } from 'lucide-react';
import type { Deal, DealLeg } from '@/data/history';
import { formatPrice, formatVolume, formatDate, formatTimeShort } from '@/lib/format';
import { formatDayTime, formatFullDateTime, formatMoneyMT5, formatSignedMoneyMT5 } from './utils';

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

/** Long-press (500ms) detection shared by tappable history rows. */
function useLongPress(onLongPress: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return {
    wasLongPress: () => fired.current,
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, 500);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
  };
}

/** Lots without insignificant trailing zeros: 1.00 → "1", 0.50 → "0.5". */
function formatLots(volume: number): string {
  return formatVolume(volume).replace(/\.?0+$/, '');
}

function TypeText({ type, volume }: { type: 'buy' | 'sell'; volume: number }) {
  return (
    <span className={type === 'buy' ? 'text-accent' : 'text-loss'}>
      {type} {formatLots(volume)}
    </span>
  );
}

interface RowShellProps {
  children: ReactNode;
  staggerDelay: number;
  last: boolean;
  onTap?: () => void;
  onLongPress?: () => void;
}

/** Motion wrapper + pressed state + optional long-press for history rows. */
function RowShell({ children, staggerDelay, onTap, onLongPress }: RowShellProps) {
  const lp = useLongPress(() => onLongPress?.());
  return (
    <motion.div
      initial={staggerDelay > 0 ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: staggerDelay }}
      className="relative select-none bg-white"
    >
      <div
        className={onTap ? 'active:bg-[#F2F2F7]' : ''}
        onClick={() => {
          if (onTap && !lp.wasLongPress()) onTap();
        }}
        {...(onLongPress
          ? {
              onPointerDown: lp.onPointerDown,
              onPointerUp: lp.onPointerUp,
              onPointerLeave: lp.onPointerLeave,
              onPointerCancel: lp.onPointerCancel,
            }
          : {})}
      >
        {children}
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/* Сделки                                                              */
/* ------------------------------------------------------------------ */

interface DealRowProps {
  deal: Deal;
  digits: number;
  last: boolean;
  staggerDelay: number;
  onTap: () => void;
  onLongPress: () => void;
}

/**
 * Deal row (MT5 iOS): «EURUSDrfd buy 1» + gray «open → close» on the left;
 * 17px profit (blue/red by sign) + gray «yyyy.mm.dd hh:mm:ss» on the right.
 */
export function DealRow({ deal, digits, last, staggerDelay, onTap, onLongPress }: DealRowProps) {
  return (
    <RowShell last={last} staggerDelay={staggerDelay} onTap={onTap} onLongPress={onLongPress}>
      <div className="flex items-start justify-between gap-2 px-2 py-[6px]">
        <div className="min-w-0">
          <div className="text-[17px] leading-[22px] tracking-[-0.41px]">
            <span className="font-semibold text-black">{deal.symbol}</span>{' '}
            <TypeText type={deal.type as 'buy' | 'sell'} volume={deal.volume} />
          </div>
          <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
            {formatPrice(deal.openPrice, digits)} → {formatPrice(deal.closePrice, digits)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`tnum text-[17px] font-semibold leading-[22px] ${
              deal.profit >= 0 ? 'text-accent' : 'text-loss'
            }`}
          >
            {formatMoneyMT5(deal.profit)}
          </div>
          <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
            {formatFullDateTime(deal.closeTime)}
          </div>
        </div>
      </div>
    </RowShell>
  );
}

/* ------------------------------------------------------------------ */
/* Сделки — сырые (открытие/закрытие раздельно, 1-в-1 с оригиналом)    */
/* ------------------------------------------------------------------ */

interface DealLegRowProps {
  leg: DealLeg;
  digits: number;
  last: boolean;
  staggerDelay: number;
  onTap?: () => void;
}

/**
 * Сырая сделка (MT5 «Сделки»): «EURUSDrfd buy, in» / «sell, out» — в
 * отличие от DealRow (уже слитая позиция), тут открытие и закрытие — ДВЕ
 * отдельные строки, как в самом MT5. Открывающая (in) сделка всегда с
 * прибылью 0 — справа ничего не показываем (пусто), совпадает с оригиналом.
 */
export function DealLegRow({ leg, digits, last, staggerDelay, onTap }: DealLegRowProps) {
  const showProfit = leg.entry === 'out' || leg.entry === 'inout';
  return (
    <RowShell last={last} staggerDelay={staggerDelay} onTap={onTap}>
      <div className="flex items-start justify-between gap-2 px-2 py-[6px]">
        <div className="min-w-0">
          <div className="text-[17px] leading-[22px] tracking-[-0.41px]">
            <span className="font-semibold text-black">{leg.symbol || '—'}</span>{' '}
            {leg.type && (
              <span className={leg.type === 'buy' ? 'text-accent' : 'text-loss'}>
                {leg.type}, {leg.entry}
              </span>
            )}
          </div>
          <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
            {leg.type ? `${formatLots(leg.volume)} at ${formatPrice(leg.price, digits)}` : leg.comment}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {showProfit && (
            <div
              className={`tnum text-[17px] font-semibold leading-[22px] ${
                leg.profit >= 0 ? 'text-accent' : 'text-loss'
              }`}
            >
              {formatMoneyMT5(leg.profit)}
            </div>
          )}
          <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
            {formatFullDateTime(leg.time)}
          </div>
        </div>
      </div>
    </RowShell>
  );
}

/* ------------------------------------------------------------------ */
/* Позиции (aggregated by positionId)                                  */
/* ------------------------------------------------------------------ */

export interface ClosedPosition {
  positionId: number;
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell';
  volume: number;
  openTime: number;
  openPrice: number;
  closeTime: number;
  closePrice: number;
  profit: number;
  swap: number;
  commission: number;
  isEdited: boolean;
}

/** Aggregates same-position deals into closed positions (newest first). */
export function aggregatePositions(deals: Deal[]): ClosedPosition[] {
  const groups = new Map<number, Deal[]>();
  for (const d of deals) {
    const arr = groups.get(d.positionId) ?? [];
    arr.push(d);
    groups.set(d.positionId, arr);
  }
  return [...groups.values()]
    .map((group) => {
      const open = group.reduce((a, b) => (a.openTime <= b.openTime ? a : b));
      const close = group.reduce((a, b) => (a.closeTime >= b.closeTime ? a : b));
      return {
        positionId: open.positionId,
        ticket: close.ticket,
        symbol: open.symbol,
        type: open.type as 'buy' | 'sell',
        volume: group.reduce((s, d) => s + d.volume, 0),
        openTime: open.openTime,
        openPrice: open.openPrice,
        closeTime: close.closeTime,
        closePrice: close.closePrice,
        profit: group.reduce((s, d) => s + d.profit, 0),
        swap: group.reduce((s, d) => s + d.swap, 0),
        commission: group.reduce((s, d) => s + d.commission, 0),
        isEdited: group.some((d) => d.isEdited),
      };
    })
    // Старые сверху, новые снизу — как во вкладке «Сделки» (auto-scroll вниз
    // на входе в Историю), а не наоборот.
    .sort((a, b) => a.closeTime - b.closeTime);
}

interface PositionRowProps {
  position: ClosedPosition;
  digits: number;
  last: boolean;
  staggerDelay: number;
  onTap: () => void;
  onLongPress?: () => void;
  /** Видимая кнопка-карандаш (заявка заказчика: явный вход в редактирование
   * прямо на сайте для admin, не только долгим нажатием). */
  onEdit?: () => void;
}

export function PositionRow({ position, digits, last, staggerDelay, onTap, onLongPress, onEdit }: PositionRowProps) {
  // Только прибыль, без свопа/комиссии — так же, как в «Сделках» (DealRow
  // ниже) и в самом MT5: своп почти всегда 0 для однодневных сделок, поэтому
  // расхождение не было заметно, пока не досинхронизировались позиции,
  // провисевшие открытыми много дней (реальный своп там ненулевой).
  const net = position.profit;
  return (
    <RowShell last={last} staggerDelay={staggerDelay} onTap={onTap} onLongPress={onLongPress}>
      <div className="flex items-start justify-between gap-2 px-2 py-[6px]">
        <div className="min-w-0">
          <div className="text-[17px] leading-[22px] tracking-[-0.41px]">
            <span className="font-semibold text-black">{position.symbol}</span>{' '}
            <TypeText type={position.type} volume={position.volume} />
          </div>
          <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
            {formatPrice(position.openPrice, digits)} → {formatPrice(position.closePrice, digits)}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          <div className="text-right">
            <div
              className={`tnum text-[17px] font-semibold leading-[22px] ${
                net >= 0 ? 'text-accent' : 'text-loss'
              }`}
            >
              {formatMoneyMT5(net)}
            </div>
            <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
              {formatFullDateTime(position.closeTime)}
            </div>
          </div>
          {onEdit && (
            <button
              type="button"
              aria-label="Редактировать сделку"
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="-mt-1 -mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-accent active:bg-fill"
            >
              <Pencil size={14} strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
    </RowShell>
  );
}

/* ------------------------------------------------------------------ */
/* Ордера                                                              */
/* ------------------------------------------------------------------ */

export interface HistoryOrder {
  ticket: number;
  symbol: string;
  type: 'buy' | 'sell' | 'buy limit' | 'sell limit';
  volume: number;
  price: number;
  state: 'filled' | 'canceled';
  time: number;
}

interface OrderRowProps {
  order: HistoryOrder;
  digits: number;
  last: boolean;
  staggerDelay: number;
}

export function OrderRow({ order, digits, last, staggerDelay }: OrderRowProps) {
  const isBuy = order.type.startsWith('buy');
  const filled = order.state === 'filled';
  return (
    <RowShell last={last} staggerDelay={staggerDelay}>
      <div className="flex items-start justify-between gap-2 px-2 py-[6px]">
        <div className="min-w-0">
          <div className="text-[17px] leading-[22px] tracking-[-0.41px]">
            <span className="font-semibold text-black">{order.symbol}</span>{' '}
            <span className={isBuy ? 'text-accent' : 'text-loss'}>
              {order.type} {formatLots(order.volume)}
            </span>
          </div>
          <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
            {formatPrice(order.price, digits)} · #{order.ticket}
          </div>
          <div className="tnum mt-[2px] text-[13px] leading-[18px] text-text-secondary">
            {formatDayTime(order.time)}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium leading-[16px] ${
            filled ? 'bg-[#34C7591A] text-profit' : 'bg-[#8E8E931A] text-text-secondary'
          }`}
        >
          {filled ? 'исполнен' : 'отменён'}
        </span>
      </div>
    </RowShell>
  );
}

/* ------------------------------------------------------------------ */
/* Баланс                                                              */
/* ------------------------------------------------------------------ */

interface BalanceRowProps {
  op: Deal;
  last: boolean;
  staggerDelay: number;
}

export function BalanceRow({ op, last, staggerDelay }: BalanceRowProps) {
  const deposit = op.profit >= 0;
  const Icon = deposit ? ArrowDownLeft : ArrowUpRight;
  return (
    <RowShell last={last} staggerDelay={staggerDelay}>
      <div className="flex items-center gap-3 px-2 py-[6px]">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            deposit ? 'bg-[#34C7591A] text-profit' : 'bg-[#FF3B301A] text-loss'
          }`}
        >
          <Icon size={17} strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold leading-[22px] tracking-[-0.41px]">
            {deposit ? 'Депозит' : 'Снятие'}
          </div>
          <div className="mt-0.5 truncate text-[12px] leading-[15px] text-text-secondary">
            {op.comment || '—'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`tnum text-[16px] font-semibold leading-[20px] ${
              deposit ? 'text-accent' : 'text-loss'
            }`}
          >
            {formatSignedMoneyMT5(op.profit)}
          </div>
          <div className="tnum mt-0.5 text-[11px] leading-[14px] text-text-secondary">
            {formatDate(op.closeTime)} {formatTimeShort(op.closeTime)}
          </div>
        </div>
      </div>
    </RowShell>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function HistoryEmpty({ title }: { title: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-8 pt-20 text-center">
      <Clock size={48} strokeWidth={1} className="text-text-secondary" />
      <p className="mt-2 text-[17px] font-semibold text-text-secondary">{title}</p>
      <p className="text-[13px] text-text-secondary">Измените период или символ</p>
    </div>
  );
}

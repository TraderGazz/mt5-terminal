import { AnimatePresence, motion } from 'framer-motion';
import type { Position } from '@/mocks/positions';
import { formatDateTime, formatMoney, formatPrice, formatSignedMoney, formatVolume } from '@/lib/format';
import FlatRow from '@/components/trade/FlatRow';

export interface LivePositionData {
  position: Position;
  /** Live close price (bid for buy, ask for sell). */
  close: number;
  /** Live floating P/L. */
  profit: number;
  /** Price digits for the symbol. */
  digits: number;
}

interface PositionSheetProps {
  data: LivePositionData | null;
  onClose: () => void;
  /** Admin-only (заявка заказчика): реальное закрытие позиции по рынку —
   * родитель сам показывает подтверждение и шлёт запрос брокеру. */
  onRequestClosePosition?: () => void;
  /** Admin-only: косметическая правка цены открытия/прибыли (витрина). */
  onRequestEditPosition?: () => void;
}

/**
 * Position detail sheet (trade.md): slides up 350ms over a dimmed backdrop,
 * closed by swipe-down / backdrop tap. Scoped to the phone column. Read-only
 * for everyone except admin, у которого внизу появляется «Закрыть позицию».
 */
export default function PositionSheet({
  data,
  onClose,
  onRequestClosePosition,
  onRequestEditPosition,
}: PositionSheetProps) {
  return (
    <AnimatePresence>
      {data && (
        <div className="fixed inset-0 z-[60]">
          <div className="relative mx-auto h-full w-full max-w-[430px]">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-[12px] bg-bg-grouped pb-4"
              style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.6 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 500) onClose();
              }}
            >
              <div className="flex justify-center pb-2 pt-2">
                <span className="h-[5px] w-9 rounded-full bg-[#D1D1D6]" />
              </div>
              <div className="px-4 pb-3 pt-1 text-center">
                <span className="text-[17px] font-semibold tracking-[-0.41px]">
                  {data.position.symbol}
                </span>
                <span
                  className={`ml-2 text-[15px] font-medium ${
                    data.position.type === 'buy' ? 'text-accent' : 'text-loss'
                  }`}
                >
                  {data.position.type} {formatVolume(data.position.volume)}
                </span>
              </div>
              <div>
                <FlatRow label="Тикет" value={String(data.position.id)} />
                <FlatRow label="Символ" value={data.position.symbol} />
                <FlatRow
                  label="Тип"
                  value={data.position.type}
                  valueClassName={data.position.type === 'buy' ? 'text-accent' : 'text-loss'}
                />
                <FlatRow label="Объём" value={formatVolume(data.position.volume)} />
                <FlatRow
                  label="Цена открытия"
                  value={formatPrice(data.position.openPrice, data.digits)}
                />
                <FlatRow label="Текущая цена" value={formatPrice(data.close, data.digits)} />
                <FlatRow label="S / L" value="—" />
                <FlatRow label="T / P" value="—" />
                <FlatRow
                  label="Своп"
                  value={formatMoney(data.position.swap)}
                  valueClassName={data.position.swap < 0 ? 'text-loss' : ''}
                />
                <FlatRow label="Комиссия" value={formatMoney(data.position.commission)} />
                <FlatRow
                  label="Прибыль"
                  value={formatSignedMoney(data.profit)}
                  valueClassName={data.profit >= 0 ? 'text-accent' : 'text-loss'}
                />
                <FlatRow
                  label="Время открытия"
                  value={formatDateTime(data.position.openTime)}
                  last={!onRequestClosePosition && !onRequestEditPosition}
                />
              </div>
              {(onRequestClosePosition || onRequestEditPosition) && (
                <div className="flex gap-2 px-4 pt-3">
                  {onRequestEditPosition && (
                    <button
                      type="button"
                      onClick={onRequestEditPosition}
                      className="h-[44px] flex-1 rounded-[10px] bg-fill text-[16px] font-semibold text-accent active:opacity-85"
                    >
                      Изменить
                    </button>
                  )}
                  {onRequestClosePosition && (
                    <button
                      type="button"
                      onClick={onRequestClosePosition}
                      className="h-[44px] flex-1 rounded-[10px] bg-loss text-[16px] font-semibold text-white active:opacity-85"
                    >
                      Закрыть позицию
                    </button>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

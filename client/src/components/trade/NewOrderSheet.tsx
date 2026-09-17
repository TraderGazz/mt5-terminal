import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { formatPrice } from '@/lib/format';

interface NewOrderSheetProps {
  open: boolean;
  symbol: string;
  digits: number;
  bid: number | undefined;
  ask: number | undefined;
  submitting: boolean;
  onSubmit: (type: 'buy' | 'sell', volume: number) => void;
  onClose: () => void;
}

/**
 * Admin-only «Новый ордер» (заявка заказчика: открывать сделки прямо с
 * сайта). В отличие от остального сайта — это РЕАЛЬНЫЙ рыночный ордер
 * брокеру через MT5-мост, не мок и не запись в БД для витрины.
 */
export default function NewOrderSheet({
  open,
  symbol,
  digits,
  bid,
  ask,
  submitting,
  onSubmit,
  onClose,
}: NewOrderSheetProps) {
  const [volume, setVolume] = useState('0.01');
  const vol = Number(volume.replace(',', '.'));
  const valid = Number.isFinite(vol) && vol > 0;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60]">
          <div className="relative mx-auto h-full w-full max-w-[430px]">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => !submitting && onClose()}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 rounded-t-[12px] bg-bg-grouped pb-4"
              style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="flex justify-center pb-2 pt-2">
                <span className="h-[5px] w-9 rounded-full bg-[#D1D1D6]" />
              </div>
              <div className="px-4 pb-3 pt-1 text-center">
                <span className="text-[17px] font-semibold tracking-[-0.41px]">{symbol}</span>
                {bid != null && ask != null && (
                  <p className="tnum mt-0.5 text-[13px] text-text-secondary">
                    Bid {formatPrice(bid, digits)} · Ask {formatPrice(ask, digits)}
                  </p>
                )}
              </div>

              <div className="mx-4 rounded-[10px] bg-white px-4 py-3">
                <label className="flex items-center justify-between gap-3">
                  <span className="text-[15px] text-black">Объём (лоты)</span>
                  <input
                    inputMode="decimal"
                    value={volume}
                    onChange={(e) => setVolume(e.target.value)}
                    disabled={submitting}
                    className="tnum w-24 rounded-[8px] bg-fill px-2 py-1.5 text-right text-[15px] text-black outline-none"
                  />
                </label>
              </div>

              <p className="mx-6 mt-3 text-center text-[12px] leading-[16px] text-loss">
                Это реальная рыночная заявка брокеру, не тестовая запись.
                Отменить нельзя — только закрыть обратно с новым рыночным риском.
              </p>

              <div className="mx-4 mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={!valid || submitting}
                  onClick={() => onSubmit('sell', vol)}
                  className="h-[50px] flex-1 rounded-[12px] bg-loss text-[17px] font-semibold text-white disabled:opacity-40"
                >
                  Sell
                </button>
                <button
                  type="button"
                  disabled={!valid || submitting}
                  onClick={() => onSubmit('buy', vol)}
                  className="h-[50px] flex-1 rounded-[12px] bg-accent text-[17px] font-semibold text-white disabled:opacity-40"
                >
                  Buy
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="mx-4 mt-3 block h-[44px] w-[calc(100%-2rem)] rounded-[12px] bg-white text-[17px] font-semibold text-accent active:bg-[#F2F2F7] disabled:opacity-40"
              >
                Отмена
              </button>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

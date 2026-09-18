import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface EditPositionSheetProps {
  open: boolean;
  ticket: number;
  symbol: string;
  openPrice: number;
  profit: number;
  saving: boolean;
  onSave: (openPrice: number, profit: number) => void;
  onReset: () => void;
  onClose: () => void;
}

/**
 * Admin-only «Изменить позицию» (заявка заказчика: цена открытия и
 * прибыль/убыток открытой позиции — витрина, реальный ордер брокеру не
 * уходит, в отличие от «Новый ордер»/«Закрыть позицию»).
 */
export default function EditPositionSheet({
  open,
  ticket,
  symbol,
  openPrice,
  profit,
  saving,
  onSave,
  onReset,
  onClose,
}: EditPositionSheetProps) {
  const [openPriceStr, setOpenPriceStr] = useState(String(openPrice));
  const [profitStr, setProfitStr] = useState(String(profit));

  // Пере-заполнить поля при каждом новом открытии шита (другая позиция или
  // повторное открытие той же после обновления данных).
  useEffect(() => {
    if (open) {
      setOpenPriceStr(String(openPrice));
      setProfitStr(String(profit));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket]);

  const op = Number(openPriceStr.replace(',', '.'));
  const pf = Number(profitStr.replace(',', '.'));
  const valid = Number.isFinite(op) && Number.isFinite(pf);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <div className="relative mx-auto h-full w-full max-w-[430px]">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => !saving && onClose()}
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
                <span className="text-[17px] font-semibold tracking-[-0.41px]">
                  {symbol} · #{ticket}
                </span>
              </div>

              <div className="mx-4 flex flex-col gap-2 rounded-[10px] bg-white px-4 py-2">
                <label className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[15px] text-black">Цена открытия</span>
                  <input
                    inputMode="decimal"
                    value={openPriceStr}
                    onChange={(e) => setOpenPriceStr(e.target.value)}
                    disabled={saving}
                    className="tnum w-28 rounded-[8px] bg-fill px-2 py-1.5 text-right text-[15px] text-black outline-none"
                  />
                </label>
                <div className="h-px bg-separator" />
                <label className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[15px] text-black">Прибыль / убыток</span>
                  <input
                    inputMode="decimal"
                    value={profitStr}
                    onChange={(e) => setProfitStr(e.target.value)}
                    disabled={saving}
                    className="tnum w-28 rounded-[8px] bg-fill px-2 py-1.5 text-right text-[15px] text-black outline-none"
                  />
                </label>
              </div>

              <p className="mx-6 mt-3 text-center text-[12px] leading-[16px] text-text-secondary">
                Это витрина (что видят сайт и админка) — реальная позиция у
                брокера не меняется. Прибыль дальше продолжит двигаться
                вместе с рынком от заданного здесь значения.
              </p>

              <div className="mx-4 mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!valid || saving}
                  onClick={() => onSave(op, pf)}
                  className="h-[50px] w-full rounded-[12px] bg-accent text-[17px] font-semibold text-white disabled:opacity-40"
                >
                  {saving ? 'Сохраняю…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={onReset}
                  className="h-[44px] w-full rounded-[12px] bg-white text-[16px] font-semibold text-text-secondary active:bg-[#F2F2F7] disabled:opacity-40"
                >
                  Сбросить к реальным
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="h-[44px] w-full rounded-[12px] bg-white text-[17px] font-semibold text-accent active:bg-[#F2F2F7] disabled:opacity-40"
                >
                  Отмена
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

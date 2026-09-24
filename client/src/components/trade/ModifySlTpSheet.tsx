import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

interface ModifySlTpSheetProps {
  open: boolean;
  ticket: number;
  symbol: string;
  stopLoss: number;
  takeProfit: number;
  saving: boolean;
  onSave: (stopLoss?: number, takeProfit?: number) => void;
  onClose: () => void;
}

/**
 * «Изменить» позицию — как в оригинальном MT5: настоящий стоп-лосс/тейк-
 * профит через реальный ордер брокеру (CTrade.PositionModify). Доступно
 * только admin. Не путать с EditPositionSheet — там витрина (цена/прибыль
 * "как будто", только admin, без реального ордера).
 */
export default function ModifySlTpSheet({
  open,
  ticket,
  symbol,
  stopLoss,
  takeProfit,
  saving,
  onSave,
  onClose,
}: ModifySlTpSheetProps) {
  const [slStr, setSlStr] = useState(stopLoss > 0 ? String(stopLoss) : '');
  const [tpStr, setTpStr] = useState(takeProfit > 0 ? String(takeProfit) : '');

  useEffect(() => {
    if (open) {
      setSlStr(stopLoss > 0 ? String(stopLoss) : '');
      setTpStr(takeProfit > 0 ? String(takeProfit) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket]);

  const parseLevel = (s: string): number | undefined => {
    if (!s.trim()) return undefined;
    const n = Number(s.replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const sl = parseLevel(slStr);
  const tp = parseLevel(tpStr);
  // Хотя бы одно поле изменилось относительно текущих значений позиции —
  // иначе нечего сохранять (сервер и так требует sl и/или tp).
  const changed = slStr !== (stopLoss > 0 ? String(stopLoss) : '') || tpStr !== (takeProfit > 0 ? String(takeProfit) : '');
  const valid = changed && (slStr.trim() === '' || sl != null) && (tpStr.trim() === '' || tp != null);

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
                  <span className="text-[15px] text-black">Stop Loss</span>
                  <input
                    inputMode="decimal"
                    placeholder="—"
                    value={slStr}
                    onChange={(e) => setSlStr(e.target.value)}
                    disabled={saving}
                    className="tnum w-28 rounded-[8px] bg-fill px-2 py-1.5 text-right text-[15px] text-black outline-none placeholder:text-text-secondary"
                  />
                </label>
                <div className="h-px bg-separator" />
                <label className="flex items-center justify-between gap-3 py-2">
                  <span className="text-[15px] text-black">Take Profit</span>
                  <input
                    inputMode="decimal"
                    placeholder="—"
                    value={tpStr}
                    onChange={(e) => setTpStr(e.target.value)}
                    disabled={saving}
                    className="tnum w-28 rounded-[8px] bg-fill px-2 py-1.5 text-right text-[15px] text-black outline-none placeholder:text-text-secondary"
                  />
                </label>
              </div>

              <p className="mx-6 mt-3 text-center text-[12px] leading-[16px] text-loss">
                Это настоящая правка позиции у брокера, не витрина.
              </p>

              <div className="mx-4 mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  disabled={!valid || saving}
                  onClick={() => onSave(sl, tp)}
                  className="h-[50px] w-full rounded-[12px] bg-accent text-[17px] font-semibold text-white disabled:opacity-40"
                >
                  {saving ? 'Сохраняю…' : 'Сохранить'}
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

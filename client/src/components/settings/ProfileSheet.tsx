import { AnimatePresence, motion } from 'framer-motion';
import { ACCOUNT } from '@/mocks/account';

interface ProfileSheetProps {
  open: boolean;
  onClose: () => void;
}

/** Read-only profile detail rows (settings.md §1). */
const ROWS: Array<{ label: string; value: string }> = [
  { label: 'ФИО', value: ACCOUNT.holder },
  { label: 'Компания', value: ACCOUNT.company },
  { label: 'Счёт', value: String(ACCOUNT.accountId) },
  { label: 'Сервер', value: ACCOUNT.server },
  { label: 'Валюта счёта', value: ACCOUNT.currency },
  { label: 'Плечо', value: '1:100' },
  { label: 'Подключено', value: '12.05.2025' },
];

/**
 * Profile detail bottom sheet (settings.md §1): slides up 350ms over a fading
 * backdrop; read-only grouped rows; closes on «Готово» / backdrop tap.
 * Scoped to the phone column.
 */
export default function ProfileSheet({ open, onClose }: ProfileSheetProps) {
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
              onClick={onClose}
            />
            <motion.div
              role="dialog"
              aria-label="Профиль"
              className="absolute inset-x-0 bottom-0 flex max-h-[85%] flex-col rounded-t-[12px] bg-bg-secondary"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="relative flex h-11 shrink-0 items-center justify-center">
                <span className="text-[17px] font-semibold tracking-[-0.41px] text-black">
                  Профиль
                </span>
                <button
                  type="button"
                  onClick={onClose}
                  className="absolute right-4 text-[17px] tracking-[-0.41px] text-accent active:opacity-50"
                >
                  Готово
                </button>
              </div>
              <div
                className="overflow-y-auto pb-4"
                style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
              >
                <div className="mx-4 overflow-hidden rounded-[10px] bg-bg">
                  {ROWS.map((row, i) => (
                    <div key={row.label}>
                      <div className="flex min-h-11 items-center justify-between gap-4 px-4 py-2">
                        <span className="shrink-0 text-[15px] tracking-[-0.24px] text-black">
                          {row.label}
                        </span>
                        <span className="tnum min-w-0 truncate text-right text-[15px] tracking-[-0.24px] text-text-secondary">
                          {row.value}
                        </span>
                      </div>
                      {i < ROWS.length - 1 && (
                        <div className="ml-4 border-t-[0.5px] border-separator" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

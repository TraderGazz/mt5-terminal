import { AnimatePresence, motion } from 'framer-motion';
import type { SettingsRowDef } from './SettingsRow';

interface StubModalProps {
  /** The tapped stub row, or null when closed. */
  row: SettingsRowDef | null;
  onClose: () => void;
}

/**
 * «Режим просмотра» stub modal (settings.md §4): centered iOS-alert card,
 * scale 0.9→1 + opacity spring 250ms, closes on OK / backdrop tap.
 * Scoped to the phone column.
 */
export default function StubModal({ row, onClose }: StubModalProps) {
  return (
    <AnimatePresence>
      {row && (
        <div className="fixed inset-0 z-[60]">
          <div className="relative mx-auto flex h-full w-full max-w-[430px] items-center justify-center px-12">
            <motion.div
              className="absolute inset-0 bg-black/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.25 }}
              onClick={onClose}
            />
            <motion.div
              role="alertdialog"
              aria-label={row.label}
              className="relative w-full max-w-[270px] overflow-hidden rounded-[14px] bg-white/95 backdrop-blur-xl"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.2 } }}
              transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            >
              <div className="flex flex-col items-center px-4 pb-3 pt-5 text-center">
                <row.icon size={54} />
                <p className="mt-3 text-[17px] font-semibold leading-[22px] tracking-[-0.41px] text-black">
                  {row.label}
                </p>
                <p className="mt-1 text-[13px] leading-[16px] tracking-[-0.08px] text-text-secondary">
                  Режим просмотра
                </p>
              </div>
              <div className="border-t-[0.5px] border-separator">
                <button
                  type="button"
                  onClick={onClose}
                  className="block h-11 w-full text-[17px] font-semibold tracking-[-0.41px] text-accent active:bg-[#D9D9DE]"
                >
                  OK
                </button>
              </div>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

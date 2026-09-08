import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface ActionSheetAction {
  label: string;
  destructive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

interface ActionSheetProps {
  open: boolean;
  /** Optional gray 13px header line(s). */
  title?: ReactNode;
  actions: ActionSheetAction[];
  cancelLabel?: string;
  onClose: () => void;
}

/**
 * iOS-style action sheet (design.md §7): rounded 12px grouped buttons floating
 * 8px above the safe-area bottom over a rgba(0,0,0,0.4) backdrop; «Отмена» is
 * a separate bold button below. Scoped to the phone column.
 */
export default function ActionSheet({
  open,
  title,
  actions,
  cancelLabel = 'Отмена',
  onClose,
}: ActionSheetProps) {
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
              className="absolute inset-x-2 bottom-0"
              style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            >
              <div className="overflow-hidden rounded-[12px] bg-white/95 backdrop-blur-xl">
                {title != null && (
                  <div className="border-b border-separator px-4 py-3 text-center text-[13px] leading-[16px] text-text-secondary">
                    {title}
                  </div>
                )}
                {actions.map((action, i) => (
                  <button
                    key={`${action.label}-${i}`}
                    type="button"
                    disabled={action.disabled}
                    onClick={() => {
                      onClose();
                      action.onSelect?.();
                    }}
                    className={`block w-full text-[17px] leading-[44px] tracking-[-0.41px] active:bg-[#D9D9DE] ${
                      i > 0 || title != null ? 'border-t border-separator' : ''
                    } ${action.destructive ? 'text-loss' : 'text-accent'} ${
                      action.disabled ? 'opacity-40' : ''
                    }`}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="mt-2 block w-full rounded-[12px] bg-white/95 text-[17px] font-semibold leading-[44px] tracking-[-0.41px] text-accent backdrop-blur-xl active:bg-[#D9D9DE]"
              >
                {cancelLabel}
              </button>
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  );
}

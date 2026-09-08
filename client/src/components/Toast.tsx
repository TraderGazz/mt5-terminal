import { AnimatePresence, motion } from 'framer-motion';
import { useEffect } from 'react';

interface ToastProps {
  /** Message to show; pass null/empty to hide. */
  message: string | null;
  onClose: () => void;
  /** Auto-dismiss delay (design.md §6: 2.5s). */
  duration?: number;
}

/**
 * Top-centered dark pill under the NavBar (design.md §7): slides down 16px in,
 * auto-dismisses, slides up out. Scoped to the phone column.
 */
export default function Toast({ message, onClose, duration = 2500 }: ToastProps) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onClose, duration);
    return () => clearTimeout(id);
  }, [message, duration, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <div className="pointer-events-none fixed inset-x-0 top-[92px] z-[70] flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="mx-auto max-w-[398px] rounded-[20px] bg-black/85 px-4 py-2 text-center text-[13px] leading-[18px] text-white"
          >
            {message}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

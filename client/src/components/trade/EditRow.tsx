import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface EditRowProps {
  label: string;
  /** Inline validation hint (11px, loss color) shown under the row. */
  error?: string | null;
  focused?: boolean;
  children: ReactNode;
  last?: boolean;
}

/**
 * Editable form row (trade-edit.md): 44px+, label 15px left (accent when
 * focused, loss when invalid), right-aligned input, inset hairline, 2px
 * accent underline animating in on focus, shake on invalid submit.
 */
export default function EditRow({ label, error, focused, children, last = false }: EditRowProps) {
  const labelClass = error ? 'text-loss' : focused ? 'text-accent' : 'text-text-secondary';
  return (
    <motion.div
      animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.3 }}
      className="relative"
    >
      <div className="flex min-h-11 items-center gap-3 px-4">
        <span className={`w-[110px] shrink-0 text-[15px] leading-[20px] transition-colors ${labelClass}`}>
          {label}
        </span>
        <div className="relative min-w-0 flex-1">{children}</div>
      </div>
      {error && (
        <div className="px-4 pb-2 text-right text-[11px] leading-[14px] text-loss">{error}</div>
      )}
      {/* Focus underline: 2px accent, width 0 → 100% over 200ms */}
      <span
        aria-hidden
        className="pointer-events-none absolute bottom-0 left-4 right-0 h-[2px] origin-left bg-accent transition-transform duration-200"
        style={{ transform: focused && !error ? 'scaleX(1)' : 'scaleX(0)' }}
      />
      {!last && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-4 right-0 bg-separator"
          style={{ height: '0.5px' }}
        />
      )}
    </motion.div>
  );
}

/** Shared classes for right-aligned numeric / text inputs inside EditRow. */
export const EDIT_INPUT_CLASS =
  'tnum w-full bg-transparent py-2 text-right text-[15px] leading-[20px] text-black outline-none placeholder:text-text-secondary';

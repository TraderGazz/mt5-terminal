/**
 * Shared admin-panel primitives (design.md admin.md): iOS toggle, pills,
 * segmented control, modal, cards, brand glyph. Local to the admin area.
 */
import { AnimatePresence, motion } from 'framer-motion';
import type { InputHTMLAttributes, ReactNode } from 'react';

const IOS_EASE = [0.32, 0.72, 0, 1] as [number, number, number, number];

/** Generic trademark-safe brand glyph (blue squircle + white candles). */
export function BrandGlyph({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden
      className="shrink-0"
    >
      <rect width="48" height="48" rx="11" fill="#007AFF" />
      <rect x="11" y="20" width="5" height="14" rx="1.4" fill="#fff" />
      <rect x="12.9" y="15" width="1.2" height="24" rx="0.6" fill="#fff" />
      <rect x="21.5" y="13" width="5" height="16" rx="1.4" fill="#fff" />
      <rect x="23.4" y="9" width="1.2" height="26" rx="0.6" fill="#fff" />
      <rect x="32" y="18" width="5" height="12" rx="1.4" fill="#fff" />
      <rect x="33.9" y="13" width="1.2" height="22" rx="0.6" fill="#fff" />
    </svg>
  );
}

/** iOS switch (design.md §7): 51×31, off #E9E9EA / on #34C759. */
export function IosToggle({
  checked,
  onChange,
  disabled = false,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-[250ms] ${
        checked ? 'bg-profit' : 'bg-[#E9E9EA]'
      } ${disabled ? 'opacity-40' : ''}`}
      style={{ transitionTimingFunction: 'cubic-bezier(0.25,0.1,0.25,1)' }}
    >
      <motion.span
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className="absolute left-[2px] top-[2px] block h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.1)]"
      />
    </button>
  );
}

/** Colored status/role pill. */
export function Pill({
  tone,
  children,
}: {
  tone: 'blue' | 'green' | 'red' | 'gray' | 'orange';
  children: ReactNode;
}) {
  const cls = {
    blue: 'bg-[rgba(0,122,255,0.10)] text-accent',
    green: 'bg-[rgba(52,199,89,0.12)] text-[#1F9D41]',
    red: 'bg-[rgba(255,59,48,0.10)] text-loss',
    gray: 'bg-[rgba(118,118,128,0.12)] text-[#636366]',
    orange: 'bg-[rgba(255,149,0,0.12)] text-[#C93400]',
  }[tone];
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-[3px] text-[12px] font-medium leading-[14px] ${cls}`}
    >
      {children}
    </span>
  );
}

/** iOS segmented control (design.md §7). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex h-8 rounded-lg bg-[#E9E9EB] p-[2px] ${className}`}
      role="tablist"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={`relative flex-1 whitespace-nowrap rounded-md px-3 text-[13px] font-medium transition-colors ${
              active ? 'text-black' : 'text-[#636366]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={undefined}
                className="absolute inset-0 rounded-md bg-white shadow-[0_3px_8px_rgba(0,0,0,0.12)]"
                transition={{ duration: 0.25, ease: IOS_EASE }}
              />
            )}
            <span className="relative z-10">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** White card container used across admin sections. */
export function AdminCard({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[10px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] ${className}`}
    >
      {title && (
        <h2 className="border-b border-separator px-5 py-4 text-[17px] font-semibold text-black">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Centered modal: scale 0.95→1 + fade, 250ms spring (admin.md). */
export function AdminModal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 400,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidth?: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            style={{ maxWidth }}
            className="relative w-full overflow-hidden rounded-[12px] bg-white shadow-[0_16px_48px_rgba(0,0,0,0.18)]"
          >
            <div className="border-b border-separator px-5 py-4">
              <h3 className="text-[17px] font-semibold text-black">{title}</h3>
            </div>
            <div className="max-h-[70dvh] overflow-y-auto px-5 py-4">
              {children}
            </div>
            {footer && (
              <div className="flex justify-end gap-2 border-t border-separator px-5 py-3">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/** Primary / secondary buttons (design.md §7, adapted for desktop forms). */
export function AdminButton({
  variant = 'primary',
  children,
  onClick,
  disabled = false,
  type = 'button',
  className = '',
}: {
  variant?: 'primary' | 'secondary' | 'destructive' | 'text';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const base =
    'inline-flex h-[38px] items-center justify-center gap-2 whitespace-nowrap rounded-[10px] px-4 text-[15px] font-semibold transition active:scale-[0.97] active:opacity-85 disabled:pointer-events-none disabled:opacity-40';
  const cls = {
    primary: 'bg-accent text-white',
    secondary: 'bg-[rgba(118,118,128,0.12)] text-accent',
    destructive: 'bg-loss text-white',
    text: 'bg-transparent text-accent',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${cls} ${className}`}
    >
      {children}
    </button>
  );
}

/** iOS-styled text/number input used in admin forms. */
export function AdminInput({
  label,
  suffix,
  ...rest
}: {
  label: string;
  suffix?: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-[13px] text-text-secondary">{label}</span>
      <span className="flex items-center rounded-[10px] bg-fill px-3 focus-within:ring-2 focus-within:ring-accent/40">
        <input
          {...rest}
          className="tnum h-10 w-full bg-transparent text-[15px] text-black outline-none placeholder:text-text-secondary"
        />
        {suffix && (
          <span className="pl-2 text-[15px] text-text-secondary">{suffix}</span>
        )}
      </span>
    </label>
  );
}

export const ADMIN_IOS_EASE = IOS_EASE;

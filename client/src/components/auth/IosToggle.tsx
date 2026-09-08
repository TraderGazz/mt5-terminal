import { motion } from 'framer-motion';

interface IosToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}

/**
 * iOS switch (design.md §7): 51×31px, off #E9E9EA / on #34C759, 27px white
 * knob with shadow, spring transition ~250ms.
 */
export default function IosToggle({ checked, onChange, label }: IosToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 ${
        checked ? 'bg-[#34C759]' : 'bg-[#E9E9EA]'
      }`}
    >
      <motion.span
        className="absolute left-[2px] top-[2px] h-[27px] w-[27px] rounded-full bg-white"
        style={{ boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)' }}
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
      />
    </button>
  );
}

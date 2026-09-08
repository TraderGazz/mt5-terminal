import { motion } from 'framer-motion';

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Unique framer-motion layoutId for the sliding thumb. */
  layoutId: string;
}

/**
 * Floating MT5 iOS pill segmented control: translucent gray pill track
 * (backdrop-blurred) with a white thumb + soft shadow sliding between
 * segments (250ms iOS ease), 15px/500 labels, inactive labels gray.
 */
export default function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex h-10 rounded-full bg-[rgba(120,120,128,0.14)] p-[3px] backdrop-blur-xl backdrop-saturate-[180%]">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="relative min-w-0 flex-1 rounded-full"
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.14)]"
                transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              />
            )}
            <span
              className={`relative z-10 block truncate px-1 text-[15px] font-medium leading-none tracking-[-0.24px] ${
                active ? 'text-black' : 'text-[#8E8E93]'
              }`}
            >
              {opt.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

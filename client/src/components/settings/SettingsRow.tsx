import { ChevronRight } from 'lucide-react';
import type { SettingsIcon } from './icons';

export interface SettingsRowDef {
  key: string;
  label: string;
  /** MT5-style colored icon square (self-contained SVG, any size). */
  icon: SettingsIcon;
  /** Gray 13px line under the label (mail subject, news headline, …). */
  subtext?: string;
}

interface SettingsRowProps extends SettingsRowDef {
  /** Hide the bottom hairline on the last row of a group. */
  last?: boolean;
  onClick?: () => void;
}

/**
 * iOS grouped-list settings row (MT5 iOS): 31px icon square, 17px label with
 * an optional gray 13px subtext, #C7C7CC chevron. Row height 50px, or 56px
 * with subtext. The hairline is inset from the label's left edge (66px) and
 * stops 20px short of the card's right edge, exactly like MT5. Pressed state
 * #D9D9DE.
 */
export default function SettingsRow({
  label,
  icon: Icon,
  subtext,
  last,
  onClick,
}: SettingsRowProps) {
  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-[15px] px-5 text-left transition-colors duration-150 active:bg-[#D9D9DE] ${
          subtext != null ? 'min-h-[56px] py-[7px]' : 'h-[50px]'
        }`}
      >
        <span className="shrink-0">
          <Icon size={31} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[17px] leading-[22px] tracking-[-0.41px] text-black">
            {label}
          </span>
          {subtext != null && (
            <span className="block truncate text-[13px] leading-[16px] tracking-[-0.08px] text-text-secondary">
              {subtext}
            </span>
          )}
        </span>
        <ChevronRight size={15} strokeWidth={2.2} className="shrink-0 text-[#C7C7CC]" />
      </button>
      {!last && <div className="ml-[66px] mr-5 border-t-[0.5px] border-separator" />}
    </div>
  );
}

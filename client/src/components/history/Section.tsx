import type { ReactNode } from 'react';

/** 13px uppercase secondary section header (design.md §7 SectionHeader). */
export function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pb-1.5 pt-5 text-[13px] uppercase leading-[16px] tracking-[-0.08px] text-text-secondary">
      {children}
    </div>
  );
}

/** iOS grouped-list white card: rounded 14px, 16px horizontal margins. */
export function GroupCard({ children }: { children: ReactNode }) {
  return <div className="mx-4 overflow-hidden rounded-[14px] bg-white">{children}</div>;
}

/** Hairline separator, inset 16px from the left (iOS grouped list, #C6C6C8). */
export function RowSeparator() {
  return <div className="ml-4 h-px bg-[#C6C6C8]" />;
}

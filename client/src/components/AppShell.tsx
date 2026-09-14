import type { ReactNode } from 'react';

/**
 * Phone-column shell (design.md §7): max-width 430px centered on desktop over
 * a neutral backdrop with subtle side borders. Full-bleed on real phones.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-[#00000014]">
      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-bg-grouped sm:border-x sm:border-[#0000001f]">
        {children}
      </div>
    </div>
  );
}

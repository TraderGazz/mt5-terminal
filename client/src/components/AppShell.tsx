import { useEffect, useState, type ReactNode } from 'react';
import { formatTimeShort } from '@/lib/format';

/**
 * Decorative iOS status bar (design.md §7). Only rendered in browser mode —
 * hidden via the `.browser-only` class when running installed (display-mode:
 * standalone), where the real iOS status bar takes over.
 */
export function StatusBar() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 15_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className="browser-only flex select-none items-center justify-between px-7 pb-1 text-[15px] font-semibold text-black"
      style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}
    >
      <span className="tnum w-14">{formatTimeShort(now)}</span>
      <span className="flex items-center gap-1.5 text-black">
        {/* signal */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor" aria-hidden>
          <rect x="0" y="7.5" width="3" height="4" rx="0.8" />
          <rect x="4.5" y="5" width="3" height="6.5" rx="0.8" />
          <rect x="9" y="2.5" width="3" height="9" rx="0.8" />
          <rect x="13.5" y="0" width="3" height="11.5" rx="0.8" />
        </svg>
        {/* wifi */}
        <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" aria-hidden>
          <path d="M8.5 12 5.2 8.4a4.7 4.7 0 0 1 6.6 0L8.5 12Z" />
          <path d="M3 6.2a7.9 7.9 0 0 1 11 0l-1.6 1.7a5.6 5.6 0 0 0-7.8 0L3 6.2Z" />
          <path d="M0.8 4a11.1 11.1 0 0 1 15.4 0l-1.6 1.7a8.8 8.8 0 0 0-12.2 0L0.8 4Z" />
        </svg>
        {/* battery */}
        <svg width="25" height="12" viewBox="0 0 25 12" fill="none" aria-hidden>
          <rect x="0.5" y="0.5" width="20" height="11" rx="3" stroke="currentColor" opacity="0.4" />
          <rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor" />
          <path d="M23 4v4c1-.2 1.6-1 1.6-2S24 4.2 23 4Z" fill="currentColor" opacity="0.4" />
        </svg>
      </span>
    </div>
  );
}

/**
 * Phone-column shell (design.md §7): max-width 430px centered on desktop over
 * a neutral backdrop with subtle side borders. Full-bleed on real phones.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] w-full bg-[#00000014]">
      <div className="relative mx-auto flex h-[100dvh] w-full max-w-[430px] flex-col bg-bg-grouped sm:border-x sm:border-[#0000001f]">
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

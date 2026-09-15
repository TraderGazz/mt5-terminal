/**
 * Full-page centered spinner (same visual language as the pull-to-refresh
 * spinner) — shown instead of a page's real content while its first API
 * response hasn't arrived yet, so a real account's numbers never flash
 * mock/empty data before the live data replaces them.
 */
export default function PageLoading() {
  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-white">
      <svg
        className="h-7 w-7 animate-spin text-text-secondary"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

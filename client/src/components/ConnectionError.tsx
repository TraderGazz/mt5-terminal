import { WifiOff } from 'lucide-react';

/**
 * Full-page "нет соединения с сервером" state — shown INSTEAD of the mock
 * snapshot when the backend is unreachable (e.g. server paused/down), so a
 * real account never silently displays fake mock numbers as if they were
 * real (confirmed incident: customer paused the server, investor briefly
 * saw mock positions/balance with no indication they weren't real).
 */
export default function ConnectionError() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center gap-2 bg-white px-8 text-center">
      <WifiOff size={40} strokeWidth={1.5} className="text-text-secondary" />
      <p className="mt-2 text-[17px] font-semibold text-text-secondary">Нет соединения с сервером</p>
      <p className="text-[13px] text-text-secondary">Попробуйте обновить страницу через некоторое время</p>
    </div>
  );
}

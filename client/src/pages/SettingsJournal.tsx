import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';
import { useJournal, clearJournal } from '@/data/journal';
import { formatDateTime } from '@/lib/format';

/**
 * «Настройки → Журнал» (заявка заказчика: раньше была заглушка «Режим
 * просмотра»). Реальный локальный журнал действий этого устройства — вход,
 * сделки, правка SL/TP (см. data/journal.ts, logEvent()).
 */
export default function SettingsJournalPage() {
  const navigate = useNavigate();
  const entries = useJournal();
  const sorted = [...entries].reverse(); // новые сверху

  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar
        title="Журнал"
        solid
        left={<BackButton onClick={() => navigate(-1)} />}
        right={
          sorted.length > 0 ? (
            <button type="button" onClick={clearJournal} className="text-[15px] text-accent">
              Очистить
            </button>
          ) : undefined
        }
      />
      <div className="mx-4 mt-4 overflow-hidden rounded-[14px] bg-white">
        {sorted.length === 0 && (
          <p className="px-4 py-6 text-center text-[13px] text-text-secondary">
            Журнал пуст — здесь появятся вход в систему, сделки и изменения позиций.
          </p>
        )}
        {sorted.map((entry, i) => (
          <div
            key={`${entry.time}-${i}`}
            className={`flex items-start justify-between gap-3 px-4 py-2.5 ${i > 0 ? 'border-t-[0.5px] border-separator' : ''}`}
          >
            <span className="text-[14px] leading-[18px] text-black">{entry.message}</span>
            <span className="shrink-0 text-[12px] text-text-secondary">{formatDateTime(entry.time)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

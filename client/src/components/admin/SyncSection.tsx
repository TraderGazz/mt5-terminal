/**
 * Admin → Настройки автообмена (admin.md §10.5): master toggle, direction,
 * interval, data checklist, sync log, manual sync.
 */
import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { SYNC_LOG, SYNC_SETTINGS } from '@/mocks';
import { formatDateTime } from '@/lib/format';
import { AdminButton, AdminCard, IosToggle, Pill, SegmentedControl } from './bits';

const DATA_ITEMS = [
  'Баланс',
  'Средства',
  'Маржа',
  'Свободная маржа',
  'Уровень маржи',
  'Открытые позиции',
  'История сделок',
];

export default function SyncSection({
  showToast,
}: {
  showToast: (msg: string) => void;
}) {
  const [enabled, setEnabled] = useState(SYNC_SETTINGS.autoSync);
  const [direction, setDirection] = useState<'to-alfa' | 'both'>('to-alfa');
  const [intervalMin, setIntervalMin] = useState(SYNC_SETTINGS.intervalMin);
  const [items, setItems] = useState<Record<string, boolean>>(
    Object.fromEntries(DATA_ITEMS.map((d) => [d, true])),
  );
  const [syncing, setSyncing] = useState(false);

  const runSync = () => {
    if (syncing) return;
    setSyncing(true);
    setTimeout(() => {
      setSyncing(false);
      showToast('Обмен выполнен: 3 позиции, 18 сделок');
    }, 1000);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
        Настройки автообмена
      </h1>

      {/* Master toggle */}
      <AdminCard>
        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[17px] font-semibold text-black">Автообмен включён</p>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              Синхронизация терминала с сайтом АльфаФорекс
            </p>
          </div>
          <IosToggle checked={enabled} onChange={setEnabled} label="Автообмен включён" />
        </div>
      </AdminCard>

      <motion.div
        animate={{ opacity: enabled ? 1 : 0.4 }}
        transition={{ duration: 0.25 }}
        className={`flex flex-col gap-4 ${enabled ? '' : 'pointer-events-none'}`}
        aria-hidden={!enabled}
      >
        {/* Direction */}
        <AdminCard title="Направление обмена">
          <div className="flex flex-col gap-3 p-5">
            <SegmentedControl<'to-alfa' | 'both'>
              value={direction}
              onChange={setDirection}
              options={[
                { value: 'to-alfa', label: 'Русинвест → АльфаФорекс' },
                { value: 'both', label: 'Двусторонний' },
              ]}
            />
            <p className="text-[12px] leading-[16px] text-loss">
              Изменения в админке Русинвест не уходят в АльфаФорекс (ограничение ТЗ)
            </p>
          </div>
        </AdminCard>

        {/* Interval */}
        <AdminCard title="Интервал">
          <div className="divide-y divide-separator/70 px-5">
            {[1, 5, 15].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setIntervalMin(m)}
                className="flex w-full items-center justify-between py-3 text-left"
              >
                <span className="text-[15px] text-black">{m} мин</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                    intervalMin === m ? 'border-accent bg-accent' : 'border-separator'
                  }`}
                >
                  {intervalMin === m && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                      <path d="M1.5 5.2 4 7.5 8.5 2.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
              </button>
            ))}
          </div>
        </AdminCard>

        {/* Data checklist */}
        <AdminCard title="Данные для синхронизации">
          <div className="divide-y divide-separator/70 px-5">
            {DATA_ITEMS.map((d) => (
              <div key={d} className="flex items-center justify-between py-2.5">
                <span className="text-[15px] text-black">{d}</span>
                <IosToggle
                  checked={items[d] ?? true}
                  onChange={(v) => setItems((prev) => ({ ...prev, [d]: v }))}
                  label={d}
                />
              </div>
            ))}
          </div>
        </AdminCard>

        {/* Sync log */}
        <AdminCard title="Журнал обмена">
          <div className="divide-y divide-separator/70 px-5">
            {SYNC_LOG.slice(0, 5).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-black">
                    <span className="tnum mr-2 text-text-secondary">{formatDateTime(e.time)}</span>
                    {e.direction === 'in' ? '→ в терминал' : '→ АльфаФорекс'}
                  </p>
                  <p className="truncate text-[12px] text-text-secondary">
                    {e.message} · записей: {e.records}
                  </p>
                </div>
                <Pill tone={e.status === 'ok' ? 'green' : 'red'}>
                  {e.status === 'ok' ? 'успешно' : 'ошибка'}
                </Pill>
              </div>
            ))}
          </div>
        </AdminCard>

        <AdminButton variant="secondary" onClick={runSync} disabled={syncing} className="self-start">
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Выполняется обмен…' : 'Выполнить обмен сейчас'}
        </AdminButton>
      </motion.div>
    </div>
  );
}

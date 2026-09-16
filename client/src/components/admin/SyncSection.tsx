/**
 * Admin → Настройки автообмена (admin.md §10.5): master toggle, direction,
 * sync log.
 *
 * В режиме api читает/пишет реальные server/routes/admin.js
 * /sync-settings + /sync-log (интервал и чек-лист данных из старого мока
 * убраны — их нет в реальной схеме sync_settings). В mock-режиме — прежнее
 * локальное состояние для демо.
 */
import { useEffect, useState } from 'react';
import { SYNC_LOG, SYNC_SETTINGS } from '@/mocks';
import { formatDateTime } from '@/lib/format';
import { IS_API } from '@/config';
import { getSyncSettings, updateSyncSettings, getSyncLog, type ApiSyncLogEntry } from '@/api/admin';
import { AdminButton, AdminCard, IosToggle, Pill } from './bits';

export default function SyncSection({ showToast }: { showToast: (msg: string) => void }) {
  if (IS_API) return <RealSyncSection showToast={showToast} />;
  return <MockSyncSection showToast={showToast} />;
}

// ---------- api-режим ----------

function RealSyncSection({ showToast }: { showToast: (msg: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [reverseEnabled, setReverseEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<ApiSyncLogEntry[] | null>(null);

  useEffect(() => {
    getSyncSettings()
      .then((s) => {
        setEnabled(s?.enabled ?? false);
        setReverseEnabled(s?.reverse_enabled ?? false);
        setLoaded(true);
      })
      .catch((err: Error) => setError(err.message || 'Не удалось загрузить настройки'));
    getSyncLog()
      .then(setLog)
      .catch(() => setLog([]));
  }, []);

  const save = (patch: Partial<{ enabled: boolean; reverse_enabled: boolean }>) => {
    updateSyncSettings(patch)
      .then(() => showToast('Настройки автообмена сохранены'))
      .catch((err: Error) => showToast(err.message || 'Не удалось сохранить'));
  };

  if (error) return <AdminCard className="p-6 text-center text-[14px] text-loss">{error}</AdminCard>;
  if (!loaded) return <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Загрузка…</AdminCard>;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
        Настройки автообмена
      </h1>

      <AdminCard>
        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[17px] font-semibold text-black">Автообмен включён</p>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              Односторонняя передача баланса: терминал → сайт АльфаФорекс
            </p>
          </div>
          <IosToggle
            checked={enabled}
            onChange={(v) => { setEnabled(v); save({ enabled: v }); }}
            label="Автообмен включён"
          />
        </div>
      </AdminCard>

      <AdminCard>
        <div className="flex items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[15px] font-medium text-black">Двусторонний обмен</p>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              По ТЗ обмен односторонний — включайте, только если это подтверждено заказчиком
            </p>
          </div>
          <IosToggle
            checked={reverseEnabled}
            onChange={(v) => { setReverseEnabled(v); save({ reverse_enabled: v }); }}
            label="Двусторонний обмен"
          />
        </div>
      </AdminCard>

      <AdminCard title="Журнал обмена">
        <div className="divide-y divide-separator/70 px-5">
          {!log ? (
            <p className="py-4 text-[13px] text-text-secondary">Загрузка…</p>
          ) : log.length === 0 ? (
            <p className="py-4 text-[13px] text-text-secondary">Обменов пока не было</p>
          ) : (
            log.slice(0, 20).map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[14px] text-black">
                    <span className="tnum mr-2 text-text-secondary">
                      {formatDateTime(new Date(e.created_at).getTime())}
                    </span>
                    {e.direction} · {e.peer}
                  </p>
                  {e.detail && <p className="truncate text-[12px] text-text-secondary">{e.detail}</p>}
                </div>
                <Pill tone={e.status === 'ok' ? 'green' : e.status === 'skipped' ? 'gray' : 'red'}>
                  {e.status === 'ok' ? 'успешно' : e.status === 'skipped' ? 'пропущено' : 'ошибка'}
                </Pill>
              </div>
            ))
          )}
        </div>
      </AdminCard>
    </div>
  );
}

// ---------- mock-режим: прежнее локальное состояние для демо ----------

const DATA_ITEMS = [
  'Баланс',
  'Средства',
  'Маржа',
  'Свободная маржа',
  'Уровень маржи',
  'Открытые позиции',
  'История сделок',
];

function MockSyncSection({ showToast }: { showToast: (msg: string) => void }) {
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

      <div
        style={{ opacity: enabled ? 1 : 0.4 }}
        className={`flex flex-col gap-4 transition-opacity duration-200 ${enabled ? '' : 'pointer-events-none'}`}
        aria-hidden={!enabled}
      >
        {/* Direction */}
        <AdminCard title="Направление обмена">
          <div className="flex flex-col gap-3 p-5">
            <div className="flex h-8 rounded-lg bg-[#E9E9EB] p-[2px]">
              {(['to-alfa', 'both'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setDirection(v)}
                  className={`flex-1 rounded-md px-3 text-[13px] font-medium ${direction === v ? 'bg-white text-black shadow-[0_3px_8px_rgba(0,0,0,0.12)]' : 'text-[#636366]'}`}
                >
                  {v === 'to-alfa' ? 'Русинвест → АльфаФорекс' : 'Двусторонний'}
                </button>
              ))}
            </div>
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
          {syncing ? 'Выполняется обмен…' : 'Выполнить обмен сейчас'}
        </AdminButton>
      </div>
    </div>
  );
}

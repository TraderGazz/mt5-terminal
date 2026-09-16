/**
 * Admin → Загруженная история / Лог импортов (admin.md §10.3): HTML report
 * upload, import log table.
 *
 * В режиме api загружает реальный отчёт через POST /api/upload/mt5-report
 * (парсит и сохраняет сделки в БД) и показывает реальный /api/admin/imports.
 * В mock-режиме — прежнее локальное состояние для демо.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { IMPORT_LOG, type ImportLogEntry } from '@/mocks';
import { formatDateTime } from '@/lib/format';
import { IS_API } from '@/config';
import { getImports, uploadMt5Report, type ApiImportLogEntry } from '@/api/admin';
import { AdminButton, AdminCard, Pill } from './bits';

export default function ImportsSection({
  showToast,
  extraEntries,
}: {
  showToast: (msg: string) => void;
  extraEntries: ImportLogEntry[];
}) {
  if (IS_API) return <RealImportsSection showToast={showToast} />;
  return <MockImportsSection showToast={showToast} extraEntries={extraEntries} />;
}

// ---------- api-режим ----------

function RealImportsSection({ showToast }: { showToast: (msg: string) => void }) {
  const [entries, setEntries] = useState<ApiImportLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    getImports()
      .then((rows) => { setEntries(rows); setError(null); })
      .catch((err: Error) => setError(err.message || 'Не удалось загрузить журнал'));
  };

  useEffect(load, []);

  const onFile = (file: File) => {
    setUploading(true);
    uploadMt5Report(file)
      .then((r) => {
        showToast(r.message);
        load();
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось загрузить отчёт'))
      .finally(() => setUploading(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
          Загруженная история
        </h1>
        <AdminButton onClick={() => fileRef.current?.click()} disabled={uploading}>
          <Upload size={16} />
          {uploading ? 'Загрузка…' : 'Загрузить HTML-отчёт'}
        </AdminButton>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </div>

      {error && <AdminCard className="p-4 text-[14px] text-loss">{error}</AdminCard>}

      <AdminCard className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
              <th className="px-5 py-3 font-medium">Время</th>
              <th className="px-4 py-3 font-medium">Файл</th>
              <th className="px-4 py-3 font-medium">Сделок</th>
              <th className="px-4 py-3 font-medium">Кем</th>
            </tr>
          </thead>
          <tbody>
            {!entries ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[14px] text-text-secondary">
                  Загрузка…
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-[14px] text-text-secondary">
                  Пока ничего не загружалось
                </td>
              </tr>
            ) : (
              entries.map((e) => (
                <tr key={e.id} className="border-b border-separator/60 last:border-0 hover:bg-[#F7F7FA]">
                  <td className="tnum whitespace-nowrap px-5 py-3 text-[13px] text-black">
                    {formatDateTime(new Date(e.created_at).getTime())}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-black">
                    {e.filename}
                    <Pill tone="orange">{e.source}</Pill>
                  </td>
                  <td className="tnum px-4 py-3 text-[14px] text-black">{e.trades_count}</td>
                  <td className="px-4 py-3 text-[13px] text-text-secondary">{e.user_login ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}

// ---------- mock-режим: прежнее локальное состояние для демо ----------

function MockImportsSection({
  showToast,
  extraEntries,
}: {
  showToast: (msg: string) => void;
  extraEntries: ImportLogEntry[];
}) {
  const [entries, setEntries] = useState<ImportLogEntry[]>(IMPORT_LOG);
  const [progress, setProgress] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const all = [...extraEntries, ...entries];

  const startImport = (fileName: string) => {
    if (progress !== null) return;
    setProgress(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / 1500) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        setTimeout(() => {
          setProgress(null);
          setEntries((prev) => [
            {
              id: Math.max(0, ...prev.map((e) => e.id)) + 100,
              time: Date.now(),
              source: 'manual',
              fileName,
              records: 12,
              status: 'ok',
              message: 'Ручная загрузка HTML-отчёта',
            },
            ...prev,
          ]);
          showToast('Загружено 12 сделок');
        }, 250);
      }
    }, 50);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
          Загруженная история
        </h1>
        <AdminButton onClick={() => fileRef.current?.click()} disabled={progress !== null}>
          <Upload size={16} />
          Загрузить HTML-отчёт
        </AdminButton>
        <input
          ref={fileRef}
          type="file"
          accept=".html,.htm"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) startImport(f.name);
            e.target.value = '';
          }}
        />
      </div>

      <AnimatePresence>
        {progress !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="rounded-[10px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <p className="mb-2 text-[13px] text-text-secondary">
                Разбор отчёта… {Math.round(progress)}%
              </p>
              <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AdminCard className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left">
          <thead>
            <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
              <th className="px-5 py-3 font-medium">Время</th>
              <th className="px-4 py-3 font-medium">Источник</th>
              <th className="px-4 py-3 font-medium">Сделок</th>
              <th className="px-4 py-3 font-medium">Статус</th>
              <th className="px-5 py-3 font-medium">Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {all.map((e, i) => (
              <motion.tr
                key={`${e.id}-${e.time}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i, 10) * 0.02 }}
                onClick={() => e.status === 'error' && setExpanded(expanded === e.id ? null : e.id)}
                className={`border-b border-separator/60 align-top last:border-0 ${
                  e.status === 'error' ? 'cursor-pointer' : ''
                } hover:bg-[#F7F7FA]`}
              >
                <td className="tnum whitespace-nowrap px-5 py-3 text-[13px] text-black">
                  {formatDateTime(e.time)}
                </td>
                <td className="px-4 py-3">
                  <Pill tone={e.source === 'auto' ? 'blue' : 'orange'}>
                    {e.source === 'auto' ? 'MT5 авто' : 'HTML файл'}
                  </Pill>
                </td>
                <td className="tnum px-4 py-3 text-[14px] text-black">{e.records}</td>
                <td className="px-4 py-3">
                  <Pill tone={e.status === 'ok' ? 'green' : 'red'}>
                    {e.status === 'ok' ? 'успешно' : 'ошибка'}
                  </Pill>
                </td>
                <td className="px-5 py-3 text-[13px] text-text-secondary">
                  {e.message}
                  {e.fileName && <span className="tnum block text-[12px]">{e.fileName}</span>}
                  <AnimatePresence>
                    {e.status === 'error' && expanded === e.id && (
                      <motion.span
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25 }}
                        className="block overflow-hidden text-[12px] text-loss"
                      >
                        Подробности: {e.message}. Повторная попытка будет выполнена автоматически.
                      </motion.span>
                    )}
                  </AnimatePresence>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </AdminCard>
    </div>
  );
}

/**
 * Admin → Создание торгового отчёта (admin.md §10.6): user + period + format,
 * progress, generated file (real client-side HTML/CSV from mock data) with
 * download/open, previous reports table.
 */
import { motion } from 'framer-motion';
import { Download, ExternalLink, FileDown } from 'lucide-react';
import { useState } from 'react';
import { ACCOUNT, ADMIN_USERS, DEALS, BALANCE_OPS, type Deal } from '@/mocks';
import { formatDate, formatDateTime, formatMoney, formatPrice, formatSignedMoney, getSymbolDigitsSafe } from './reportUtils';
import { AdminButton, AdminCard, SegmentedControl } from './bits';

type ReportFormat = 'html' | 'csv';

const PERIODS = [
  { id: 'today', label: 'Сегодня', days: 0 },
  { id: 'yesterday', label: 'Вчера', days: 1 },
  { id: 'week', label: 'Последняя неделя', days: 7 },
  { id: 'month', label: 'Последний месяц', days: 30 },
  { id: 'quarter', label: 'Последние 3 месяца', days: 90 },
  { id: 'all', label: 'Всё время', days: Infinity },
] as const;

type PeriodId = (typeof PERIODS)[number]['id'];

interface GeneratedReport {
  fileName: string;
  sizeKb: number;
  content: string;
  mime: string;
  format: ReportFormat;
  periodLabel: string;
  createdAt: number;
}

function filterByPeriod(deals: Deal[], days: number): Deal[] {
  if (!Number.isFinite(days)) return deals;
  const from = Date.now() - days * 86400_000;
  return deals.filter((d) => d.closeTime >= from);
}

function buildCsv(deals: Deal[]): string {
  const rows = [
    ['Тикет', 'Символ', 'Тип', 'Объём', 'Время открытия', 'Цена открытия', 'Время закрытия', 'Цена закрытия', 'Прибыль', 'Своп', 'Комиссия', 'Комментарий'],
    ...deals.map((d) => [
      String(d.ticket),
      d.symbol || '—',
      d.type,
      d.type === 'balance' ? '' : d.volume.toFixed(2),
      formatDateTime(d.openTime),
      d.type === 'balance' ? '' : formatPrice(d.openPrice, getSymbolDigitsSafe(d.symbol)),
      formatDateTime(d.closeTime),
      d.type === 'balance' ? '' : formatPrice(d.closePrice, getSymbolDigitsSafe(d.symbol)),
      d.profit.toFixed(2),
      d.swap.toFixed(2),
      d.commission.toFixed(2),
      d.comment,
    ]),
  ];
  return '\uFEFF' + rows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(';')).join('\n');
}

function buildHtml(deals: Deal[], periodLabel: string): string {
  const total = deals.reduce((s, d) => s + d.profit + d.swap + d.commission, 0);
  const rows = deals
    .map(
      (d) => `<tr>
<td>${d.ticket}</td><td>${d.symbol || '—'}</td><td>${d.type}</td>
<td>${d.type === 'balance' ? '' : d.volume.toFixed(2)}</td>
<td>${formatDateTime(d.openTime)}</td>
<td>${d.type === 'balance' ? '' : formatPrice(d.openPrice, getSymbolDigitsSafe(d.symbol))}</td>
<td>${formatDateTime(d.closeTime)}</td>
<td>${d.type === 'balance' ? '' : formatPrice(d.closePrice, getSymbolDigitsSafe(d.symbol))}</td>
<td style="color:${d.profit >= 0 ? '#1F9D41' : '#FF3B30'}">${formatSignedMoney(d.profit)}</td>
<td>${formatSignedMoney(d.swap)}</td><td>${formatSignedMoney(d.commission)}</td>
<td>${d.comment}${d.isEdited ? ' (изм.)' : ''}</td></tr>`,
    )
    .join('\n');
  return `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8">
<title>Торговый отчёт · счёт ${ACCOUNT.accountId}</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Tahoma,sans-serif;margin:32px;color:#000}
h1{font-size:22px}p{color:#555;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:12px;margin-top:16px}
th,td{border:1px solid #E5E5E5;padding:6px 8px;text-align:left;white-space:nowrap}
th{background:#F2F2F7}
.total{margin-top:16px;font-size:15px;font-weight:600;color:${total >= 0 ? '#1F9D41' : '#FF3B30'}}
</style></head><body>
<h1>Торговый отчёт</h1>
<p>Счёт: ${ACCOUNT.accountId} · ${ACCOUNT.holder} · ${ACCOUNT.company} (${ACCOUNT.server})<br>
Период: ${periodLabel} · Сформирован: ${formatDateTime(Date.now())}<br>
Баланс: ${formatMoney(ACCOUNT.balance)} · Средства: ${formatMoney(ACCOUNT.equity)}</p>
<table><thead><tr>
<th>Тикет</th><th>Символ</th><th>Тип</th><th>Объём</th><th>Открытие</th><th>Цена</th><th>Закрытие</th><th>Цена</th><th>Прибыль</th><th>Своп</th><th>Комиссия</th><th>Комментарий</th>
</tr></thead><tbody>
${rows}
</tbody></table>
<p class="total">Итог: ${formatSignedMoney(total)}</p>
</body></html>`;
}

function downloadReport(r: GeneratedReport) {
  const blob = new Blob([r.content], { type: r.mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = r.fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function openReport(r: GeneratedReport) {
  const blob = new Blob([r.content], { type: r.mime });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener');
}

const PREVIOUS_REPORTS: { fileName: string; period: string; createdAt: number }[] = [
  { fileName: 'report_50214896_week.html', period: 'Последняя неделя', createdAt: Date.now() - 2 * 86400_000 },
  { fileName: 'report_50214896_month.csv', period: 'Последний месяц', createdAt: Date.now() - 5 * 86400_000 },
  { fileName: 'report_50214901_month.html', period: 'Последний месяц', createdAt: Date.now() - 9 * 86400_000 },
];

export default function ReportsSection({
  showToast,
}: {
  showToast: (msg: string) => void;
}) {
  const [userId, setUserId] = useState(ADMIN_USERS[0]?.id ?? 1);
  const [period, setPeriod] = useState<PeriodId>('month');
  const [format, setFormat] = useState<ReportFormat>('html');
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<GeneratedReport | null>(null);

  const user = ADMIN_USERS.find((u) => u.id === userId) ?? ADMIN_USERS[0];

  const generate = () => {
    if (progress !== null) return;
    setResult(null);
    setProgress(0);
    const started = Date.now();
    const timer = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - started) / 1500) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        const p = PERIODS.find((x) => x.id === period) ?? PERIODS[3];
        const deals = filterByPeriod([...DEALS, ...BALANCE_OPS].sort((a, b) => a.closeTime - b.closeTime), p.days);
        const content = format === 'html' ? buildHtml(deals, p.label) : buildCsv(deals);
        const dateStr = formatDate(Date.now()).split('.').reverse().join('-');
        const fileName = `report_${user?.login ?? 0}_${dateStr}.${format}`;
        const sizeKb = Math.max(1, Math.round(new Blob([content]).size / 1024));
        setTimeout(() => {
          setProgress(null);
          setResult({
            fileName,
            sizeKb,
            content,
            mime: format === 'html' ? 'text/html;charset=utf-8' : 'text/csv;charset=utf-8',
            format,
            periodLabel: p.label,
            createdAt: Date.now(),
          });
          showToast('Отчёт сформирован');
        }, 200);
      }
    }, 50);
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
        Создание торгового отчёта
      </h1>

      <AdminCard title="Параметры отчёта">
        <div className="flex flex-col gap-4 p-5">
          <label className="block">
            <span className="mb-1 block text-[13px] text-text-secondary">Пользователь</span>
            <select
              value={userId}
              onChange={(e) => setUserId(Number(e.target.value))}
              className="h-10 w-full max-w-[360px] rounded-[10px] bg-fill px-3 text-[15px] text-black outline-none focus:ring-2 focus:ring-accent/40"
            >
              {ADMIN_USERS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.login}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-1 block text-[13px] text-text-secondary">Период</span>
            <div className="grid max-w-[480px] grid-cols-1 gap-1 sm:grid-cols-2">
              {PERIODS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriod(p.id)}
                  className="flex items-center justify-between rounded-[8px] px-3 py-2 text-left hover:bg-[#F7F7FA]"
                >
                  <span className="text-[15px] text-black">{p.label}</span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full border-2 ${
                      period === p.id ? 'border-accent bg-accent' : 'border-separator'
                    }`}
                  >
                    {period === p.id && (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                        <path d="M1.5 5.2 4 7.5 8.5 2.6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="mb-1 block text-[13px] text-text-secondary">Формат</span>
            <SegmentedControl<ReportFormat>
              value={format}
              onChange={setFormat}
              options={[
                { value: 'html', label: 'HTML' },
                { value: 'csv', label: 'CSV' },
              ]}
              className="max-w-[240px]"
            />
          </div>

          <div className="flex flex-col gap-3">
            <AdminButton onClick={generate} disabled={progress !== null} className="self-start">
              <FileDown size={16} />
              Создать торговый отчёт
            </AdminButton>
            {progress !== null && (
              <div className="h-1.5 max-w-[480px] overflow-hidden rounded-full bg-fill">
                <div
                  className="h-full rounded-full bg-accent transition-[width] duration-100"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </AdminCard>

      {/* Result card */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        >
          <AdminCard title="Отчёт готов">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <div className="min-w-0">
                <p className="tnum truncate text-[15px] font-medium text-black">{result.fileName}</p>
                <p className="text-[13px] text-text-secondary">
                  {result.sizeKb} КБ · {result.periodLabel} · {formatDateTime(result.createdAt)}
                </p>
              </div>
              <div className="flex gap-2">
                <AdminButton onClick={() => downloadReport(result)}>
                  <Download size={16} />
                  Скачать
                </AdminButton>
                <AdminButton variant="secondary" onClick={() => openReport(result)}>
                  <ExternalLink size={16} />
                  Открыть
                </AdminButton>
              </div>
            </div>
          </AdminCard>
        </motion.div>
      )}

      {/* Previous reports */}
      <AdminCard title="Предыдущие отчёты">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
                <th className="px-5 py-3 font-medium">Файл</th>
                <th className="px-4 py-3 font-medium">Период</th>
                <th className="px-4 py-3 font-medium">Создан</th>
                <th className="px-5 py-3 text-right font-medium">Скачать</th>
              </tr>
            </thead>
            <tbody>
              {PREVIOUS_REPORTS.map((r) => (
                <tr key={r.fileName} className="border-b border-separator/60 last:border-0 hover:bg-[#F7F7FA]">
                  <td className="tnum px-5 py-3 text-[14px] text-black">{r.fileName}</td>
                  <td className="px-4 py-3 text-[13px] text-text-secondary">{r.period}</td>
                  <td className="tnum px-4 py-3 text-[13px] text-text-secondary">{formatDateTime(r.createdAt)}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      type="button"
                      aria-label={`Скачать ${r.fileName}`}
                      onClick={() => {
                        const isCsv = r.fileName.endsWith('.csv');
                        const content = isCsv ? buildCsv(DEALS) : buildHtml(DEALS, r.period);
                        downloadReport({
                          fileName: r.fileName,
                          sizeKb: Math.max(1, Math.round(new Blob([content]).size / 1024)),
                          content,
                          mime: isCsv ? 'text/csv;charset=utf-8' : 'text/html;charset=utf-8',
                          format: isCsv ? 'csv' : 'html',
                          periodLabel: r.period,
                          createdAt: r.createdAt,
                        });
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-accent hover:bg-[rgba(0,122,255,0.08)]"
                    >
                      <Download size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}

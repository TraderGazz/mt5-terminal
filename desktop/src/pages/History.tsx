import { useEffect, useState } from 'react';
import { getHistory, type HistoryResponse } from '@/api/rest';

const money = (v: number) =>
  `${v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('ru-RU') : '—');

const PERIODS = [
  { v: 'today', l: 'Сегодня' },
  { v: 'week', l: 'Неделя' },
  { v: 'month', l: 'Месяц' },
  { v: '3m', l: '3 месяца' },
  { v: '6m', l: '6 месяцев' },
  { v: 'year', l: 'Год' },
  { v: 'all', l: 'Всё время' },
];

const TH = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-2';
const TD = 'tnum px-3 py-2 text-[13px] whitespace-nowrap';

function TotalRow({ label, value, hide }: { label: string; value: number; hide?: boolean }) {
  if (hide) return null;
  return (
    <div className="flex justify-between border-t border-hairline py-1.5 first:border-t-2 first:border-sep last:border-b-2 last:border-sep">
      <span>{label}</span>
      <span className="tnum font-medium">{money(value)}</span>
    </div>
  );
}

export default function HistoryPage() {
  const [period, setPeriod] = useState('6m');
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getHistory({ tab: 'deals', period, sort: 'default' })
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period]);

  const t = data?.totals;

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[15px] font-bold">История сделок</h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="ml-auto rounded-md border border-hairline px-2 py-1 text-[13px]"
        >
          {PERIODS.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-x-auto rounded-lg border border-hairline">
          <table className="w-full border-collapse">
            <thead className="border-b border-hairline bg-grouped">
              <tr>
                <th className={TH}>Тикет</th>
                <th className={TH}>Символ</th>
                <th className={TH}>Тип</th>
                <th className={TH}>Объём</th>
                <th className={TH}>Откр.</th>
                <th className={TH}>Закр.</th>
                <th className={TH}>Своп</th>
                <th className={TH}>Комис.</th>
                <th className={TH}>Прибыль</th>
                <th className={TH}>Время закрытия</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="px-3 py-6 text-center text-text-2" colSpan={10}>Загрузка…</td></tr>}
              {!loading && (data?.rows.length ?? 0) === 0 && (
                <tr><td className="px-3 py-6 text-center text-text-2" colSpan={10}>Нет сделок за период</td></tr>
              )}
              {data?.rows.map((r) => (
                <tr key={r.ticket} className="border-b border-hairline last:border-0">
                  <td className={`${TD} text-text-2`}>{r.ticket}</td>
                  <td className={`${TD} font-semibold`}>{r.symbol}</td>
                  <td className={`${TD} ${r.dealType === 'buy' ? 'text-accent' : 'text-loss'}`}>{r.dealType}</td>
                  <td className={TD}>{r.volume}</td>
                  <td className={TD}>{r.openPrice}</td>
                  <td className={TD}>{r.closePrice}</td>
                  <td className={TD}>{money(r.swap)}</td>
                  <td className={TD}>{money(r.commission)}</td>
                  <td className={`${TD} font-medium ${r.profit < 0 ? 'text-loss' : 'text-accent'}`}>{money(r.profit)}</td>
                  <td className={`${TD} text-text-2`}>{dt(r.closeTime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {t && (
          <aside className="h-fit rounded-lg border border-hairline p-4 text-[13px]">
            <h3 className="mb-2 text-[13px] font-bold uppercase tracking-wide text-text-2">Итоги</h3>
            <TotalRow label="Депозит" value={t.deposit} />
            <TotalRow label="Снятие" value={t.withdrawal} hide={!t.showWithdrawal} />
            <TotalRow label="Прибыль" value={t.profit} />
            <TotalRow label="CFD" value={t.cfd} hide={!t.showCfd} />
            <TotalRow label="Своп" value={t.swap} />
            <TotalRow label="Комиссия" value={t.commission} />
            <TotalRow label="Баланс" value={t.balance} />
          </aside>
        )}
      </div>
    </section>
  );
}

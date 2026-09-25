import { useEffect, useState } from 'react';
import { getPositions, getHistory, type Position, type HistoryRow } from '@/api/rest';
import { wsClient } from '@/api/ws';
import { money, price, dt, lots } from '@/lib/format';

type TabId = 'trade' | 'assets' | 'history' | 'news' | 'alerts' | 'articles' | 'depth' | 'experts' | 'journal';

const TABS: { id: TabId; label: string; enabled: boolean }[] = [
  { id: 'trade', label: 'Торговля', enabled: true },
  { id: 'assets', label: 'Активы', enabled: false },
  { id: 'history', label: 'История', enabled: true },
  { id: 'news', label: 'Новости', enabled: false },
  { id: 'alerts', label: 'Оповещения', enabled: false },
  { id: 'articles', label: 'Статьи', enabled: false },
  { id: 'depth', label: 'Стакан', enabled: false },
  { id: 'experts', label: 'Эксперты', enabled: false },
  { id: 'journal', label: 'Журнал', enabled: false },
];

const TH = 'px-3 py-1.5 text-left text-[12px] font-medium text-text-2 border-b border-hairline whitespace-nowrap';
const TD = 'tnum px-3 py-1 text-[13px] whitespace-nowrap border-b border-hairline';

function TypeCell({ type }: { type: string }) {
  return <span className={type === 'buy' ? 'text-accent' : 'text-loss'}>{type}</span>;
}

/** Вкладка «Торговля» — открытые позиции, 1-в-1 со скриншотом оригинала. */
function TradeTab() {
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    getPositions().then(setPositions).catch(() => {});
    return wsClient.on('positions', (d) => setPositions((d as Position[]) || []));
  }, []);

  return (
    <div className="overflow-auto">
      <table className="w-full border-collapse">
        <thead className="sticky top-0 bg-grouped">
          <tr>
            <th className={TH}>Символ</th>
            <th className={TH}>Тикет</th>
            <th className={TH}>Время</th>
            <th className={TH}>Тип</th>
            <th className={TH}>Объём</th>
            <th className={TH}>S/L</th>
            <th className={TH}>T/P</th>
            <th className={TH}>Цена</th>
            <th className={TH}>Своп</th>
            <th className={TH}>Прибыль</th>
          </tr>
        </thead>
        <tbody>
          {positions.length === 0 && (
            <tr>
              <td className={`${TD} text-center text-text-2`} colSpan={10}>
                Нет открытых позиций
              </td>
            </tr>
          )}
          {positions.map((p) => (
            <tr key={p.id} className="hover:bg-grouped/60">
              <td className={`${TD} font-medium`}>{p.symbol}</td>
              <td className={`${TD} text-text-2`}>{p.id}</td>
              <td className={`${TD} text-text-2`}>{dt(p.openTime)}</td>
              <td className={TD}><TypeCell type={p.type} /></td>
              <td className={TD}>{lots(p.volume)}</td>
              <td className={TD}>{price(p.stopLoss)}</td>
              <td className={TD}>{price(p.takeProfit)}</td>
              <td className={TD}>{p.openPrice}</td>
              <td className={TD}>{money(p.swap)}</td>
              <td className={`${TD} font-medium ${p.profit < 0 ? 'text-loss' : 'text-accent'}`}>
                {money(p.profit)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PERIODS = [
  { v: 'today', l: 'Сегодня' },
  { v: 'week', l: 'Неделя' },
  { v: 'month', l: 'Месяц' },
  { v: '3m', l: '3 месяца' },
  { v: '6m', l: '6 месяцев' },
  { v: 'year', l: 'Год' },
  { v: 'all', l: 'Всё время' },
];

/** Вкладка «История» — закрытые сделки, 1-в-1 со скриншотом оригинала. */
function HistoryTab() {
  const [period, setPeriod] = useState('6m');
  const [data, setData] = useState<{ rows: HistoryRow[]; totals: { deposit: number; withdrawal: number; profit: number; balance: number } } | null>(null);

  useEffect(() => {
    getHistory({ tab: 'deals', period, sort: 'default' })
      .then((r) => setData({ rows: r.rows, totals: r.totals }))
      .catch(() => setData(null));
  }, [period]);

  const t = data?.totals;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-hairline bg-grouped px-3 py-1.5">
        <span className="text-[12px] text-text-2">Период:</span>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="rounded border border-hairline bg-white px-1.5 py-0.5 text-[12px]"
        >
          {PERIODS.map((p) => (
            <option key={p.v} value={p.v}>{p.l}</option>
          ))}
        </select>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead className="sticky top-0 bg-grouped">
            <tr>
              <th className={TH}>Время</th>
              <th className={TH}>Символ</th>
              <th className={TH}>Тип</th>
              <th className={TH}>Объём</th>
              <th className={TH}>Цена</th>
              <th className={TH}>S/L</th>
              <th className={TH}>T/P</th>
              <th className={TH}>Время</th>
              <th className={TH}>Цена</th>
              <th className={TH}>Прибыль</th>
              <th className={TH}>Изменение</th>
            </tr>
          </thead>
          <tbody>
            {(!data || data.rows.length === 0) && (
              <tr>
                <td className={`${TD} text-center text-text-2`} colSpan={11}>
                  {data ? 'Нет сделок за период' : 'Загрузка…'}
                </td>
              </tr>
            )}
            {data?.rows.map((r) => (
              <tr key={r.ticket} className="hover:bg-grouped/60">
                <td className={`${TD} text-text-2`}>{dt(r.openTime)}</td>
                <td className={`${TD} font-medium`}>{r.symbol}</td>
                <td className={TD}><TypeCell type={r.dealType} /></td>
                <td className={TD}>{lots(r.volume)}</td>
                <td className={TD}>{r.openPrice}</td>
                <td className={TD}>{price(r.stopLoss)}</td>
                <td className={TD}>{price(r.takeProfit)}</td>
                <td className={`${TD} text-text-2`}>{dt(r.closeTime)}</td>
                <td className={TD}>{r.closePrice}</td>
                <td className={`${TD} font-medium ${r.profit < 0 ? 'text-loss' : 'text-accent'}`}>
                  {money(r.profit)}
                </td>
                <td className={`${TD} text-text-2`}>{r.isEdited ? 'изменено' : r.comment || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {t && (
        <div className="flex items-center gap-6 border-t border-hairline bg-grouped px-3 py-1.5 text-[13px]">
          <span>Прибыль: <b className="tnum">{money(t.profit)}</b></span>
          <span>Кредит: <b className="tnum">0.00</b></span>
          <span>Пополнение: <b className="tnum">{money(t.deposit)}</b></span>
          <span>Снятие: <b className="tnum">{money(t.withdrawal)}</b></span>
          <span>Баланс: <b className="tnum">{money(t.balance)}</b></span>
        </div>
      )}
    </div>
  );
}

/**
 * Нижняя панель терминала (заявка заказчика: «Торговля»/«История» — точная
 * копия оригинала MT5) — вкладки, под активной идёт таблица + строка
 * сводки. Остальные вкладки оригинала (Активы/Новости/...) показаны, но не
 * нажимаются — их не заказывали, но полностью убирать не стали, чтобы
 * ряд вкладок выглядел как в оригинале.
 */
export default function BottomPanel() {
  const [tab, setTab] = useState<TabId>('trade');

  return (
    <div className="flex h-full flex-col border-t border-hairline bg-white">
      <div className="flex shrink-0 border-b border-hairline bg-grouped">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            disabled={!t.enabled}
            onClick={() => setTab(t.id)}
            className={`border-r border-hairline px-3 py-1.5 text-[13px] ${
              !t.enabled
                ? 'cursor-not-allowed text-[#C7C7CC]'
                : tab === t.id
                  ? 'bg-white font-medium text-black'
                  : 'text-text-2 hover:bg-white/60'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {tab === 'trade' && <TradeTab />}
        {tab === 'history' && <HistoryTab />}
      </div>
    </div>
  );
}

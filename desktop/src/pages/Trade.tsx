import { useEffect, useState } from 'react';
import { getPositions, type Position } from '@/api/rest';
import { wsClient } from '@/api/ws';

const money = (v: number, d = 2) =>
  `${v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('ru-RU') : '—');

const TH = 'px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-text-2';
const TD = 'tnum px-3 py-2 text-[13px] whitespace-nowrap';

export default function TradePage() {
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    getPositions().then(setPositions).catch(() => {});
    const off = wsClient.on('positions', (d) => setPositions((d as Position[]) || []));
    return off;
  }, []);

  return (
    <section>
      <h2 className="mb-3 text-[15px] font-bold">Открытые позиции</h2>
      <div className="overflow-x-auto rounded-lg border border-hairline">
        <table className="w-full border-collapse">
          <thead className="border-b border-hairline bg-grouped">
            <tr>
              <th className={TH}>Символ</th>
              <th className={TH}>Тип</th>
              <th className={TH}>Объём</th>
              <th className={TH}>Цена откр.</th>
              <th className={TH}>Тек. цена</th>
              <th className={TH}>Своп</th>
              <th className={TH}>Комиссия</th>
              <th className={TH}>Прибыль</th>
              <th className={TH}>Время</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 && (
              <tr><td className="px-3 py-6 text-center text-text-2" colSpan={9}>Нет открытых позиций</td></tr>
            )}
            {positions.map((p) => (
              <tr key={p.id} className="border-b border-hairline last:border-0">
                <td className={`${TD} font-semibold`}>{p.symbol}</td>
                <td className={`${TD} ${p.type === 'buy' ? 'text-accent' : 'text-loss'}`}>{p.type}</td>
                <td className={TD}>{p.volume}</td>
                <td className={TD}>{p.openPrice}</td>
                <td className={TD}>{p.currentPrice}</td>
                <td className={TD}>{money(p.swap)}</td>
                <td className={TD}>{money(p.commission)}</td>
                <td className={`${TD} font-medium ${p.profit < 0 ? 'text-loss' : 'text-accent'}`}>{money(p.profit)}</td>
                <td className={`${TD} text-text-2`}>{dt(p.openTime)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-text-2">Только просмотр. Совершение сделок недоступно.</p>
    </section>
  );
}

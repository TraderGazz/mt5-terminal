/**
 * Admin → Сделки и депозиты: реальный список строк из таблицы `trades`
 * (сделки И балансовые операции — депозиты/снятия хранятся там же с
 * type='balance'/'withdrawal'). Позволяет найти и поправить/удалить
 * конкретную запись — заявка заказчика: "есть депозиты, которых не должно
 * быть в оригинале".
 */
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { getTrades, patchTrade, deleteTrade, type ApiTradeRow } from '@/api/rest';
import { AdminButton, AdminCard, AdminInput, AdminModal, Pill, SegmentedControl } from './bits';

type TypeFilter = 'all' | 'buy' | 'sell' | 'balance' | 'withdrawal' | 'cfd';

const TYPE_TONE: Record<string, 'blue' | 'green' | 'gray' | 'orange' | 'red'> = {
  buy: 'green',
  sell: 'red',
  balance: 'blue',
  withdrawal: 'orange',
  cfd: 'gray',
};

// Postgres отдаёт DECIMAL-колонки строками в JSON — Number() обязателен,
// иначе арифметика (periodTotals ниже) молча превращается в конкатенацию строк.
const fmt = (n: number | string | null | undefined) =>
  (Number(n) || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function TotalStat({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div>
      <p className="text-[12px] text-text-secondary">{label}</p>
      <p className={`tnum ${bold ? 'text-[16px] font-semibold' : 'text-[14px]'} text-black`}>{fmt(value)}</p>
    </div>
  );
}

interface EditForm {
  profit: string;
  swap: string;
  commission: string;
  comment: string;
}

export default function TradesSection({ showToast }: { showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<ApiTradeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>('all');
  // Пустая строка = без границы (тот же смысл, что «Все» на сайте).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editTarget, setEditTarget] = useState<ApiTradeRow | null>(null);
  const [form, setForm] = useState<EditForm>({ profit: '', swap: '', commission: '', comment: '' });
  const [deleteTarget, setDeleteTarget] = useState<ApiTradeRow | null>(null);

  const load = () => {
    getTrades({
      period: from || to ? undefined : 'all',
      from: from || undefined,
      to: to ? `${to}T23:59:59` : undefined,
      limit: 1000,
    })
      .then((r) => { setRows(r.trades); setError(null); })
      .catch((err: Error) => setError(err.message || 'Не удалось загрузить сделки'));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [from, to]);

  if (error) {
    return <AdminCard className="p-6 text-center text-[14px] text-loss">{error}</AdminCard>;
  }
  if (!rows) {
    return <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Загрузка…</AdminCard>;
  }

  const filtered = type === 'all' ? rows : rows.filter((r) => r.type === type);

  // Живой итог — пересчитывается сразу при правке (заявка заказчика: видеть
  // сумму периода сразу после изменения любой сделки, без доп. действий).
  const periodTotals = filtered.reduce(
    (acc, r) => {
      const profit = Number(r.profit) || 0;
      const swap = Number(r.swap) || 0;
      const commission = Number(r.commission) || 0;
      if (r.type === 'buy' || r.type === 'sell') {
        acc.profit += profit;
        acc.swap += swap;
        acc.commission += commission;
      } else if (r.type === 'balance') {
        if (profit < 0) acc.withdrawal += -profit;
        else acc.deposit += profit;
      }
      return acc;
    },
    { deposit: 0, withdrawal: 0, profit: 0, swap: 0, commission: 0 },
  );
  const periodBalance =
    periodTotals.deposit - periodTotals.withdrawal + periodTotals.profit + periodTotals.swap + periodTotals.commission;

  const openEdit = (row: ApiTradeRow) => {
    setEditTarget(row);
    setForm({
      profit: String(row.profit ?? 0),
      swap: String(row.swap ?? 0),
      commission: String(row.commission ?? 0),
      comment: row.comment ?? '',
    });
  };

  const saveEdit = () => {
    if (!editTarget) return;
    const profit = Number(form.profit.replace(',', '.'));
    const swap = Number(form.swap.replace(',', '.'));
    const commission = Number(form.commission.replace(',', '.'));
    if (!Number.isFinite(profit) || !Number.isFinite(swap) || !Number.isFinite(commission)) {
      showToast('Введите корректные числа');
      return;
    }
    patchTrade(editTarget.id, { profit, swap, commission, comment: form.comment })
      .then(() => {
        setRows((prev) =>
          (prev ?? []).map((r) =>
            r.id === editTarget.id ? { ...r, profit, swap, commission, comment: form.comment, is_edited: true } : r,
          ),
        );
        showToast(`Запись #${editTarget.ticket} обновлена`);
        setEditTarget(null);
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось сохранить'));
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteTrade(deleteTarget.id)
      .then(() => {
        setRows((prev) => (prev ?? []).filter((r) => r.id !== deleteTarget.id));
        showToast(`Запись #${deleteTarget.ticket} удалена`);
        setDeleteTarget(null);
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось удалить'));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
          Сделки и депозиты
        </h1>
        <SegmentedControl<TypeFilter>
          value={type}
          onChange={setType}
          className="w-auto"
          options={[
            { value: 'all', label: 'Все' },
            { value: 'buy', label: 'buy' },
            { value: 'sell', label: 'sell' },
            { value: 'balance', label: 'депозит' },
            { value: 'withdrawal', label: 'снятие' },
          ]}
        />
      </div>

      {/* Произвольный период — заявка заказчика: выбрать любой диапазон дат
          и сразу видеть пересчитанный итог по нему. */}
      <AdminCard>
        <div className="flex flex-wrap items-end gap-3 p-4">
          <div className="w-[160px]">
            <AdminInput label="С" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="w-[160px]">
            <AdminInput label="По" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          {(from || to) && (
            <AdminButton variant="secondary" onClick={() => { setFrom(''); setTo(''); }}>
              Сбросить период
            </AdminButton>
          )}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-separator px-4 py-3 sm:grid-cols-3 md:grid-cols-6">
          <TotalStat label="Депозит" value={periodTotals.deposit} />
          <TotalStat label="Снятие" value={periodTotals.withdrawal} />
          <TotalStat label="Прибыль" value={periodTotals.profit} />
          <TotalStat label="Своп" value={periodTotals.swap} />
          <TotalStat label="Комиссия" value={periodTotals.commission} />
          <TotalStat label="Баланс" value={periodBalance} bold />
        </div>
      </AdminCard>

      <AdminCard className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead>
            <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
              <th className="px-5 py-3 font-medium">Тикет / Символ</th>
              <th className="px-4 py-3 font-medium">Тип</th>
              <th className="px-4 py-3 text-right font-medium">Прибыль</th>
              <th className="px-4 py-3 text-right font-medium">Своп</th>
              <th className="px-4 py-3 text-right font-medium">Комиссия</th>
              <th className="px-4 py-3 font-medium">Закрыта</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-separator/60 last:border-0 hover:bg-[#F7F7FA]">
                <td className="px-5 py-3">
                  <span className="block text-[14px] text-black">{r.symbol || '—'}</span>
                  <span className="tnum block text-[12px] text-text-secondary">
                    #{r.ticket} {r.is_edited && '· изм.'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Pill tone={TYPE_TONE[r.type] ?? 'gray'}>{r.type}</Pill>
                </td>
                <td className="tnum px-4 py-3 text-right text-[14px] text-black">{fmt(r.profit)}</td>
                <td className="tnum px-4 py-3 text-right text-[14px] text-black">{fmt(r.swap)}</td>
                <td className="tnum px-4 py-3 text-right text-[14px] text-black">{fmt(r.commission)}</td>
                <td className="tnum whitespace-nowrap px-4 py-3 text-[13px] text-text-secondary">
                  {r.close_time ? formatDateTime(new Date(r.close_time).getTime()) : '—'}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <AdminButton variant="text" onClick={() => openEdit(r)}>
                      Изменить
                    </AdminButton>
                    <button
                      type="button"
                      aria-label="Удалить"
                      onClick={() => setDeleteTarget(r)}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-loss hover:bg-[rgba(255,59,48,0.08)]"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-8 text-center text-[14px] text-text-secondary">
                  Ничего не найдено
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </AdminCard>

      {/* Edit modal */}
      <AdminModal
        open={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title={editTarget ? `#${editTarget.ticket} · ${editTarget.symbol || editTarget.type}` : ''}
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setEditTarget(null)}>
              Отмена
            </AdminButton>
            <AdminButton onClick={saveEdit}>Сохранить</AdminButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <AdminInput
            label="Прибыль / сумма"
            inputMode="decimal"
            value={form.profit}
            onChange={(e) => setForm((f) => ({ ...f, profit: e.target.value }))}
          />
          <AdminInput
            label="Своп"
            inputMode="decimal"
            value={form.swap}
            onChange={(e) => setForm((f) => ({ ...f, swap: e.target.value }))}
          />
          <AdminInput
            label="Комиссия"
            inputMode="decimal"
            value={form.commission}
            onChange={(e) => setForm((f) => ({ ...f, commission: e.target.value }))}
          />
          <AdminInput
            label="Комментарий"
            value={form.comment}
            onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
          />
        </div>
      </AdminModal>

      {/* Delete confirm */}
      <AdminModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Удалить запись?"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setDeleteTarget(null)}>
              Отмена
            </AdminButton>
            <AdminButton variant="destructive" onClick={confirmDelete}>
              Удалить
            </AdminButton>
          </>
        }
      >
        {deleteTarget && (
          <p className="text-[14px] text-black">
            Удалить {deleteTarget.type === 'balance' ? 'депозит' : deleteTarget.type === 'withdrawal' ? 'снятие' : 'сделку'} #{deleteTarget.ticket}{' '}
            ({fmt(deleteTarget.profit)})? Действие необратимо.
          </p>
        )}
      </AdminModal>
    </div>
  );
}

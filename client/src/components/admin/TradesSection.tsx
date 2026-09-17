/**
 * Admin → Торговля и история (заявка заказчика: разделить как на самом
 * сайте — «Торговля» = открытые позиции, «История» = закрытые сделки).
 * «Торговля» — живой просмотр /api/positions, без редактирования (значения
 * меняются каждую секунду, редактировать нечего). «История» — реальный
 * список строк из таблицы `trades` (сделки И балансовые операции —
 * депозиты/снятия хранятся там же с type='balance'/'withdrawal'), с
 * возможностью найти и поправить/удалить любую запись, включая цену
 * открытия/закрытия — заявка заказчика.
 */
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import {
  getTrades,
  getPositions,
  patchTrade,
  deleteTrade,
  openTrade,
  closeTrade,
  type ApiTradeRow,
  type ApiTradesTotals,
  type ApiPosition,
} from '@/api/rest';
import { AdminButton, AdminCard, AdminInput, AdminModal, Pill, SegmentedControl } from './bits';

type ViewMode = 'history' | 'trading';

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

const fmtPrice = (n: number | string | null | undefined) => {
  const v = Number(n) || 0;
  return v === 0 ? '—' : v.toFixed(5);
};

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
  openPrice: string;
  closePrice: string;
  comment: string;
}

export default function TradesSection({ showToast }: { showToast: (msg: string) => void }) {
  const [view, setView] = useState<ViewMode>('history');
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
          {view === 'history' ? 'История' : 'Торговля'}
        </h1>
        <SegmentedControl<ViewMode>
          value={view}
          onChange={setView}
          className="w-auto"
          options={[
            { value: 'trading', label: 'Торговля' },
            { value: 'history', label: 'История' },
          ]}
        />
      </div>
      {view === 'trading' ? <TradingView showToast={showToast} /> : <HistoryEditor showToast={showToast} />}
    </div>
  );
}

/**
 * Торговля — открытые позиции + возможность открыть/закрыть реальную
 * сделку (заявка заказчика). ВАЖНО: это настоящий ордер брокеру через
 * MT5-мост, не правка записи в БД — реальные деньги, необратимо, поэтому
 * оба действия идут через модалку-подтверждение с явным предупреждением.
 */
function TradingView({ showToast }: { showToast: (msg: string) => void }) {
  const [positions, setPositions] = useState<ApiPosition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openModal, setOpenModal] = useState(false);
  const [openType, setOpenType] = useState<'buy' | 'sell'>('buy');
  const [openVolume, setOpenVolume] = useState('0.01');
  const [submitting, setSubmitting] = useState(false);
  const [closeTarget, setCloseTarget] = useState<ApiPosition | null>(null);
  const [closing, setClosing] = useState(false);

  const load = () => {
    getPositions()
      .then((p) => { setPositions(p); setError(null); })
      .catch((err: Error) => setError(err.message || 'Не удалось загрузить позиции'));
  };

  useEffect(load, []);

  const submitOpen = () => {
    const volume = Number(openVolume.replace(',', '.'));
    if (!Number.isFinite(volume) || volume <= 0) {
      showToast('Введите корректный объём');
      return;
    }
    setSubmitting(true);
    openTrade({ type: openType, volume })
      .then((r) => {
        showToast(`Сделка открыта: ${openType} ${volume} лот, тикет #${r.order ?? r.deal ?? '—'}`);
        setOpenModal(false);
        load();
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось открыть сделку'))
      .finally(() => setSubmitting(false));
  };

  const submitClose = () => {
    if (!closeTarget) return;
    setClosing(true);
    closeTrade({ ticket: closeTarget.id })
      .then(() => {
        showToast(`Позиция #${closeTarget.id} закрыта`);
        setCloseTarget(null);
        setPositions((prev) => (prev ?? []).filter((p) => p.id !== closeTarget.id));
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось закрыть сделку'))
      .finally(() => setClosing(false));
  };

  const openButton = (
    <div className="flex justify-end">
      <AdminButton onClick={() => { setOpenType('buy'); setOpenVolume('0.01'); setOpenModal(true); }}>
        Открыть сделку
      </AdminButton>
    </div>
  );

  const modals = (
    <>
      {/* Открытие — подтверждение (реальный ордер, реальные деньги) */}
      <AdminModal
        open={openModal}
        onClose={() => !submitting && setOpenModal(false)}
        title="Открыть сделку"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setOpenModal(false)} disabled={submitting}>
              Отмена
            </AdminButton>
            <AdminButton onClick={submitOpen} disabled={submitting}>
              {submitting ? 'Открываю…' : 'Открыть по рынку'}
            </AdminButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <SegmentedControl<'buy' | 'sell'>
            value={openType}
            onChange={setOpenType}
            options={[
              { value: 'buy', label: 'Buy' },
              { value: 'sell', label: 'Sell' },
            ]}
          />
          <AdminInput
            label="Объём (лоты)"
            inputMode="decimal"
            value={openVolume}
            onChange={(e) => setOpenVolume(e.target.value)}
          />
          <p className="text-[13px] leading-[18px] text-loss">
            Это реальная рыночная заявка брокеру по текущей цене — не тестовая
            запись. Отменить нельзя, только закрыть обратно с новым рыночным риском.
          </p>
        </div>
      </AdminModal>

      {/* Закрытие — подтверждение */}
      <AdminModal
        open={closeTarget !== null}
        onClose={() => !closing && setCloseTarget(null)}
        title="Закрыть позицию?"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setCloseTarget(null)} disabled={closing}>
              Отмена
            </AdminButton>
            <AdminButton variant="destructive" onClick={submitClose} disabled={closing}>
              {closing ? 'Закрываю…' : 'Закрыть по рынку'}
            </AdminButton>
          </>
        }
      >
        {closeTarget && (
          <p className="text-[14px] leading-[20px] text-black">
            #{closeTarget.id} {closeTarget.symbol} {closeTarget.type}, {closeTarget.volume} лот — будет закрыта
            реальным ордером брокеру по текущей цене (прибыль сейчас: {fmt(closeTarget.profit)}). Действие необратимо.
          </p>
        )}
      </AdminModal>
    </>
  );

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        {openButton}
        <AdminCard className="p-6 text-center text-[14px] text-loss">{error}</AdminCard>
        {modals}
      </div>
    );
  }
  if (!positions) {
    return (
      <div className="flex flex-col gap-4">
        {openButton}
        <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Загрузка…</AdminCard>
        {modals}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {openButton}

      {positions.length === 0 ? (
        <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Нет открытых позиций</AdminCard>
      ) : (
        <>
          {/* Desktop/tablet: table */}
          <AdminCard className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[820px] border-collapse text-left">
              <thead>
                <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-3 font-medium">Тикет / Символ</th>
                  <th className="px-4 py-3 font-medium">Тип</th>
                  <th className="px-4 py-3 text-right font-medium">Цена открытия</th>
                  <th className="px-4 py-3 text-right font-medium">Текущая цена</th>
                  <th className="px-4 py-3 text-right font-medium">Прибыль</th>
                  <th className="px-4 py-3 text-right font-medium">Своп</th>
                  <th className="px-4 py-3 font-medium">Открыта</th>
                  <th className="px-4 py-3 text-right font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr key={p.id} className="border-b border-separator/60 last:border-0 hover:bg-[#F7F7FA]">
                    <td className="px-5 py-3">
                      <span className="block text-[14px] text-black">{p.symbol || '—'}</span>
                      <span className="tnum block text-[12px] text-text-secondary">#{p.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <Pill tone={TYPE_TONE[p.type] ?? 'gray'}>{p.type}</Pill>
                    </td>
                    <td className="tnum px-4 py-3 text-right text-[14px] text-black">{fmt(p.openPrice)}</td>
                    <td className="tnum px-4 py-3 text-right text-[14px] text-black">{fmt(p.currentPrice)}</td>
                    <td className="tnum px-4 py-3 text-right text-[14px] text-black">{fmt(p.profit)}</td>
                    <td className="tnum px-4 py-3 text-right text-[14px] text-black">{fmt(p.swap)}</td>
                    <td className="tnum whitespace-nowrap px-4 py-3 text-[13px] text-text-secondary">
                      {p.openTime ? formatDateTime(new Date(p.openTime).getTime()) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <AdminButton variant="destructive" onClick={() => setCloseTarget(p)}>
                        Закрыть
                      </AdminButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminCard>

          {/* Mobile: cards (широкая таблица на телефоне была нечитаема) */}
          <div className="flex flex-col gap-3 md:hidden">
            {positions.map((p) => (
              <div key={p.id} className="rounded-[10px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-black">{p.symbol || '—'}</p>
                    <p className="tnum text-[12px] text-text-secondary">#{p.id}</p>
                  </div>
                  <Pill tone={TYPE_TONE[p.type] ?? 'gray'}>{p.type}</Pill>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                  <Field label="Цена открытия" value={fmt(p.openPrice)} />
                  <Field label="Текущая цена" value={fmt(p.currentPrice)} />
                  <Field label="Прибыль" value={fmt(p.profit)} />
                  <Field label="Своп" value={fmt(p.swap)} />
                  <Field
                    label="Открыта"
                    value={p.openTime ? formatDateTime(new Date(p.openTime).getTime()) : '—'}
                    span
                  />
                </div>
                <div className="mt-3 border-t border-separator pt-3">
                  <AdminButton variant="destructive" className="w-full" onClick={() => setCloseTarget(p)}>
                    Закрыть
                  </AdminButton>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modals}
    </div>
  );
}

/** Подпись + значение в карточке мобильного вида. */
function Field({ label, value, span }: { label: string; value: string; span?: boolean }) {
  return (
    <div className={span ? 'col-span-2' : undefined}>
      <p className="text-text-secondary">{label}</p>
      <p className="tnum text-black">{value}</p>
    </div>
  );
}

/** История — закрытые сделки/депозиты из `trades` (редактируемо). */
function HistoryEditor({ showToast }: { showToast: (msg: string) => void }) {
  const [rows, setRows] = useState<ApiTradeRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<TypeFilter>('all');
  // Пустая строка = без границы (тот же смысл, что «Все» на сайте).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [editTarget, setEditTarget] = useState<ApiTradeRow | null>(null);
  const [form, setForm] = useState<EditForm>({
    profit: '', swap: '', commission: '', openPrice: '', closePrice: '', comment: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<ApiTradeRow | null>(null);
  // Итог по ВСЕМУ периоду — считает сервер агрегатом по всей БД (не зависит
  // от LIMIT ниже). На плотных периодах сделок может быть в разы больше
  // лимита строк для отображения — если считать итог из `rows`, депозит/
  // снятие за пределами загруженных строк тихо выпадали бы из суммы (баг-
  // репорт заказчика: "в админке снятие 0, хотя на сайте есть за тот же
  // период"). Живой пересчёт после правки/удаления — через дельту сюда же,
  // без повторного похода на сервер (заявка заказчика: сумма обновляется
  // сразу же после любой правки).
  const [totals, setTotals] = useState<ApiTradesTotals | null>(null);

  const load = () => {
    getTrades({
      period: from || to ? undefined : 'all',
      from: from || undefined,
      to: to ? `${to}T23:59:59` : undefined,
      limit: 1000,
    })
      .then((r) => { setRows(r.trades); setTotals(r.totals); setError(null); })
      .catch((err: Error) => setError(err.message || 'Не удалось загрузить сделки'));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [from, to]);

  if (error) {
    return <AdminCard className="p-6 text-center text-[14px] text-loss">{error}</AdminCard>;
  }
  if (!rows || !totals) {
    return <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Загрузка…</AdminCard>;
  }

  const filtered = type === 'all' ? rows : rows.filter((r) => r.type === type);

  const periodTotals = totals;
  const periodBalance =
    periodTotals.deposit - periodTotals.withdrawal + periodTotals.profit + periodTotals.swap + periodTotals.commission;

  // Вклад одной строки в итог — те же категории, что и в SQL-агрегате выше
  // (deposit/withdrawal — отдельные значения type, не 'balance' со знаком).
  const contribution = (r: Pick<ApiTradeRow, 'type' | 'profit' | 'swap' | 'commission'>) => {
    const profit = Number(r.profit) || 0;
    const swap = Number(r.swap) || 0;
    const commission = Number(r.commission) || 0;
    if (r.type === 'buy' || r.type === 'sell') return { deposit: 0, withdrawal: 0, profit, swap, commission };
    if (r.type === 'balance') return { deposit: profit, withdrawal: 0, profit: 0, swap: 0, commission: 0 };
    if (r.type === 'withdrawal') return { deposit: 0, withdrawal: -profit, profit: 0, swap: 0, commission: 0 };
    return { deposit: 0, withdrawal: 0, profit: 0, swap: 0, commission: 0 };
  };

  const applyDelta = (before: ApiTradeRow, after: Pick<ApiTradeRow, 'type' | 'profit' | 'swap' | 'commission'>) => {
    const b = contribution(before);
    const a = contribution(after);
    setTotals((t) =>
      t && {
        deposit: t.deposit - b.deposit + a.deposit,
        withdrawal: t.withdrawal - b.withdrawal + a.withdrawal,
        profit: t.profit - b.profit + a.profit,
        swap: t.swap - b.swap + a.swap,
        commission: t.commission - b.commission + a.commission,
        count: t.count,
      },
    );
  };

  const openEdit = (row: ApiTradeRow) => {
    setEditTarget(row);
    setForm({
      profit: String(row.profit ?? 0),
      swap: String(row.swap ?? 0),
      commission: String(row.commission ?? 0),
      openPrice: String(row.open_price ?? 0),
      closePrice: String(row.close_price ?? 0),
      comment: row.comment ?? '',
    });
  };

  const saveEdit = () => {
    if (!editTarget) return;
    const profit = Number(form.profit.replace(',', '.'));
    const swap = Number(form.swap.replace(',', '.'));
    const commission = Number(form.commission.replace(',', '.'));
    const openPrice = Number(form.openPrice.replace(',', '.'));
    const closePrice = Number(form.closePrice.replace(',', '.'));
    if (![profit, swap, commission, openPrice, closePrice].every(Number.isFinite)) {
      showToast('Введите корректные числа');
      return;
    }
    patchTrade(editTarget.id, {
      profit, swap, commission, comment: form.comment,
      open_price: openPrice, close_price: closePrice,
    })
      .then(() => {
        applyDelta(editTarget, { type: editTarget.type, profit, swap, commission });
        setRows((prev) =>
          (prev ?? []).map((r) =>
            r.id === editTarget.id
              ? { ...r, profit, swap, commission, comment: form.comment, open_price: openPrice, close_price: closePrice, is_edited: true }
              : r,
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
        applyDelta(deleteTarget, { type: deleteTarget.type, profit: 0, swap: 0, commission: 0 });
        setRows((prev) => (prev ?? []).filter((r) => r.id !== deleteTarget.id));
        showToast(`Запись #${deleteTarget.ticket} удалена`);
        setDeleteTarget(null);
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось удалить'));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
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

      {/* Итог выше учитывает ВЕСЬ период (см. комментарий у useState totals) —
          но список ниже для правки/удаления по-прежнему ограничен LIMIT, на
          плотных по сделкам периодах может не доходить до начала диапазона. */}
      {totals.count > rows.length && (
        <p className="text-[13px] text-[#C93400]">
          В периоде {totals.count} записей, для правки показаны последние {rows.length} — сузьте диапазон дат, чтобы добраться до более старых.
        </p>
      )}

      {filtered.length === 0 ? (
        <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Ничего не найдено</AdminCard>
      ) : (
        <>
          {/* Desktop/tablet: table */}
          <AdminCard className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
                  <th className="px-5 py-3 font-medium">Тикет / Символ</th>
                  <th className="px-4 py-3 font-medium">Тип</th>
                  <th className="px-4 py-3 text-right font-medium">Цена откр.</th>
                  <th className="px-4 py-3 text-right font-medium">Цена закр.</th>
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
                    <td className="tnum px-4 py-3 text-right text-[13px] text-text-secondary">{fmtPrice(r.open_price)}</td>
                    <td className="tnum px-4 py-3 text-right text-[13px] text-text-secondary">{fmtPrice(r.close_price)}</td>
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
              </tbody>
            </table>
          </AdminCard>

          {/* Mobile: cards — заявка заказчика, таблицу со скроллом вбок было
              неудобно редактировать с телефона; тут всё в один столбец и
              кнопки «Изменить»/«Удалить» на всю ширину. */}
          <div className="flex flex-col gap-3 md:hidden">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-[10px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-black">{r.symbol || '—'}</p>
                    <p className="tnum text-[12px] text-text-secondary">
                      #{r.ticket} {r.is_edited && '· изм.'}
                    </p>
                  </div>
                  <Pill tone={TYPE_TONE[r.type] ?? 'gray'}>{r.type}</Pill>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px]">
                  <Field label="Цена откр." value={fmtPrice(r.open_price)} />
                  <Field label="Цена закр." value={fmtPrice(r.close_price)} />
                  <Field label="Прибыль" value={fmt(r.profit)} />
                  <Field label="Своп" value={fmt(r.swap)} />
                  <Field label="Комиссия" value={fmt(r.commission)} />
                  <Field
                    label="Закрыта"
                    value={r.close_time ? formatDateTime(new Date(r.close_time).getTime()) : '—'}
                  />
                </div>
                <div className="mt-3 flex gap-2 border-t border-separator pt-3">
                  <AdminButton variant="secondary" className="flex-1" onClick={() => openEdit(r)}>
                    Изменить
                  </AdminButton>
                  <button
                    type="button"
                    aria-label="Удалить"
                    onClick={() => setDeleteTarget(r)}
                    className="flex h-[38px] w-[46px] shrink-0 items-center justify-center rounded-[10px] bg-[rgba(255,59,48,0.08)] text-loss active:opacity-80"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

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
          {editTarget && (editTarget.type === 'buy' || editTarget.type === 'sell') && (
            <div className="grid grid-cols-2 gap-3">
              <AdminInput
                label="Цена открытия"
                inputMode="decimal"
                value={form.openPrice}
                onChange={(e) => setForm((f) => ({ ...f, openPrice: e.target.value }))}
              />
              <AdminInput
                label="Цена закрытия"
                inputMode="decimal"
                value={form.closePrice}
                onChange={(e) => setForm((f) => ({ ...f, closePrice: e.target.value }))}
              />
            </div>
          )}
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

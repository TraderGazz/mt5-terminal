/**
 * Admin → Торговля и история (заявка заказчика: разделить как на самом
 * сайте — «Торговля» = открытые позиции, «История» = закрытые сделки).
 * «Торговля» — живой просмотр /api/positions: открыть/закрыть реальную
 * сделку (настоящий ордер брокеру), плюс косметическая правка цены
 * открытия/прибыли отдельной открытой позиции (витрина, без реального
 * ордера — см. server/routes/trading.js PATCH /position/:ticket). «История» — реальный
 * список строк из таблицы `trades` (сделки И балансовые операции —
 * депозиты/снятия хранятся там же с type='balance'/'withdrawal'), с
 * возможностью найти и поправить/удалить любую запись, включая цену
 * открытия/закрытия — заявка заказчика. Итог «Депозит/Снятие» в шапке при
 * этом СЧИТАЕТСЯ НЕ из этих строк, а из той же выписки заказчика, что и на
 * сайте (depositLedger.ts) — EA-синхронизированные balance-записи в БД
 * подтверждённо ненадёжны для этих сумм (см. depositLedger.ts).
 */
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { depositTotalsForRange } from '@/data/depositLedger';
import {
  getTrades,
  getPositions,
  patchTrade,
  deleteTrade,
  createTrade,
  openTrade,
  closeTrade,
  updatePositionOverride,
  clearPositionOverride,
  type ApiTradeRow,
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
  dealType: string;
}

// Переклассификация допустима только внутри "небиржевой" группы — заявка
// заказчика: синхронизированные с терминала balance-записи (часто с
// комментарием вроде "demo deposit") нужно руками раскидать по CFD или
// пополнению. buy/sell сюда не входят — смена направления сделки ломает
// сопоставление позиций.
const RECLASSIFIABLE_TYPES = ['balance', 'withdrawal', 'cfd'] as const;

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
  // Косметическая правка открытой позиции (заявка заказчика) — цена
  // открытия и/или прибыль "как будто", реальная позиция у брокера не
  // трогается (см. server/routes/trading.js PATCH /position/:ticket).
  const [editTarget, setEditTarget] = useState<ApiPosition | null>(null);
  const [editForm, setEditForm] = useState({ openPrice: '', profit: '' });
  const [savingEdit, setSavingEdit] = useState(false);

  const load = () => {
    getPositions()
      .then((p) => { setPositions(p); setError(null); })
      .catch((err: Error) => setError(err.message || 'Не удалось загрузить позиции'));
  };

  useEffect(load, []);

  const openEdit = (p: ApiPosition) => {
    setEditTarget(p);
    setEditForm({ openPrice: String(p.openPrice), profit: String(p.profit) });
  };

  const submitEdit = () => {
    if (!editTarget) return;
    const openPrice = Number(editForm.openPrice.replace(',', '.'));
    const profit = Number(editForm.profit.replace(',', '.'));
    if (!Number.isFinite(openPrice) || !Number.isFinite(profit)) {
      showToast('Введите корректные числа');
      return;
    }
    setSavingEdit(true);
    updatePositionOverride(editTarget.id, { openPrice, profit })
      .then(() => {
        showToast(`Позиция #${editTarget.id} изменена`);
        setEditTarget(null);
        load();
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось сохранить'))
      .finally(() => setSavingEdit(false));
  };

  const resetEdit = () => {
    if (!editTarget) return;
    setSavingEdit(true);
    clearPositionOverride(editTarget.id)
      .then(() => {
        showToast(`Позиция #${editTarget.id}: правки сброшены`);
        setEditTarget(null);
        load();
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось сбросить'))
      .finally(() => setSavingEdit(false));
  };

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

      {/* Правка витрины открытой позиции — реального ордера не уходит */}
      <AdminModal
        open={editTarget !== null}
        onClose={() => !savingEdit && setEditTarget(null)}
        title={editTarget ? `#${editTarget.id} · ${editTarget.symbol}` : ''}
        footer={
          <>
            <AdminButton variant="secondary" onClick={resetEdit} disabled={savingEdit}>
              Сбросить к реальным
            </AdminButton>
            <AdminButton onClick={submitEdit} disabled={savingEdit}>
              {savingEdit ? 'Сохраняю…' : 'Сохранить'}
            </AdminButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <AdminInput
            label="Цена открытия"
            inputMode="decimal"
            value={editForm.openPrice}
            onChange={(e) => setEditForm((f) => ({ ...f, openPrice: e.target.value }))}
          />
          <AdminInput
            label="Прибыль / убыток"
            inputMode="decimal"
            value={editForm.profit}
            onChange={(e) => setEditForm((f) => ({ ...f, profit: e.target.value }))}
          />
          <p className="text-[13px] leading-[18px] text-text-secondary">
            Это витрина (что видят сайт и админка) — реальная позиция у
            брокера не меняется. Прибыль дальше продолжит двигаться вместе
            с рынком от заданного здесь значения.
          </p>
        </div>
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
                      <div className="flex justify-end gap-1">
                        <AdminButton variant="text" onClick={() => openEdit(p)}>
                          Изменить
                        </AdminButton>
                        <AdminButton variant="destructive" onClick={() => setCloseTarget(p)}>
                          Закрыть
                        </AdminButton>
                      </div>
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
                <div className="mt-3 flex gap-2 border-t border-separator pt-3">
                  <AdminButton variant="secondary" className="flex-1" onClick={() => openEdit(p)}>
                    Изменить
                  </AdminButton>
                  <AdminButton variant="destructive" className="flex-1" onClick={() => setCloseTarget(p)}>
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
    profit: '', swap: '', commission: '', openPrice: '', closePrice: '', comment: '', dealType: '',
  });
  const [deleteTarget, setDeleteTarget] = useState<ApiTradeRow | null>(null);
  // Ручное добавление депозита/снятия/CFD — заявка заказчика.
  const [addModal, setAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ dealType: 'balance' as 'balance' | 'withdrawal' | 'cfd', amount: '', date: '', comment: '' });
  const [adding, setAdding] = useState(false);
  // Прибыль/своп/комиссия по ВСЕМУ периоду — считает сервер агрегатом по всей
  // БД (не зависит от LIMIT ниже). На плотных периодах сделок может быть в
  // разы больше лимита строк для отображения — если считать итог из `rows`,
  // хвост периода тихо выпадал бы из суммы. Живой пересчёт после правки/
  // удаления — через дельту сюда же, без повторного похода на сервер (заявка
  // заказчика: сумма обновляется сразу же после любой правки).
  const [totals, setTotals] = useState<{ profit: number; swap: number; commission: number; cfd: number; count: number } | null>(null);

  const load = () => {
    getTrades({
      period: from || to ? undefined : 'all',
      from: from || undefined,
      to: to ? `${to}T23:59:59` : undefined,
      limit: 1000,
    })
      .then((r) => {
        setRows(r.trades);
        // Postgres DECIMAL -> строка в JSON (см. fmt() выше) — periodBalance
        // ниже делает арифметику напрямую над totals, без fmt(), поэтому
        // коэрсить в число нужно сразу тут, один раз, а не в каждом месте
        // использования: иначе "0" + "21211640.90" склеивается как строка.
        setTotals({
          profit: Number(r.totals.profit) || 0,
          swap: Number(r.totals.swap) || 0,
          commission: Number(r.totals.commission) || 0,
          cfd: Number(r.totals.cfd) || 0,
          count: Number(r.totals.count) || 0,
        });
        setError(null);
      })
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

  const filtered = type === 'all' ? rows : rows.filter((r) => r.deal_type === type);

  // Депозит/снятие — ТОЛЬКО из официальной выписки заказчика (тот же
  // источник, что и на сайте, см. depositLedger.ts), не из таблицы `trades`:
  // EA-синхронизированные balance-записи там подтверждённо ненадёжны (см.
  // комментарий в depositLedger.ts) — заявка заказчика: "снятия и пополнения
  // должны браться из файла для расчёта". Пустой from/to = весь период
  // выписки целиком (как «Все» на сайте).
  const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
  const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
  const ledger = depositTotalsForRange(fromMs, toMs);

  const periodTotals = { deposit: ledger.deposit, withdrawal: ledger.withdrawal, ...totals };
  const periodBalance =
    periodTotals.deposit -
    periodTotals.withdrawal +
    periodTotals.profit +
    periodTotals.swap +
    periodTotals.commission +
    periodTotals.cfd;

  // Вклад одной строки в итог сделок (buy/sell) и CFD-корректировок —
  // депозит/снятие сюда не входят (см. выше), редактирование строки
  // deal_type='balance'/'withdrawal' в таблице ниже не двигает итог, только
  // саму запись в БД.
  const contribution = (r: Pick<ApiTradeRow, 'deal_type' | 'profit' | 'swap' | 'commission'>) => {
    const profit = Number(r.profit) || 0;
    if (r.deal_type === 'buy' || r.deal_type === 'sell') {
      return { profit, swap: Number(r.swap) || 0, commission: Number(r.commission) || 0, cfd: 0 };
    }
    if (r.deal_type === 'cfd') return { profit: 0, swap: 0, commission: 0, cfd: profit };
    return { profit: 0, swap: 0, commission: 0, cfd: 0 };
  };

  type Contributor = Pick<ApiTradeRow, 'deal_type' | 'profit' | 'swap' | 'commission'>;
  const applyDelta = (before: Contributor, after: Contributor) => {
    const b = contribution(before);
    const a = contribution(after);
    setTotals((t) =>
      t && {
        ...t,
        profit: t.profit - b.profit + a.profit,
        swap: t.swap - b.swap + a.swap,
        commission: t.commission - b.commission + a.commission,
        cfd: t.cfd - b.cfd + a.cfd,
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
      // Заявка заказчика: "нигде в админке не должно быть demo" — синхронизированные
      // с терминала записи (напр. с комментарием "demo deposit") скрывают это
      // слово автоматически при показе. Сохраняется обратно только если админ
      // сам впишет что-то новое в это поле.
      comment: (row.comment ?? '').replace(/\bdemo\b/gi, '').replace(/\s+/g, ' ').trim(),
      dealType: row.deal_type,
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
    const dealTypeChanged = form.dealType !== editTarget.deal_type;
    patchTrade(editTarget.id, {
      profit, swap, commission, comment: form.comment,
      open_price: openPrice, close_price: closePrice,
      ...(dealTypeChanged ? { deal_type: form.dealType } : {}),
    })
      .then(() => {
        applyDelta(editTarget, { deal_type: form.dealType, profit, swap, commission });
        setRows((prev) =>
          (prev ?? []).map((r) =>
            r.id === editTarget.id
              ? {
                  ...r,
                  profit, swap, commission, comment: form.comment,
                  open_price: openPrice, close_price: closePrice, is_edited: true,
                  deal_type: form.dealType,
                }
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
        applyDelta(deleteTarget, { deal_type: deleteTarget.deal_type, profit: 0, swap: 0, commission: 0 });
        setRows((prev) => (prev ?? []).filter((r) => r.id !== deleteTarget.id));
        showToast(`Запись #${deleteTarget.ticket} удалена`);
        setDeleteTarget(null);
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось удалить'));
  };

  const submitAdd = () => {
    const raw = Number(addForm.amount.replace(',', '.'));
    if (!Number.isFinite(raw) || (addForm.dealType !== 'cfd' && raw <= 0)) {
      showToast('Введите корректную сумму');
      return;
    }
    if (!addForm.date) {
      showToast('Укажите дату');
      return;
    }
    // Снятие храним отрицательным profit (см. SUM(-profit) в totals на
    // сервере) — админ вводит положительную сумму, знак подставляем сами.
    const profit = addForm.dealType === 'withdrawal' ? -Math.abs(raw) : raw;
    const iso = new Date(`${addForm.date}T12:00:00`).toISOString();
    setAdding(true);
    createTrade({
      // Синтетический отрицательный тикет — реальные тикеты MT5 всегда положительные.
      ticket: -Date.now(),
      deal_type: addForm.dealType,
      symbol: '',
      profit,
      swap: 0,
      commission: 0,
      open_time: iso,
      close_time: iso,
      comment: addForm.comment,
    })
      .then((r) => {
        setRows((prev) => [r.trade, ...(prev ?? [])]);
        applyDelta({ deal_type: '', profit: 0, swap: 0, commission: 0 }, { deal_type: addForm.dealType, profit, swap: 0, commission: 0 });
        showToast('Запись добавлена');
        setAddModal(false);
        setAddForm({ dealType: 'balance', amount: '', date: '', comment: '' });
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось добавить'))
      .finally(() => setAdding(false));
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <AdminButton
          variant="secondary"
          onClick={() => { setAddForm({ dealType: 'balance', amount: '', date: '', comment: '' }); setAddModal(true); }}
        >
          Добавить запись
        </AdminButton>
        <SegmentedControl<TypeFilter>
          value={type}
          onChange={setType}
          className="w-auto"
          options={[
            { value: 'all', label: 'Все' },
            { value: 'balance', label: 'депозит' },
            { value: 'withdrawal', label: 'снятие' },
            { value: 'cfd', label: 'CFD' },
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
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-separator px-4 py-3 sm:grid-cols-3 md:grid-cols-7">
          <TotalStat label="Депозит" value={periodTotals.deposit} />
          <TotalStat label="Снятие" value={periodTotals.withdrawal} />
          <TotalStat label="Прибыль" value={periodTotals.profit} />
          <TotalStat label="Своп" value={periodTotals.swap} />
          <TotalStat label="Комиссия" value={periodTotals.commission} />
          <TotalStat label="CFD" value={periodTotals.cfd} />
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
                      <Pill tone={TYPE_TONE[r.deal_type] ?? 'gray'}>{r.deal_type}</Pill>
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
                  <Pill tone={TYPE_TONE[r.deal_type] ?? 'gray'}>{r.deal_type}</Pill>
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
        title={editTarget ? `#${editTarget.ticket} · ${editTarget.symbol || editTarget.deal_type}` : ''}
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
          {editTarget && RECLASSIFIABLE_TYPES.includes(editTarget.deal_type as (typeof RECLASSIFIABLE_TYPES)[number]) && (
            <div>
              <span className="mb-1 block text-[13px] text-text-secondary">Тип</span>
              <SegmentedControl<(typeof RECLASSIFIABLE_TYPES)[number]>
                value={form.dealType as (typeof RECLASSIFIABLE_TYPES)[number]}
                onChange={(v) => setForm((f) => ({ ...f, dealType: v }))}
                options={[
                  { value: 'balance', label: 'Пополнение' },
                  { value: 'withdrawal', label: 'Снятие' },
                  { value: 'cfd', label: 'CFD' },
                ]}
              />
              <p className="mt-1 text-[12px] text-text-secondary">
                Для строк, пришедших с терминала (например с комментарием
                «demo deposit») — раскидать по нужной категории.
              </p>
            </div>
          )}
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
            Удалить {deleteTarget.deal_type === 'balance' ? 'депозит' : deleteTarget.deal_type === 'withdrawal' ? 'снятие' : 'сделку'} #{deleteTarget.ticket}{' '}
            ({fmt(deleteTarget.profit)})? Действие необратимо.
          </p>
        )}
      </AdminModal>

      {/* Добавить запись — депозит/снятие/CFD вручную */}
      <AdminModal
        open={addModal}
        onClose={() => !adding && setAddModal(false)}
        title="Добавить запись"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setAddModal(false)} disabled={adding}>
              Отмена
            </AdminButton>
            <AdminButton onClick={submitAdd} disabled={adding}>
              {adding ? 'Добавляю…' : 'Добавить'}
            </AdminButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <span className="mb-1 block text-[13px] text-text-secondary">Тип</span>
            <SegmentedControl<'balance' | 'withdrawal' | 'cfd'>
              value={addForm.dealType}
              onChange={(v) => setAddForm((f) => ({ ...f, dealType: v }))}
              options={[
                { value: 'balance', label: 'Пополнение' },
                { value: 'withdrawal', label: 'Снятие' },
                { value: 'cfd', label: 'CFD' },
              ]}
            />
          </div>
          <AdminInput
            label="Сумма"
            inputMode="decimal"
            value={addForm.amount}
            onChange={(e) => setAddForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder={addForm.dealType === 'cfd' ? 'может быть отрицательной' : 'положительное число'}
          />
          <AdminInput
            label="Дата"
            type="date"
            value={addForm.date}
            onChange={(e) => setAddForm((f) => ({ ...f, date: e.target.value }))}
          />
          <AdminInput
            label="Комментарий"
            value={addForm.comment}
            onChange={(e) => setAddForm((f) => ({ ...f, comment: e.target.value }))}
          />
        </div>
      </AdminModal>
    </div>
  );
}

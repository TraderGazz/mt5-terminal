/**
 * Admin → Редактирование баланса (admin.md §10.4): manual edit form with
 * live preview of the Trade page balance block, save confirmation modal.
 */
import { motion } from 'framer-motion';
import { useMemo, useState, type ChangeEvent } from 'react';
import { ACCOUNT, ADMIN_USERS, type ImportLogEntry } from '@/mocks';
import { formatMoney } from '@/lib/format';
import { AdminButton, AdminCard, AdminInput, AdminModal } from './bits';

interface BalanceForm {
  balance: string;
  equity: string;
  margin: string;
  freeMargin: string;
  marginLevel: string;
}

const toForm = (): BalanceForm => ({
  balance: String(ACCOUNT.balance),
  equity: String(ACCOUNT.equity),
  margin: String(ACCOUNT.margin),
  freeMargin: String(ACCOUNT.freeMargin),
  marginLevel: String(ACCOUNT.marginLevel),
});

function parse(v: string): number {
  const n = Number(v.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function PreviewRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-[7px]">
      <span className="text-[13px] text-text-secondary">{label}</span>
      <motion.span
        key={`${value}`}
        initial={{ opacity: 0.2 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="tnum text-[14px] font-medium text-black"
      >
        {formatMoney(value)}
      </motion.span>
    </div>
  );
}

export default function BalanceSection({
  showToast,
  onBalanceSaved,
}: {
  showToast: (msg: string) => void;
  onBalanceSaved: (entry: ImportLogEntry) => void;
}) {
  const traderUsers = ADMIN_USERS.filter((u) => u.role !== 'viewer');
  const [userId, setUserId] = useState(traderUsers[0]?.id ?? 1);
  const [form, setForm] = useState<BalanceForm>(toForm);
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const user = traderUsers.find((u) => u.id === userId) ?? traderUsers[0];

  const values = useMemo(
    () => ({
      balance: parse(form.balance),
      equity: parse(form.equity),
      margin: parse(form.margin),
      freeMargin: parse(form.freeMargin),
      marginLevel: parse(form.marginLevel),
    }),
    [form],
  );

  const set = (key: keyof BalanceForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const save = () => {
    setConfirmOpen(false);
    onBalanceSaved({
      id: 1000 + Date.now() % 100000,
      time: Date.now(),
      source: 'manual',
      fileName: null,
      records: 1,
      status: 'ok',
      message: `Ручная правка баланса · счёт ${user?.login ?? ''}${reason.trim() ? ` · ${reason.trim()}` : ''}`,
    });
    showToast('Баланс обновлён');
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
        Редактирование баланса
      </h1>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Form */}
        <AdminCard title="Ручное изменение баланса">
          <div className="flex flex-col gap-3 p-5">
            <label className="block">
              <span className="mb-1 block text-[13px] text-text-secondary">Пользователь</span>
              <select
                value={userId}
                onChange={(e) => setUserId(Number(e.target.value))}
                className="h-10 w-full rounded-[10px] bg-fill px-3 text-[15px] text-black outline-none focus:ring-2 focus:ring-accent/40"
              >
                {traderUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.login}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <AdminInput label="Баланс" suffix="₽" inputMode="decimal" value={form.balance} onChange={set('balance')} />
              <AdminInput label="Средства" suffix="₽" inputMode="decimal" value={form.equity} onChange={set('equity')} />
              <AdminInput label="Маржа" suffix="₽" inputMode="decimal" value={form.margin} onChange={set('margin')} />
              <AdminInput label="Свободная маржа" suffix="₽" inputMode="decimal" value={form.freeMargin} onChange={set('freeMargin')} />
              <AdminInput label="Уровень маржи" suffix="%" inputMode="decimal" value={form.marginLevel} onChange={set('marginLevel')} />
            </div>
            <label className="block">
              <span className="mb-1 block text-[13px] text-text-secondary">Причина изменения</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Например: корректировка по запросу клиента"
                className="w-full resize-none rounded-[10px] bg-fill px-3 py-2 text-[15px] text-black outline-none placeholder:text-text-secondary focus:ring-2 focus:ring-accent/40"
              />
            </label>
            <AdminButton onClick={() => setConfirmOpen(true)} className="mt-1 self-end">
              Сохранить
            </AdminButton>
          </div>
        </AdminCard>

        {/* Live preview */}
        <AdminCard title="Как увидит пользователь">
          <div className="p-5">
            <div className="rounded-[10px] bg-bg-secondary p-4">
              <p className="text-[13px] text-text-secondary">
                {user?.name} · <span className="tnum">{user?.login}</span>
              </p>
              <p className="tnum mt-1 text-[28px] font-semibold tracking-[-0.5px] text-black">
                {formatMoney(values.equity)}
              </p>
              <div className="mt-3 divide-y divide-separator/70">
                <PreviewRow label="Баланс" value={values.balance} />
                <PreviewRow label="Средства" value={values.equity} />
                <PreviewRow label="Маржа" value={values.margin} />
                <PreviewRow label="Свободная маржа" value={values.freeMargin} />
                <div className="flex items-center justify-between py-[7px]">
                  <span className="text-[13px] text-text-secondary">Уровень маржи</span>
                  <motion.span
                    key={`${values.marginLevel}`}
                    initial={{ opacity: 0.2 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.3 }}
                    className="tnum text-[14px] font-medium text-black"
                  >
                    {values.marginLevel.toFixed(2)} %
                  </motion.span>
                </div>
              </div>
            </div>
            <p className="mt-3 text-[12px] leading-[16px] text-text-secondary">
              Значения обновляются в превью сразу при вводе. После сохранения
              изменения уйдут в терминал и на сайт АльфаФорекс через автообмен.
            </p>
          </div>
        </AdminCard>
      </div>

      <AdminModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Подтверждение"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setConfirmOpen(false)}>
              Отмена
            </AdminButton>
            <AdminButton onClick={save}>Сохранить</AdminButton>
          </>
        }
      >
        <p className="text-[14px] leading-[20px] text-black">
          Изменения уйдут в терминал и на сайт АльфаФорекс через автообмен.
          Продолжить?
        </p>
      </AdminModal>
    </div>
  );
}

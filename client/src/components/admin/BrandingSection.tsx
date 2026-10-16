/**
 * Admin → Брендинг (заявка заказчика 2026-10-16): название компании,
 * сервера, номер счёта — то, что видно на мобильном/ПК сайте. Чисто
 * отображение: не переключает реальный счёт/брокера (это отдельная ручная
 * операция — вход в EA-терминал через VNC), только правит текст на витрине.
 * См. server/routes/account.js — эти поля читаются оттуда с приоритетом.
 */
import { useEffect, useState } from 'react';
import { AdminButton, AdminCard, AdminInput } from './bits';
import { getBranding, updateBranding, type ApiBranding } from '@/api/admin';

const EMPTY: ApiBranding = { account_number: '', holder: '', company: '', server: '', access_server: '' };

export default function BrandingSection({ showToast }: { showToast: (msg: string) => void }) {
  const [form, setForm] = useState<ApiBranding>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBranding()
      .then((b) => setForm(b))
      .catch(() => showToast('Не удалось загрузить брендинг'))
      .finally(() => setLoaded(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (key: keyof ApiBranding) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = () => {
    setSaving(true);
    updateBranding(form)
      .then((b) => {
        setForm(b);
        showToast('Брендинг сохранён');
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось сохранить'))
      .finally(() => setSaving(false));
  };

  if (!loaded) return <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Загрузка…</AdminCard>;

  return (
    <AdminCard title="Брендинг" className="max-w-[520px]">
      <div className="flex flex-col gap-3 p-5">
        <p className="text-[13px] leading-[18px] text-text-secondary">
          Эти поля влияют только на то, что видит заказчик на сайте (мобильная
          версия и ПК) — название брокера, сервера и номер счёта. Реальный
          торговый счёт/брокер, к которому подключён мост, это не меняет.
        </p>
        <AdminInput label="Название компании" value={form.company} onChange={set('company')} />
        <AdminInput label="Имя держателя счёта" value={form.holder} onChange={set('holder')} />
        <AdminInput label="Название сервера" value={form.server} onChange={set('server')} />
        <AdminInput label="Сервер подключения (в Навигаторе)" value={form.access_server} onChange={set('access_server')} />
        <AdminInput label="Номер счёта" value={form.account_number} onChange={set('account_number')} />
        <div className="flex justify-end pt-2">
          <AdminButton onClick={save} disabled={saving}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </AdminButton>
        </div>
      </div>
    </AdminCard>
  );
}

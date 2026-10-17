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

const EMPTY: ApiBranding = {
  display_login: '',
  holder: '',
  company: '',
  server: '',
  access_server: '',
  email: '',
  phone: '',
};

// Заявка: "постоянно вбивать данные долго" — готовые пресеты, один клик
// сразу сохраняет (не просто подставляет в форму). Реальный счёт/мост это
// не переключает — только то, что видно на сайте (см. верхний комментарий).
const PRESETS: Record<string, ApiBranding> = {
  'АльфаФорекс': {
    display_login: '',
    holder: 'Чулюков Сергей Анатольевич',
    company: 'ООО «Альфа-Форекс»',
    server: 'AlfaForexRU-Real',
    access_server: 'RFD Access Server 1',
    email: '',
    phone: '',
  },
  FxPro: {
    display_login: '516924314',
    holder: 'Sergey Chulyukov',
    company: 'FxPro Markets Ltd.',
    server: 'FxPro-MT5',
    access_server: 'MT5 London',
    email: 'dlypisem2008@gmail.com',
    phone: '+79611830003',
  },
};

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

  const applyPreset = (name: string) => {
    setSaving(true);
    updateBranding(PRESETS[name])
      .then((b) => {
        setForm(b);
        showToast(`Применено: ${name}`);
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось сохранить'))
      .finally(() => setSaving(false));
  };

  if (!loaded) return <AdminCard className="p-6 text-center text-[14px] text-text-secondary">Загрузка…</AdminCard>;

  return (
    <AdminCard title="Брендинг" className="max-w-[520px]">
      <div className="flex flex-col gap-3 p-5">
        <div className="flex gap-2 pb-1">
          {Object.keys(PRESETS).map((name) => (
            <AdminButton key={name} variant="secondary" onClick={() => applyPreset(name)} disabled={saving}>
              {name}
            </AdminButton>
          ))}
        </div>
        <AdminInput label="Название компании" value={form.company} onChange={set('company')} />
        <AdminInput label="Имя держателя счёта" value={form.holder} onChange={set('holder')} />
        <AdminInput label="Название сервера" value={form.server} onChange={set('server')} />
        <AdminInput label="Сервер подключения (в Навигаторе)" value={form.access_server} onChange={set('access_server')} />
        <AdminInput label="Номер счёта" value={form.display_login} onChange={set('display_login')} />
        {/* Заказчик: "Телефон и почту не нужно указывать [на сайте], но в
            админке сделайте возможность" — эти два поля нигде не
            отображаются на мобильной/ПК версии, только хранятся здесь. */}
        <AdminInput label="Email (не отображается на сайте)" value={form.email} onChange={set('email')} />
        <AdminInput label="Телефон (не отображается на сайте)" value={form.phone} onChange={set('phone')} />
        <div className="flex justify-end pt-2">
          <AdminButton onClick={save} disabled={saving}>
            {saving ? 'Сохраняю…' : 'Сохранить'}
          </AdminButton>
        </div>
      </div>
    </AdminCard>
  );
}

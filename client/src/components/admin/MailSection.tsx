/**
 * Admin → Почта (заявка заказчика 2026-10-17): системные сообщения,
 * которые видит клиент в «Настройки → Почта». Простой список + форма
 * добавления, без редактирования (создал — удалил и написал заново).
 */
import { useEffect, useState } from 'react';
import { AdminButton, AdminCard } from './bits';
import { getAdminMail, createMailMessage, deleteMailMessage, type ApiMailMessage } from '@/api/admin';
import { formatDateTime } from '@/lib/format';

export default function MailSection({ showToast }: { showToast: (msg: string) => void }) {
  const [items, setItems] = useState<ApiMailMessage[] | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => getAdminMail().then(setItems).catch(() => showToast('Не удалось загрузить почту'));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = () => {
    if (!subject.trim()) {
      showToast('Укажите тему письма');
      return;
    }
    setSaving(true);
    createMailMessage({ subject: subject.trim(), body })
      .then(() => {
        setSubject('');
        setBody('');
        showToast('Письмо отправлено');
        return load();
      })
      .catch((err: Error) => showToast(err.message || 'Не удалось отправить'))
      .finally(() => setSaving(false));
  };

  const remove = (id: number) => {
    deleteMailMessage(id)
      .then(() => load())
      .catch((err: Error) => showToast(err.message || 'Не удалось удалить'));
  };

  return (
    <div className="flex flex-col gap-4">
      <AdminCard title="Новое письмо" className="max-w-[560px]">
        <div className="flex flex-col gap-3 p-5">
          <label className="block">
            <span className="mb-1 block text-[13px] text-text-secondary">Тема</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-10 w-full rounded-[10px] bg-fill px-3 text-[15px] text-black outline-none focus:ring-2 focus:ring-accent/40"
              placeholder="Например: Добро пожаловать в торговую платформу"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] text-text-secondary">Текст письма</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              className="w-full resize-none rounded-[10px] bg-fill px-3 py-2 text-[15px] text-black outline-none focus:ring-2 focus:ring-accent/40"
            />
          </label>
          <div className="flex justify-end">
            <AdminButton onClick={send} disabled={saving}>
              {saving ? 'Отправляю…' : 'Отправить'}
            </AdminButton>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Отправленные письма">
        {items == null && <p className="p-5 text-[14px] text-text-secondary">Загрузка…</p>}
        {items != null && items.length === 0 && (
          <p className="p-5 text-[14px] text-text-secondary">Писем ещё нет</p>
        )}
        {items != null &&
          items.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-start justify-between gap-3 px-5 py-3 ${i > 0 ? 'border-t border-separator' : ''}`}
            >
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-black">{item.subject}</p>
                <p className="mt-0.5 line-clamp-2 text-[13px] text-text-secondary">{item.body}</p>
                <p className="mt-0.5 text-[12px] text-text-secondary">{formatDateTime(new Date(item.created_at))}</p>
              </div>
              <AdminButton variant="text" onClick={() => remove(item.id)}>
                Удалить
              </AdminButton>
            </div>
          ))}
      </AdminCard>
    </div>
  );
}

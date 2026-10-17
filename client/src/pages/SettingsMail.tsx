import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';
import PageLoading from '@/components/PageLoading';
import { getMail, type ApiMailMessage } from '@/api/rest';
import { formatDateTime } from '@/lib/format';

/**
 * «Настройки → Почта» (заявка заказчика 2026-10-17: раньше была заглушка
 * «Режим просмотра»). Реальные системные сообщения — пишет админ через
 * панель (см. components/admin/MailSection.tsx), клиент читает список и
 * разворачивает текст письма по тапу.
 */
export default function SettingsMailPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ApiMailMessage[] | null>(null);
  const [error, setError] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMail()
      .then((r) => {
        if (!cancelled) setItems(r.items);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="Почта" solid left={<BackButton onClick={() => navigate(-1)} />} />
      {items == null && !error && <PageLoading />}
      {error && (
        <p className="px-5 py-8 text-center text-[15px] text-text-secondary">
          Не удалось загрузить почту. Потяните вниз, чтобы попробовать ещё раз.
        </p>
      )}
      {items != null && (
        <div className="mx-4 mt-4 overflow-hidden rounded-[14px] bg-white">
          {items.map((item, i) => {
            const open = openId === item.id;
            return (
              <div key={item.id} className={i > 0 ? 'border-t-[0.5px] border-separator' : ''}>
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : item.id)}
                  className="block w-full px-4 py-3 text-left active:bg-[#D9D9DE]"
                >
                  <span className="block text-[15px] leading-[19px] tracking-[-0.24px] text-black">
                    {item.subject}
                  </span>
                  <span className="mt-1 block text-[12px] leading-[14px] text-text-secondary">
                    {formatDateTime(new Date(item.created_at))}
                  </span>
                </button>
                {open && (
                  <p className="whitespace-pre-wrap px-4 pb-4 text-[14px] leading-[19px] text-black">
                    {item.body}
                  </p>
                )}
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-text-secondary">Пока нет писем</p>
          )}
        </div>
      )}
    </div>
  );
}

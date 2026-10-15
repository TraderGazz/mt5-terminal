import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';
import PageLoading from '@/components/PageLoading';
import { getNews, type ApiNewsItem } from '@/api/rest';
import { formatDateTime } from '@/lib/format';

/**
 * «Настройки → Новости» (заявка заказчика: раньше была заглушка «Режим
 * просмотра»). Реальная лента финансовых новостей с backend (/api/news,
 * публичный RSS FXStreet без ключа) — список заголовков, тап открывает
 * первоисточник в новой вкладке.
 */
export default function SettingsNewsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ApiNewsItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNews()
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
      <NavBar title="Новости" solid left={<BackButton onClick={() => navigate(-1)} />} />
      {items == null && !error && <PageLoading />}
      {error && (
        <p className="px-5 py-8 text-center text-[15px] text-text-secondary">
          Не удалось загрузить новости. Потяните вниз, чтобы попробовать ещё раз.
        </p>
      )}
      {items != null && (
        <div className="mx-4 mt-4 overflow-hidden rounded-[14px] bg-white">
          {items.map((item, i) => (
            <a
              key={item.link}
              href={item.link}
              target="_blank"
              rel="noreferrer"
              className={`block px-4 py-3 active:bg-[#D9D9DE] ${i > 0 ? 'border-t-[0.5px] border-separator' : ''}`}
            >
              <span className="block text-[15px] leading-[19px] tracking-[-0.24px] text-black">
                {item.title}
              </span>
              <span className="mt-1 block text-[12px] leading-[14px] text-text-secondary">
                {formatDateTime(new Date(item.pubDate))}
              </span>
            </a>
          ))}
          {items.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-text-secondary">Пока нет новостей</p>
          )}
        </div>
      )}
    </div>
  );
}

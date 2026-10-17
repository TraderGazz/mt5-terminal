import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';

/**
 * «Настройки → Сообщество трейдеров» (заявка заказчика 2026-10-17: вместо
 * заглушки «Режим просмотра» — информационный текст).
 */
export default function SettingsCommunityPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="Сообщество трейдеров" solid left={<BackButton onClick={() => navigate(-1)} />} />
      <div className="mx-4 mt-4 overflow-hidden rounded-[14px] bg-white px-4 py-4">
        <p className="text-[14px] leading-[19px] text-black">
          Сообщество трейдеров MQL5.community объединяет пользователей
          MetaTrader со всего мира: форум, торговые сигналы, рейтинги
          управляющих счетами и обмен опытом.
        </p>
        <p className="mt-3 text-[14px] leading-[19px] text-black">
          Раздел носит справочный характер в этой версии терминала.
        </p>
      </div>
    </div>
  );
}

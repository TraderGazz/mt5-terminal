import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';

/**
 * «Настройки → Чат и сообщения» (заявка заказчика 2026-10-17: вместо
 * заглушки «Режим просмотра» — информационный текст, т.к. настоящая
 * переписка привязана к аккаунту MQL5.community, который мы не используем).
 */
export default function SettingsChatPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="Чат и сообщения" solid left={<BackButton onClick={() => navigate(-1)} />} />
      <div className="mx-4 mt-4 overflow-hidden rounded-[14px] bg-white px-4 py-4">
        <p className="text-[14px] leading-[19px] text-black">
          Чат и сообщения в MetaTrader 5 работают через аккаунт MQL5.community —
          там можно переписываться с другими трейдерами и получать уведомления
          от сервисов платформы.
        </p>
        <p className="mt-3 text-[14px] leading-[19px] text-black">
          В этой версии терминала раздел носит справочный характер. Если
          потребуется написать нам напрямую — используйте контакты, указанные
          в разделе «Профиль».
        </p>
      </div>
    </div>
  );
}

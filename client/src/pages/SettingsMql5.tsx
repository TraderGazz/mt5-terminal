import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';

/**
 * «Настройки → MQL5 Algo Trading» (заявка заказчика 2026-10-17: вместо
 * заглушки «Режим просмотра» — информационный текст, т.к. запуск торговых
 * роботов завязан на компилятор MQL5 и VPS-инфраструктуру MetaQuotes).
 */
export default function SettingsMql5Page() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="MQL5 Algo Trading" solid left={<BackButton onClick={() => navigate(-1)} />} />
      <div className="mx-4 mt-4 overflow-hidden rounded-[14px] bg-white px-4 py-4">
        <p className="text-[14px] leading-[19px] text-black">
          MQL5 Algo Trading позволяет запускать торговых роботов (советников) и
          технические индикаторы, написанные на языке MQL5, в том числе на
          удалённых VPS-серверах MetaQuotes.
        </p>
        <p className="mt-3 text-[14px] leading-[19px] text-black">
          Раздел носит справочный характер в этой версии терминала.
        </p>
      </div>
    </div>
  );
}

import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';

/**
 * «Настройки → Новый счёт» (заявка заказчика 2026-10-20: вместо попапа
 * «Режим просмотра» — просто пустая вкладка, т.к. открытие счёта у брокера
 * нам недоступно). Открытие нового демо/реального счёта делается у брокера
 * напрямую, не через этот сайт.
 */
export default function SettingsNewAccountPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="Новый счет" solid left={<BackButton onClick={() => navigate(-1)} />} />
    </div>
  );
}

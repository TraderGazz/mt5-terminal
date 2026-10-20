import { useNavigate } from 'react-router';
import NavBar, { BackButton } from '@/components/NavBar';

/**
 * «Настройки → Чарты» (заявка заказчика 2026-10-20: вместо попапа «Режим
 * просмотра» — просто пустая вкладка). Настройки графика (цвета/сетка/тип)
 * — отдельная, более крупная задача, вынесена за рамки текущей работы.
 */
export default function SettingsChartsPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-bg-grouped">
      <NavBar title="Чарты" solid left={<BackButton onClick={() => navigate(-1)} />} />
    </div>
  );
}

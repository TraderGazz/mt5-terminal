import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import Layout from '@/components/Layout';
import { IS_API } from '@/config';
import { isAuthed } from '@/api/auth';
import QuotesPage from '@/pages/Quotes';
import ChartPage from '@/pages/Chart';
import TradePage from '@/pages/Trade';
import TradeDetailPage from '@/pages/TradeDetail';
import TradeEditPage from '@/pages/TradeEdit';
import HistoryPage from '@/pages/History';
import HistoryPeriodPage from '@/pages/HistoryPeriod';
import SettingsPage from '@/pages/Settings';
import LoginPage from '@/pages/Login';
import AccountPage from '@/pages/Account';
import AdminPage from '@/pages/Admin';
import EmbedTradePage from '@/pages/EmbedTrade';
import EmbedHistoryPage from '@/pages/EmbedHistory';

/** В режиме api закрывает маршруты без JWT. В режиме mock — прозрачна (no-op). */
function RequireAuth() {
  if (IS_API && !isAuthed()) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter basename="/mobile">
      <Routes>
        {/* Tabbed pages with app chrome (NavBar slot + TabBar) */}
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<QuotesPage />} />
            <Route path="chart" element={<ChartPage />} />
            <Route path="trade" element={<TradePage />} />
            <Route path="trade/:id" element={<TradeDetailPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="history/period" element={<HistoryPeriodPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="account" element={<AccountPage />} />
          {/* Chrome-less (свой NavBar с Отмена/Сохранить, без TabBar) — маршрут
              существовал только в коде страницы, но не был подключён сюда,
              из-за чего переход падал в wildcard-редирект на "/" (Котировки). */}
          <Route path="trade/:id/edit" element={<TradeEditPage />} />
        </Route>

        {/* Chrome-less pages: no NavBar / TabBar */}
        <Route path="login" element={<LoginPage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="embed/trade" element={<EmbedTradePage />} />
        <Route path="embed/history" element={<EmbedHistoryPage />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

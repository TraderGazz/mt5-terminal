import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { isAuthed } from '@/api/auth';
import Shell from '@/components/Shell';
import LoginPage from '@/pages/Login';
import TradePage from '@/pages/Trade';
import HistoryPage from '@/pages/History';

function RequireAuth() {
  return isAuthed() ? <Outlet /> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            <Route index element={<Navigate to="/trade" replace />} />
            <Route path="trade" element={<TradePage />} />
            <Route path="history" element={<HistoryPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/trade" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

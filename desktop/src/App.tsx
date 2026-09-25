import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { isAuthed } from '@/api/auth';
import Shell from '@/components/Shell';
import LoginPage from '@/pages/Login';
import TerminalPage from '@/pages/Terminal';

function RequireAuth() {
  return isAuthed() ? <Outlet /> : <Navigate to="/login" replace />;
}

// «Торговля» и «История» в оригинале MT5 — не отдельные страницы, а вкладки
// одной и той же нижней панели терминала (см. TerminalPage/BottomPanel) —
// поэтому здесь один-единственный маршрут внутри Shell, не два.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            <Route index element={<TerminalPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

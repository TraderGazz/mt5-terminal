/**
 * /admin — standalone admin panel (admin.md). Route guard: mock admin login
 * (admin / admin) rendered inside the page; afterwards a responsive shell
 * (sidebar ≥768px / hamburger drawer on mobile) with sections: Пользователи,
 * Загруженная история, Редактирование баланса, Настройки автообмена, Отчёты.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import Toast from '@/components/Toast';
import type { ImportLogEntry } from '@/mocks';
import { IS_API } from '@/config';
import { clearAuth, getAuthUser } from '@/api/auth';
import AdminLogin from '@/components/admin/AdminLogin';
import AdminShell, { ADMIN_SECTIONS, type AdminSectionId } from '@/components/admin/AdminShell';
import UsersSection from '@/components/admin/UsersSection';
import TradesSection from '@/components/admin/TradesSection';
import SessionsSection from '@/components/admin/SessionsSection';
import ImportsSection from '@/components/admin/ImportsSection';
import BalanceSection from '@/components/admin/BalanceSection';
import SyncSection from '@/components/admin/SyncSection';
import ReportsSection from '@/components/admin/ReportsSection';

const SECTION_TITLES: Record<AdminSectionId, string> = {
  users: 'Пользователи',
  trades: 'Торговля и история',
  sessions: 'Сессии',
  imports: 'Загруженная история',
  balance: 'Редактирование баланса',
  sync: 'Настройки автообмена',
  reports: 'Создание торгового отчёта',
};

// В мок-режиме (без бэкенда) нет реального JWT — оставляем прежний локальный
// флаг для admin/admin, только на этот путь он и был рассчитан изначально.
const MOCK_AUTH_KEY = 'admin-auth';

// В api-режиме гейт держит РЕАЛЬНУЮ роль из JWT (getAuthUser), а не отдельный
// флаг в sessionStorage — раньше он использовался и тут тоже, и оказался не
// привязан к тому, кто сейчас реально залогинен: если на этом браузере admin
// хоть раз заходил в /admin, флаг оставался, и следующий, кто открывал /admin
// с ЛЮБЫМ логином (например investor), проваливался прямо в оболочку мимо
// проверки роли — отдельные разделы потом падали с сырым «Forbidden» от
// бэкенда (баг-репорт заказчика, скриншот с инвестором внутри админки).
function hasAdminAccess(): boolean {
  if (!IS_API) return sessionStorage.getItem(MOCK_AUTH_KEY) === '1';
  const role = getAuthUser()?.role;
  return role === 'admin' || role === 'trader';
}

export default function Admin() {
  const [authed, setAuthed] = useState(() => hasAdminAccess());
  const [section, setSection] = useState<AdminSectionId>('users');
  const [toast, setToast] = useState<string | null>(null);
  /** Entries appended locally (balance edits) — shown atop the import log. */
  const [extraLog, setExtraLog] = useState<ImportLogEntry[]>([]);

  if (!authed) {
    return (
      <AdminLogin
        onLogin={() => {
          if (!IS_API) sessionStorage.setItem(MOCK_AUTH_KEY, '1');
          setAuthed(hasAdminAccess());
        }}
      />
    );
  }

  // Реальный logout (не только локальный флаг) — иначе обновление страницы
  // после «Выйти» тут же пускало бы обратно, пока настоящий JWT ещё жив.
  const logout = () => {
    if (!IS_API) sessionStorage.removeItem(MOCK_AUTH_KEY);
    clearAuth();
    setAuthed(false);
  };

  return (
    <AdminShell
      section={section}
      onSection={setSection}
      onLogout={logout}
      title={ADMIN_SECTIONS.find((s) => s.id === section)?.label ?? ''}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {section === 'users' && <UsersSection showToast={setToast} />}
          {section === 'trades' && <TradesSection showToast={setToast} />}
          {section === 'sessions' && <SessionsSection showToast={setToast} />}
          {section === 'imports' && (
            <ImportsSection showToast={setToast} extraEntries={extraLog} />
          )}
          {section === 'balance' && (
            <BalanceSection
              showToast={setToast}
              onBalanceSaved={(entry) => setExtraLog((prev) => [entry, ...prev])}
            />
          )}
          {section === 'sync' && <SyncSection showToast={setToast} />}
          {section === 'reports' && <ReportsSection showToast={setToast} />}
        </motion.div>
      </AnimatePresence>
      <Toast message={toast} onClose={() => setToast(null)} />
      <span className="sr-only">{SECTION_TITLES[section]}</span>
    </AdminShell>
  );
}

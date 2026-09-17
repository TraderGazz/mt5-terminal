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

const AUTH_KEY = 'admin-auth';

export default function Admin() {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(AUTH_KEY) === '1',
  );
  const [section, setSection] = useState<AdminSectionId>('users');
  const [toast, setToast] = useState<string | null>(null);
  /** Entries appended locally (balance edits) — shown atop the import log. */
  const [extraLog, setExtraLog] = useState<ImportLogEntry[]>([]);

  if (!authed) {
    return (
      <AdminLogin
        onLogin={() => {
          sessionStorage.setItem(AUTH_KEY, '1');
          setAuthed(true);
        }}
      />
    );
  }

  const logout = () => {
    sessionStorage.removeItem(AUTH_KEY);
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

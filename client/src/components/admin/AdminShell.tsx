/**
 * Admin shell (admin.md §10.1): desktop sidebar ≥768px (240px, right hairline),
 * mobile top bar with hamburger → left drawer + backdrop. Content cross-fade
 * on section switch is handled by Admin page.
 */
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeftRight,
  FileDown,
  Import,
  ListChecks,
  Menu,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { BrandGlyph } from './bits';
import { getAuthUser } from '@/api/auth';

export type AdminSectionId = 'users' | 'trades' | 'imports' | 'balance' | 'sync' | 'reports';

export const ADMIN_SECTIONS: {
  id: AdminSectionId;
  label: string;
  icon: typeof Users;
}[] = [
  { id: 'users', label: 'Пользователи', icon: Users },
  { id: 'trades', label: 'Торговля и история', icon: ListChecks },
  { id: 'imports', label: 'Лог импортов', icon: Import },
  { id: 'balance', label: 'Баланс', icon: Wallet },
  { id: 'sync', label: 'Автообмен', icon: ArrowLeftRight },
  { id: 'reports', label: 'Отчёты', icon: FileDown },
];

function NavItems({
  section,
  onSelect,
}: {
  section: AdminSectionId;
  onSelect: (id: AdminSectionId) => void;
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {ADMIN_SECTIONS.map(({ id, label, icon: Icon }) => {
        const active = id === section;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={`relative flex h-11 items-center gap-3 rounded-[8px] px-3 text-left text-[15px] transition-colors ${
              active
                ? 'bg-[rgba(0,122,255,0.08)] font-medium text-accent'
                : 'text-black hover:bg-[#F7F7FA]'
            }`}
          >
            {active && (
              <span className="absolute left-0 top-[8px] h-[28px] w-[3px] rounded-r-full bg-accent" />
            )}
            <Icon
              size={18}
              strokeWidth={1.8}
              className={active ? 'text-accent' : 'text-text-secondary'}
            />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ onLogout }: { onLogout: () => void }) {
  const user = getAuthUser();
  return (
    <div className="mt-auto flex items-center justify-between border-t border-separator px-4 py-3">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-black">{user?.login ?? 'admin'}</p>
        <p className="text-[11px] text-text-secondary">{user?.name || 'Администратор'}</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="text-[13px] font-medium text-accent active:opacity-70"
      >
        Выйти
      </button>
    </div>
  );
}

export default function AdminShell({
  section,
  onSection,
  onLogout,
  title,
  children,
}: {
  section: AdminSectionId;
  onSection: (id: AdminSectionId) => void;
  onLogout: () => void;
  title: string;
  children: ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const select = (id: AdminSectionId) => {
    onSection(id);
    setDrawerOpen(false);
  };

  return (
    <div className="flex min-h-[100dvh] bg-bg-secondary">
      {/* Desktop sidebar (≥768px) */}
      <aside className="sticky top-0 hidden h-[100dvh] w-60 shrink-0 flex-col border-r border-separator bg-white md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <BrandGlyph size={28} />
          <span className="text-[15px] font-semibold text-black">
            Терминал Admin
          </span>
        </div>
        <NavItems section={section} onSelect={onSection} />
        <SidebarFooter onLogout={onLogout} />
      </aside>

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <div className="fixed inset-0 z-[60] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setDrawerOpen(false)}
              className="absolute inset-0 bg-[rgba(0,0,0,0.4)]"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
              className="absolute left-0 top-0 flex h-full w-72 flex-col bg-white"
            >
              <div className="flex items-center justify-between px-4 py-4">
                <div className="flex items-center gap-2.5">
                  <BrandGlyph size={28} />
                  <span className="text-[15px] font-semibold text-black">
                    Терминал Admin
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Закрыть меню"
                  onClick={() => setDrawerOpen(false)}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary active:bg-fill"
                >
                  <X size={20} />
                </button>
              </div>
              <NavItems section={section} onSelect={select} />
              <SidebarFooter onLogout={onLogout} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="hairline-b sticky top-0 z-40 flex h-12 items-center gap-2 bg-white px-2 md:hidden">
          <button
            type="button"
            aria-label="Открыть меню"
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full text-black active:bg-fill"
          >
            <Menu size={22} />
          </button>
          <span className="text-[17px] font-semibold text-black">{title}</span>
        </header>

        <main className="mx-auto w-full max-w-[980px] flex-1 px-4 pb-10 pt-4 md:px-8 md:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}

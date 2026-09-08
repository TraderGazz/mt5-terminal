/**
 * Admin → Пользователи (admin.md §10.2): stats strip, users table with role
 * pills and per-row action menu, add-user modal.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ADMIN_USERS, type AdminUser, type UserRole } from '@/mocks';
import { formatDateTime } from '@/lib/format';
import {
  AdminButton,
  AdminCard,
  AdminInput,
  AdminModal,
  Pill,
  SegmentedControl,
} from './bits';

const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'admin',
  trader: 'trader',
  viewer: 'viewer',
};

const ROLE_TONE: Record<UserRole, 'blue' | 'green' | 'gray'> = {
  admin: 'blue',
  trader: 'green',
  viewer: 'gray',
};

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toUpperCase();
}

function RowMenu({
  onRole,
  onReset,
  onDisable,
}: {
  onRole: () => void;
  onReset: () => void;
  onDisable: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const item =
    'flex w-full items-center whitespace-nowrap px-4 py-2.5 text-left text-[14px] active:bg-fill hover:bg-[#F7F7FA]';

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label="Действия"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary hover:bg-fill"
      >
        <MoreHorizontal size={18} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            style={{ transformOrigin: 'top right' }}
            className="absolute right-0 top-9 z-30 min-w-[190px] overflow-hidden rounded-[10px] bg-white py-1 shadow-[0_8px_28px_rgba(0,0,0,0.16)] ring-1 ring-black/5"
          >
            <button type="button" className={`${item} text-black`} onClick={() => { setOpen(false); onRole(); }}>
              Сменить роль
            </button>
            <button type="button" className={`${item} text-black`} onClick={() => { setOpen(false); onReset(); }}>
              Сбросить пароль
            </button>
            <button type="button" className={`${item} text-loss`} onClick={() => { setOpen(false); onDisable(); }}>
              Отключить
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function UsersSection({
  showToast,
}: {
  showToast: (msg: string) => void;
}) {
  const [users, setUsers] = useState<AdminUser[]>(ADMIN_USERS);
  const [addOpen, setAddOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<AdminUser | null>(null);

  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('trader');
  const [account, setAccount] = useState('');

  const stats = {
    total: users.length,
    traders: users.filter((u) => u.role === 'trader').length,
    admins: users.filter((u) => u.role === 'admin').length,
  };

  const addUser = () => {
    const loginNum = Number(account) || 50210000 + users.length;
    setUsers((prev) => [
      ...prev,
      {
        id: Math.max(...prev.map((u) => u.id)) + 1,
        name: name.trim() || 'Новый пользователь',
        login: loginNum,
        role,
        server: 'AlfaForex-Real',
        balance: 0,
        lastActive: Date.now(),
      },
    ]);
    setAddOpen(false);
    setName('');
    setLogin('');
    setPassword('');
    setAccount('');
    setRole('trader');
    showToast('Пользователь добавлен');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-[28px] font-bold leading-tight text-black md:text-[34px]">
          Пользователи
        </h1>
        <AdminButton variant="secondary" onClick={() => setAddOpen(true)}>
          <Plus size={16} />
          <span className="hidden sm:inline">Добавить пользователя</span>
          <span className="sm:hidden">Добавить</span>
        </AdminButton>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Всего', value: stats.total },
          { label: 'Трейдеры', value: stats.traders },
          { label: 'Админы', value: stats.admins },
        ].map((s) => (
          <div key={s.label} className="rounded-[10px] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <p className="tnum text-[24px] font-semibold text-black">{s.value}</p>
            <p className="text-[12px] text-text-secondary">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <AdminCard className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead>
            <tr className="border-b border-separator text-[12px] uppercase tracking-wide text-text-secondary">
              <th className="px-5 py-3 font-medium">Пользователь</th>
              <th className="px-4 py-3 font-medium">Счёт</th>
              <th className="px-4 py-3 font-medium">Роль</th>
              <th className="px-4 py-3 font-medium">Последний вход</th>
              <th className="px-4 py-3 text-right font-medium">Действия</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <motion.tr
                key={u.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.02 }}
                className="border-b border-separator/60 transition-colors last:border-0 hover:bg-[#F7F7FA]"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[rgba(0,122,255,0.10)] text-[13px] font-semibold text-accent">
                      {initials(u.name)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] text-black">{u.name}</span>
                      <span className="tnum block text-[12px] text-text-secondary">
                        логин {u.login} · {u.server}
                      </span>
                    </span>
                  </div>
                </td>
                <td className="tnum px-4 py-3 text-[14px] text-black">{u.login}</td>
                <td className="px-4 py-3">
                  <Pill tone={ROLE_TONE[u.role]}>{ROLE_LABEL[u.role]}</Pill>
                </td>
                <td className="tnum whitespace-nowrap px-4 py-3 text-[13px] text-text-secondary">
                  {formatDateTime(u.lastActive)}
                </td>
                <td className="px-4 py-3 text-right">
                  <RowMenu
                    onRole={() => setRoleTarget(u)}
                    onReset={() => showToast(`Пароль сброшен: ${u.name}`)}
                    onDisable={() => {
                      setUsers((prev) => prev.filter((x) => x.id !== u.id));
                      showToast(`Пользователь отключён: ${u.name}`);
                    }}
                  />
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </AdminCard>

      {/* Add user modal */}
      <AdminModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Новый пользователь"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setAddOpen(false)}>
              Отмена
            </AdminButton>
            <AdminButton onClick={addUser} disabled={!name.trim()}>
              Добавить
            </AdminButton>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <AdminInput label="ФИО" value={name} onChange={(e) => setName(e.target.value)} placeholder="Иванов Иван Иванович" />
          <AdminInput label="Логин" value={login} onChange={(e) => setLogin(e.target.value)} placeholder="ivanov" />
          <AdminInput label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          <AdminInput label="Счёт" inputMode="numeric" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="50214896" />
          <div>
            <span className="mb-1 block text-[13px] text-text-secondary">Роль</span>
            <SegmentedControl<UserRole>
              value={role}
              onChange={setRole}
              options={[
                { value: 'admin', label: 'admin' },
                { value: 'trader', label: 'trader' },
                { value: 'viewer', label: 'viewer' },
              ]}
            />
          </div>
        </div>
      </AdminModal>

      {/* Change role modal */}
      <AdminModal
        open={roleTarget !== null}
        onClose={() => setRoleTarget(null)}
        title="Сменить роль"
        footer={
          <>
            <AdminButton variant="secondary" onClick={() => setRoleTarget(null)}>
              Отмена
            </AdminButton>
            <AdminButton
              onClick={() => {
                if (!roleTarget) return;
                showToast(`Роль изменена: ${roleTarget.name}`);
                setRoleTarget(null);
              }}
            >
              Сохранить
            </AdminButton>
          </>
        }
      >
        {roleTarget && (
          <div className="flex flex-col gap-3">
            <p className="text-[14px] text-black">{roleTarget.name}</p>
            <SegmentedControl<UserRole>
              value={roleTarget.role}
              onChange={(r) => {
                setUsers((prev) => prev.map((x) => (x.id === roleTarget.id ? { ...x, role: r } : x)));
                setRoleTarget({ ...roleTarget, role: r });
              }}
              options={[
                { value: 'admin', label: 'admin' },
                { value: 'trader', label: 'trader' },
                { value: 'viewer', label: 'viewer' },
              ]}
            />
          </div>
        )}
      </AdminModal>
    </div>
  );
}

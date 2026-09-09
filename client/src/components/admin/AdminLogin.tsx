/**
 * Admin login screen (admin.md §10.0): centered card on --bg-secondary,
 * mock credentials admin / admin, inline error banner.
 */
import { AnimatePresence, motion } from 'framer-motion';
import { useState, type FormEvent } from 'react';
import { AdminButton, AdminInput, BrandGlyph } from './bits';
import { IS_API } from '@/config';
import { login as apiLogin } from '@/api/auth';

export default function AdminLogin({ onLogin }: { onLogin: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (IS_API) {
      apiLogin(login.trim(), password)
        .then((user) => {
          if (user.role === 'admin') onLogin();
          else setError(true);
        })
        .catch(() => setError(true));
      return;
    }
    if (login.trim() === 'admin' && password === 'admin') {
      onLogin();
    } else {
      setError(true);
    }
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-bg-secondary px-4">
      <motion.form
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        onSubmit={submit}
        className="w-full max-w-[360px] rounded-[12px] bg-white p-6 shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
      >
        <div className="flex flex-col items-center">
          <BrandGlyph size={48} />
          <h1 className="mt-3 text-[20px] font-semibold text-black">
            Админ-панель
          </h1>
          <p className="mt-0.5 text-[13px] text-text-secondary">
            Мобильный терминал MT5
          </p>
        </div>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 16 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="rounded-[8px] bg-[rgba(255,59,48,0.10)] px-3 py-2 text-center text-[13px] text-loss">
                Неверные данные администратора
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 flex flex-col gap-3">
          <AdminInput
            label="Логин"
            value={login}
            onChange={(e) => {
              setLogin(e.target.value);
              setError(false);
            }}
            autoComplete="username"
            placeholder="admin"
          />
          <AdminInput
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(false);
            }}
            autoComplete="current-password"
            placeholder="•••••"
          />
          <AdminButton type="submit" className="mt-1 h-[46px] w-full rounded-[12px] text-[17px]">
            Войти
          </AdminButton>
        </div>
      </motion.form>
    </div>
  );
}

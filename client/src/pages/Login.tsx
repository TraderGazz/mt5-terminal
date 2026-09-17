import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'framer-motion';
import AppShell from '@/components/AppShell';
import NavBar, { BackButton } from '@/components/NavBar';
import ActionSheet from '@/components/ActionSheet';
import Toast from '@/components/Toast';
import BrokerLogo from '@/components/auth/BrokerLogo';
import IosToggle from '@/components/auth/IosToggle';
import { startSession } from '@/components/auth/session';
import { ACCOUNT } from '@/mocks/account';
import { IS_API } from '@/config';
import { login as apiLogin } from '@/api/auth';

const SERVERS = ['AlfaForexRU-Real'];

/** Mock credentials (auth.md §4): any non-empty login + password «demo». */
const DEMO_PASSWORD = 'demo';

/** Company name with straight quotes, exactly as in the MT5 iOS header. */
const COMPANY_TITLE = 'ООО "Альфа-Форекс"';

/**
 * Авторизация (`/login`, auth.md) — визуальная копия MT5 iOS: прозрачный
 * NavBar с круглым BackButton и блоком брокера слева, плоская белая
 * форма-секция на весь экран с hairline-сепараторами, серая кнопка-пилюля
 * «Вход» внизу по центру. Mock login: любой логин + «demo».
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const canGoBack =
    typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0;

  const [server, setServer] = useState(ACCOUNT.server);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shakeKey, setShakeKey] = useState(0);
  const [serverSheet, setServerSheet] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canSubmit = login.trim().length > 0 && password.length > 0 && !submitting;

  const fail = (msg: string) => {
    setSubmitting(false);
    setError(msg);
    setPassword('');
    setShakeKey((k) => k + 1);
  };

  const onSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    if (IS_API) {
      apiLogin(login.trim(), password)
        .then(() => {
          startSession(login.trim()); // мок-сессия для совместимости UI
          // Если сюда попали из-за протухшей сессии (api/http.ts 401),
          // вернуть туда же (например обратно в /admin), а не всегда на
          // Котировки — иначе разлогин посреди работы в админке "выбивает"
          // без возможности вернуться одним кликом.
          let target = '/';
          try {
            const saved = sessionStorage.getItem('post-login-redirect');
            if (saved) {
              sessionStorage.removeItem('post-login-redirect');
              target = saved.startsWith('/mobile') ? saved.slice('/mobile'.length) || '/' : saved;
            }
          } catch {
            /* ignore */
          }
          navigate(target, { replace: true });
        })
        .catch((err: Error) => fail(err.message || 'Неверный логин или пароль'));
      return;
    }

    // Mock auth round-trip (auth.md §3: inline spinner, 1s mock delay).
    window.setTimeout(() => {
      if (password === DEMO_PASSWORD) {
        startSession(login.trim());
        navigate('/', { replace: true });
      } else {
        fail('Неверный логин или пароль');
      }
    }, 1000);
  };

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
        <NavBar
          left={
            <>
              {canGoBack && <BackButton onClick={() => navigate(-1)} />}
              <span className="flex min-w-0 items-center gap-2.5">
                <BrokerLogo size={32} />
                <span className="truncate text-[17px] font-semibold tracking-[-0.41px] text-black">
                  {COMPANY_TITLE}
                </span>
              </span>
            </>
          }
        />

        {/* Section header */}
        <p className="mb-1.5 mt-3 px-4 text-[13px] uppercase leading-[18px] tracking-[-0.08px] text-text-secondary">
          Использовать имеющийся счет
        </p>

        {/* Flat full-width form card */}
        <motion.div
          key={shakeKey}
          initial={false}
          animate={shakeKey > 0 ? { x: [0, -8, 8, -8, 8, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
        >
          <form onSubmit={onSubmit} className="bg-bg">
            {/* Сервер */}
            <button
              type="button"
              onClick={() => setServerSheet(true)}
              className="flex h-12 w-full items-center px-4 text-left transition-colors duration-150 active:bg-[#D9D9DE]"
            >
              <span className="text-[17px] tracking-[-0.41px] text-black">Сервер</span>
              <span className="min-w-0 flex-1 truncate text-right text-[17px] tracking-[-0.41px] text-text-secondary">
                {server}
              </span>
            </button>
            <div className="ml-4 border-t-[0.5px] border-separator" />

            {/* Логин */}
            <div className="flex h-12 items-center px-4">
              <label
                htmlFor="login-input"
                className="shrink-0 text-[17px] tracking-[-0.41px] text-black"
              >
                Логин
              </label>
              <input
                id="login-input"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                inputMode="numeric"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                placeholder="введите логин"
                enterKeyHint="next"
                className="tnum min-w-0 flex-1 bg-transparent text-right text-[17px] tracking-[-0.41px] text-black outline-none placeholder:text-[#C7C7CC]"
              />
            </div>
            <div className="ml-4 border-t-[0.5px] border-separator" />

            {/* Пароль */}
            <div className="flex h-12 items-center px-4">
              <label
                htmlFor="password-input"
                className="shrink-0 text-[17px] tracking-[-0.41px] text-black"
              >
                Пароль
              </label>
              <input
                id="password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="введите пароль"
                enterKeyHint="done"
                className="min-w-0 flex-1 bg-transparent text-right text-[17px] tracking-[-0.41px] text-black outline-none placeholder:text-[#C7C7CC]"
              />
            </div>
            <div className="ml-4 border-t-[0.5px] border-separator" />

            {/* Запомнить пароль */}
            <div className="flex h-12 items-center justify-between px-4">
              <span className="text-[17px] tracking-[-0.41px] text-black">
                Запомнить пароль
              </span>
              <IosToggle checked={remember} onChange={setRemember} label="Запомнить пароль" />
            </div>
          </form>
        </motion.div>

        {/* Error under the group */}
        <AnimatePresence>
          {error && (
            <motion.p
              role="alert"
              className="mx-8 mt-2 text-center text-[13px] leading-[16px] tracking-[-0.08px] text-loss"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {error}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Забыли пароль? */}
        <button
          type="button"
          onClick={() => setToast('Обратитесь к вашему менеджеру')}
          className="mt-5 block w-full text-center text-[15px] tracking-[-0.24px] text-text-secondary active:opacity-50"
        >
          Забыли пароль?
        </button>

        {/* Вход — bottom-centered pill */}
        <div
          className="mt-auto flex justify-center pt-10"
          style={{ paddingBottom: 'max(28px, env(safe-area-inset-bottom))' }}
        >
          <motion.button
            type="button"
            onClick={() => onSubmit()}
            disabled={!canSubmit}
            whileTap={canSubmit ? { scale: 0.96 } : undefined}
            transition={{ duration: 0.12 }}
            className={`flex h-11 min-w-[104px] items-center justify-center rounded-full px-8 text-[17px] font-medium tracking-[-0.41px] shadow-[0_2px_12px_rgba(0,0,0,0.10)] transition-colors duration-200 ${
              canSubmit ? 'bg-white text-accent' : 'bg-white/70 text-[#D1D1D6]'
            }`}
          >
            {submitting ? (
              <svg
                className="animate-spin"
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                aria-label="Вход…"
              >
                <circle
                  cx="12"
                  cy="12"
                  r="9"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="42"
                  strokeDashoffset="14"
                />
              </svg>
            ) : (
              'Вход'
            )}
          </motion.button>
        </div>
      </div>

      <ActionSheet
        open={serverSheet}
        title="Выберите сервер"
        actions={SERVERS.map((s) => ({
          label: s === server ? `${s} ✓` : s,
          onSelect: () => setServer(s),
        }))}
        onClose={() => setServerSheet(false)}
      />
      <Toast message={toast} onClose={() => setToast(null)} />
    </AppShell>
  );
}

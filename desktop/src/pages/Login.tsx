import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { login } from '@/api/auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!loginId || !password || busy) return;
    setBusy(true);
    setError(null);
    login(loginId.trim(), password)
      .then(() => navigate('/', { replace: true }))
      .catch((err: Error) => { setError(err.message); setBusy(false); setPassword(''); });
  };

  return (
    <div className="flex min-h-full items-center justify-center bg-grouped p-6">
      <form onSubmit={submit} className="w-full max-w-[360px] rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-sm font-bold text-white">MT</span>
          <span className="text-[17px] font-semibold">Торговый терминал</span>
        </div>
        <label className="mb-1 block text-[13px] text-text-2">Логин</label>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          className="mb-4 w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-accent"
        />
        <label className="mb-1 block text-[13px] text-text-2">Пароль</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 w-full rounded-lg border border-hairline px-3 py-2 outline-none focus:border-accent"
        />
        {error && <p className="mb-3 text-[13px] text-loss">{error}</p>}
        <button
          disabled={busy || !loginId || !password}
          className="w-full rounded-lg bg-accent py-2.5 font-medium text-white disabled:opacity-40"
        >
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { getAccount, type Account } from '@/api/rest';
import { wsClient } from '@/api/ws';
import { logout } from '@/api/auth';

const money = (v: number) =>
  `${v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'pos' | 'neg' }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wide text-text-2">{label}</span>
      <span
        className={`tnum text-[15px] font-medium ${tone === 'pos' ? 'text-accent' : tone === 'neg' ? 'text-loss' : 'text-black'}`}
      >
        {value}
      </span>
    </div>
  );
}

export default function Shell() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    getAccount().then(setAccount).catch(() => {});
    const off = wsClient.on('account', (d) => setAccount(d as Account));
    return off;
  }, []);

  const tab = 'px-4 py-3 text-[14px] font-medium border-b-2 -mb-px transition-colors';

  return (
    <div className="mx-auto flex min-h-full max-w-[1200px] flex-col bg-white">
      <header className="flex items-center gap-6 border-b border-hairline px-6">
        <span className="flex items-center gap-2 py-3 pr-2 font-semibold tracking-[-0.3px]">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[13px] font-bold text-white">MT</span>
          MetaTrader 5
        </span>
        <nav className="flex">
          <NavLink to="/trade" className={({ isActive }) => `${tab} ${isActive ? 'border-accent text-accent' : 'border-transparent text-text-2 hover:text-black'}`}>
            Торговля
          </NavLink>
          <NavLink to="/history" className={({ isActive }) => `${tab} ${isActive ? 'border-accent text-accent' : 'border-transparent text-text-2 hover:text-black'}`}>
            История
          </NavLink>
        </nav>
        <button
          onClick={() => { logout(); navigate('/login', { replace: true }); }}
          className="ml-auto text-[13px] text-text-2 hover:text-loss"
        >
          Выйти
        </button>
      </header>

      {account && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 border-b border-hairline bg-grouped px-6 py-3 sm:grid-cols-3 md:grid-cols-6">
          <Metric label="Баланс" value={`${money(account.balance)} ${account.currency}`} />
          <Metric label="Средства" value={money(account.equity)} />
          <Metric label="Маржа" value={money(account.margin)} />
          <Metric label="Свободная маржа" value={money(account.freeMargin)} />
          <Metric label="Уровень маржи" value={`${account.marginLevel.toFixed(2)} %`} />
          <Metric
            label="Плавающий P/L"
            value={money(account.floatingProfit)}
            tone={account.floatingProfit < 0 ? 'neg' : 'pos'}
          />
        </div>
      )}

      <main className="flex-1 px-6 py-4">
        <Outlet />
      </main>
    </div>
  );
}

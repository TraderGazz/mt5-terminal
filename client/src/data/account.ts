/** Провайдер счёта. Интерфейс Account — как у @/mocks/account. */
import { IS_API } from '@/config';
import { ACCOUNT, type Account } from '@/mocks/account';
import { wsClient } from '@/api/ws';
import { getAccount as fetchAccount, type ApiAccount } from '@/api/rest';
import { createStore } from './store';

export type { Account };

function fromApi(a: ApiAccount): Account {
  return {
    holder: a.holder || ACCOUNT.holder,
    company: a.company || ACCOUNT.company,
    accountId: Number(a.login) || ACCOUNT.accountId,
    server: a.server || ACCOUNT.server,
    accessServer: a.accessServer || ACCOUNT.accessServer,
    currency: (a.currency as Account['currency']) || 'RUB',
    balance: a.balance,
    equity: a.equity,
    margin: a.margin,
    freeMargin: a.freeMargin,
    marginLevel: a.marginLevel,
  };
}

// См. positions.ts readyStore — тот же приём: различить «ещё грузится»
// (mock-заглушка ACCOUNT) от «это и есть реальный ответ».
const readyStore = createStore<boolean>(!IS_API);

const store = createStore<Account>(ACCOUNT, (set) => {
  if (!IS_API) return;
  fetchAccount()
    .then((a) => set(fromApi(a)))
    .catch(() => {})
    .finally(() => readyStore.set(true));
  wsClient.on('account', (d) => {
    set(fromApi(d as ApiAccount));
    readyStore.set(true);
  });
});

/** Реактивный счёт. В mock — статический снапшот, в api — из REST + WS. */
export const useAccount = store.useValue;
export const getAccountSnapshot = store.get;
export const useAccountReady = readyStore.useValue;

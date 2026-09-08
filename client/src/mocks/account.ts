/** Account snapshot (design.md §8). All money in RUB. */

export interface Account {
  holder: string;
  company: string;
  accountId: number;
  server: string;
  /** Trade-access gateway the account is connected through. */
  accessServer: string;
  currency: 'RUB';
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  marginLevel: number;
}

export const ACCOUNT: Account = {
  holder: 'Чулюков Сергей Анатольевич',
  company: 'ООО «Альфа-Форекс»',
  accountId: 2000108452,
  server: 'AlfaForexRU-Real',
  accessServer: 'RFD Access Server 1',
  currency: 'RUB',
  balance: 1250000.0,
  equity: 1268432.75,
  margin: 184220.0,
  freeMargin: 1084212.75,
  marginLevel: 688.42,
};

// Официальная выписка брокера — тот же источник, что и на сайте
// (client/src/data/deposit-ledger.json, см. depositLedger.ts там). Нужен
// серверу для торгового отчёта в админке (routes/admin.js /report):
// раньше отчёт брал сырую таблицу trades целиком и в него попадали
// мусорные EA-синхронизированные "demo deposit" строки (заявка заказчика:
// "в историю попадают демо депозиты... по депозитам в отчёт лучше по
// таблице поступления и списания"). Один файл-источник для сайта и
// отчёта — не два расходящихся списка.
import ledgerData from '../../client/src/data/deposit-ledger.json' with { type: 'json' };

export const LEDGER_END = new Date(ledgerData.ledgerEndIso).getTime();

const LEDGER = ledgerData.rows;

/** Local midnight of an "YYYY-MM-DD" ledger date, ms epoch. */
function parseIsoDateLocal(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/**
 * Построчные депозиты/снятия ИЗ ВЫПИСКИ в форме, пригодной для отчёта
 * (та же форма полей, что и у обычной строки trades — ticket/symbol/type/
 * volume/open_price/close_price/profit/swap/commission/open_time/
 * close_time/comment). Синтетический отрицательный тикет — как у ручных
 * записей из админки, реального тикета у строки выписки нет.
 */
export function ledgerReportRows(from, to) {
  const rows = [];
  for (const [iso, dep, wd] of LEDGER) {
    const t = parseIsoDateLocal(iso);
    if (t < from || t > to) continue;
    const base = {
      symbol: '', type: null, volume: null, open_price: null, close_price: null,
      swap: 0, commission: 0, open_time: new Date(t), close_time: new Date(t), comment: 'из выписки',
    };
    if (dep > 0) rows.push({ ...base, ticket: -t - 1, deal_type: 'balance', profit: dep });
    if (wd > 0) rows.push({ ...base, ticket: -t - 2, deal_type: 'withdrawal', profit: -wd });
  }
  return rows;
}

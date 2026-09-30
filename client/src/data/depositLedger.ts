/**
 * Официальная выписка брокера (ООО Альфа-Форекс, «для расчета.xlsx») —
 * авторитетный источник дат/сумм пополнений и снятий В ПРЕДЕЛАХ ФАКТИЧЕСКИ
 * ИМЕЮЩИХСЯ В НЕЙ ДАННЫХ. Шапка файла заявляет период по 31.08.2026, но
 * последняя РЕАЛЬНАЯ строка в нём — 02.07.2026; изначально LEDGER_END был
 * выставлен по заявленной дате (31.08), из-за чего весь август повис между
 * источниками (ни выписка, ни синк её не покрывали — выписка молча отдавала
 * 0 за даты, для которых у неё физически нет строк, а синк для этих же дат
 * не запрашивался, раз они формально «внутри» покрытия выписки). LEDGER_END
 * — дата ПОСЛЕДНЕЙ РЕАЛЬНОЙ строки, не заявленная.
 *
 * Синхронизированные с EA balance-записи (mt5-sync) за ВСЁ время не
 * совпадают с выпиской (сумма депозитов по базе — 68.7М, по выписке —
 * 25.3М, расходятся сильно), но для дат ПОСЛЕ LEDGER_END синхронизация
 * проверена и точна (сверено напрямую с реальным терминалом посделочно на
 * окне 15.08–15.09: суммы совпали до копейки). Поэтому History.tsx
 * использует гибрид: даты ≤ LEDGER_END — из этого списка, даты >
 * LEDGER_END — из синхронизированных balance-записей (getBalanceOps()).
 * Период «Последний год» тоже считается по этому списку как любой другой
 * период (заказчик подтвердил — прежняя зафиксированная заглушка снята).
 *
 * Сами данные — в deposit-ledger.json (не здесь): торговый отчёт в
 * админке (server/routes/admin.js /report) генерируется сервером и раньше
 * не имел доступа к этому списку (был только в клиентском TS) — из-за
 * этого в отчёт попадали мусорные EA-синхронизированные "demo deposit"
 * строки из сырой таблицы (заявка заказчика: "по депозитам в отчёт лучше
 * по таблице поступления и списания"). Вынесли в общий JSON, читаемый и
 * клиентом, и сервером (см. server/services/deposit-ledger.js) — теперь
 * один источник данных, а не расхождение между сайтом и отчётом.
 */
import ledgerData from './deposit-ledger.json';

export const LEDGER_END = new Date(ledgerData.ledgerEndIso).getTime();

const LEDGER = ledgerData.rows as unknown as readonly [string, number, number][];

/** Local midnight of an "YYYY-MM-DD" ledger date, ms epoch. */
function parseIsoDateLocal(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

/** Сумма депозитов/снятий за [from, to] (мс, включительно) из выписки. */
export function depositTotalsForRange(from: number, to: number): { deposit: number; withdrawal: number } {
  let deposit = 0;
  let withdrawal = 0;
  for (const [iso, dep, wd] of LEDGER) {
    const t = parseIsoDateLocal(iso);
    if (t < from || t > to) continue;
    deposit += dep;
    withdrawal += wd;
  }
  return { deposit, withdrawal };
}

export interface LedgerBalanceRow {
  /** Синтетический тикет (для key/сортировки) — из выписки нет настоящего. */
  ticket: number;
  /** Положительная = депозит, отрицательная = снятие. */
  profit: number;
  closeTime: number;
}

/**
 * Построчные депозиты/снятия ИЗ ВЫПИСКИ для показа в Истории (заявка
 * заказчика: строки должны быть, но только те, что реально есть в таблице —
 * не мусорные синхронизированные с EA demo-записи из БД). День с обеими
 * операциями (депозит и снятие) даёт ДВЕ строки.
 */
export function ledgerBalanceRows(from: number, to: number): LedgerBalanceRow[] {
  const rows: LedgerBalanceRow[] = [];
  for (const [iso, dep, wd] of LEDGER) {
    const t = parseIsoDateLocal(iso);
    if (t < from || t > to) continue;
    if (dep > 0) rows.push({ ticket: -t - 1, profit: dep, closeTime: t });
    if (wd > 0) rows.push({ ticket: -t - 2, profit: -wd, closeTime: t });
  }
  return rows;
}

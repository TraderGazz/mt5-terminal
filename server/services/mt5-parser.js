// Parser for MT5 HTML reports ("Файл → Сохранить как отчёт → HTML").
// Handles the tables "Позиции / Positions", "Сделки / Deals" and "Ордера / Orders"
// with Russian or English headers. Produces records matching the `trades` table.
import * as cheerio from 'cheerio';

export class Mt5ReportParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'Mt5ReportParseError';
  }
}

// --- helpers ---------------------------------------------------------------

function parseNumber(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/\s| /g, '').trim();
  if (!s) return null;
  // RU format "1 234,56" -> "1234.56"; keep EN "1,234.56" working too.
  if (/,\d{1,5}$/.test(s) && !/\.\d+$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDateTime(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  // MT5 format: "2024.05.17 12:34" or "2024.05.17 12:34:56"
  let m = s.match(/^(\d{4})\.(\d{2})\.(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, y, mo, d, h, mi, sec] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +(sec || 0)));
  }
  // Fallback: ISO or browser-parseable
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function normalizeType(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (s.startsWith('buy') || s === 'покупка') return 'buy';
  if (s.startsWith('sell') || s === 'продажа') return 'sell';
  if (s === 'balance' || s === 'баланс') return 'balance';
  return s || null;
}

// --- table extraction --------------------------------------------------------

function extractTables($) {
  const tables = [];
  $('table').each((_, table) => {
    const rows = [];
    $(table)
      .find('tr')
      .each((__, tr) => {
        const cells = [];
        $(tr)
          .find('th, td')
          .each((___, cell) => {
            cells.push($(cell).text().replace(/\s+/g, ' ').trim());
          });
        if (cells.length) rows.push(cells);
      });
    if (rows.length >= 2) tables.push(rows);
  });
  return tables;
}

function classifyTable(headerRow) {
  const h = headerRow.join(' ').toLowerCase();
  if (h.includes('позици') || h.includes('position')) return 'positions';
  if (h.includes('сделк') || h.includes('deal')) return 'deals';
  if (h.includes('ордер') || h.includes('order')) return 'orders';
  return null;
}

// Build a column index for a header row. Duplicate headers (e.g. "Время"
// appears twice in Positions: open/close) are disambiguated by occurrence.
function buildColumnMap(headerRow) {
  const map = {};
  const seen = {};
  headerRow.forEach((raw, i) => {
    const h = String(raw).toLowerCase().trim();
    const occ = (seen[h] = (seen[h] || 0) + 1);

    if (h.includes('позици') || h === 'position') map.position_id = i;
    else if (h === 'сделка' || h === 'deal' || h === 'тикет' || h === 'ticket') map.ticket = i;
    else if (h === 'ордер' || h === 'order') map.order_ticket = i;
    else if (h.includes('символ') || h === 'symbol') map.symbol = i;
    else if (h === 'тип' || h === 'type') map.type = i;
    else if (h.includes('объ') || h === 'volume') map.volume = i;
    else if (h.includes('комис') || h === 'commission') map.commission = i;
    else if (h === 'своп' || h === 'swap') map.swap = i;
    else if (h.includes('прибыл') || h === 'profit') map.profit = i;
    else if (h.includes('коммент') || h === 'comment') map.comment = i;
    else if (h === 'цена' || h === 'price') {
      if (!('open_price' in map)) map.open_price = i;
      else map.close_price = i;
    } else if (h === 'время' || h === 'time') {
      if (!('open_time' in map)) map.open_time = i;
      else map.close_time = i;
    } else if (h === 's / l' || h === 's/l' || h === 'sl') {
      // ignore stop loss column
    }
  });
  return map;
}

function rowToTrade(cells, col, kind) {
  const get = (key) => (col[key] !== undefined ? cells[col[key]] : undefined);
  const type = normalizeType(get('type'));
  if (type === 'balance') return null; // balance operations are not trades
  const trade = {
    ticket: parseNumber(get('ticket')) ?? parseNumber(get('position_id')),
    position_id: parseNumber(get('position_id')),
    order_ticket: parseNumber(get('order_ticket')),
    symbol: get('symbol') || null,
    type,
    volume: parseNumber(get('volume')),
    open_price: parseNumber(get('open_price')),
    close_price: kind === 'deals' ? parseNumber(get('open_price')) : parseNumber(get('close_price')),
    profit: parseNumber(get('profit')),
    swap: parseNumber(get('swap')),
    commission: parseNumber(get('commission')),
    open_time: parseDateTime(get('open_time')),
    close_time: kind === 'deals' ? parseDateTime(get('open_time')) : parseDateTime(get('close_time')),
    comment: get('comment') || null,
  };
  if (!trade.symbol || !trade.type) return null; // skip footer/summary rows
  return trade;
}

// --- main entry --------------------------------------------------------------

/**
 * Parse an MT5 HTML report into trade records.
 * @param {string|Buffer} html
 * @returns {{ trades: object[], source: 'positions'|'deals', orders: object[] }}
 * @throws {Mt5ReportParseError} on empty/broken input or unknown format
 */
export function parseMt5Report(html) {
  if (!html || !String(html).trim()) {
    throw new Mt5ReportParseError('Пустой файл отчёта');
  }
  let $;
  try {
    $ = cheerio.load(String(html));
  } catch (err) {
    throw new Mt5ReportParseError(`Не удалось разобрать HTML: ${err.message}`);
  }

  const tables = extractTables($);
  if (!tables.length) {
    throw new Mt5ReportParseError('В файле не найдено таблиц — это не отчёт MT5?');
  }

  const trades = [];
  const orders = [];
  let source = null;

  for (const rows of tables) {
    // Find the header row: first row that classifies the table.
    let kind = null;
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 3); i++) {
      kind = classifyTable(rows[i]);
      if (kind) {
        headerIdx = i;
        break;
      }
    }
    if (!kind) continue;

    const col = buildColumnMap(rows[headerIdx]);
    if (col.symbol === undefined || col.type === undefined) continue;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = rows[i];
      // Skip summary/footer rows (usually start with empty cell or "Итог"/"Total").
      const first = String(cells[0] || '').toLowerCase();
      if (first.includes('итог') || first.startsWith('total') || first === '') continue;

      if (kind === 'orders') {
        const get = (key) => (col[key] !== undefined ? cells[col[key]] : undefined);
        orders.push({
          order_ticket: parseNumber(get('order_ticket')),
          symbol: get('symbol') || null,
          type: normalizeType(get('type')),
          volume: parseNumber(get('volume')),
          open_price: parseNumber(get('open_price')),
          open_time: parseDateTime(get('open_time')),
        });
        continue;
      }

      const trade = rowToTrade(cells, col, kind);
      if (trade && trade.ticket != null) {
        trades.push(trade);
        if (!source) source = kind;
      }
    }
  }

  if (!trades.length) {
    throw new Mt5ReportParseError('В отчёте не найдено сделок (таблицы Позиции/Сделки пусты)');
  }

  return { trades, source: source || 'deals', orders };
}

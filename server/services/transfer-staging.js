import { transferQuoteStatus } from './transfer-quote-policy.js';
import { createHash } from 'node:crypto';
import { normalizePosition } from './mt5-bridge/normalize.js';
import { addMoney, roundMoney } from './money.js';

// Ignore synchronizer timestamps while retaining every financial/configuration
// value. Sort a copy for comparison, preserving the captured presentation order.
export function transferCaptureSignature(state, settings) {
  const stableSettings = Object.fromEntries(Object.entries(settings).map(([table, rows]) => [
    table, rows.map(({ updated_at, ...fields }) => fields),
  ]));
  const stableState = { ...state, positions: [...state.positions].sort((a, b) => a.id - b.id) };
  return createHash('sha256').update(JSON.stringify({ state: stableState, settings: stableSettings })).digest('hex');
}

function positive(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
  return value;
}

function finite(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`Invalid ${label}`);
  return value;
}

function positionsByTicket(list, label) {
  if (!Array.isArray(list)) throw new Error(`Missing ${label}`);
  const byTicket = new Map();
  for (const position of list) {
    if (!Number.isSafeInteger(position.id) || position.id <= 0 || byTicket.has(position.id)) {
      throw new Error(`Invalid or duplicate ticket in ${label}`);
    }
    byTicket.set(position.id, position);
  }
  return byTicket;
}

// Uses the broker login, not the branded login in siteAccount.
export function inspectTransferSnapshot(snapshot, sourceLogin, targetLogin) {
  if (!sourceLogin || !targetLogin || String(sourceLogin) === String(targetLogin)) {
    throw new Error('Distinct source and target logins are required');
  }
  if (String(snapshot.brokerAccount?.login) !== String(sourceLogin)) {
    throw new Error('Snapshot belongs to another broker account');
  }
  if (snapshot.version !== 1 || !Number.isFinite(Date.parse(snapshot.completedAt))) {
    throw new Error('Invalid snapshot version or capture time');
  }
  const raw = snapshot.brokerPositions;
  const rawList = Array.isArray(raw) ? raw : raw?.opened ?? raw?.positions ?? raw?.data;
  if (!Array.isArray(rawList)) throw new Error('Missing broker positions');
  const broker = positionsByTicket(rawList.map(normalizePosition), 'broker positions');
  const displayed = positionsByTicket(snapshot.sitePositions?.positions, 'site positions');
  if (broker.size !== displayed.size || [...broker.keys()].some(id => !displayed.has(id))) {
    throw new Error('Broker/site ticket sets differ');
  }
  const account = snapshot.siteAccount?.account;
  if (!account?.currency || account.currency !== snapshot.brokerAccount.currency) {
    throw new Error('Missing or different account currencies');
  }
  for (const field of ['balance', 'equity', 'margin', 'freeMargin', 'marginLevel', 'floatingProfit']) {
    finite(account[field], `account.${field}`);
  }
  const symbols = new Map();
  for (const [id, position] of broker) {
    const view = displayed.get(id);
    if (position.symbol !== view.symbol || position.type !== view.type) {
      throw new Error(`Position identity mismatch: ${id}`);
    }
    if (!['buy', 'sell'].includes(view.type) || !position.symbol) throw new Error(`Invalid side/symbol: ${id}`);
    for (const p of [position, view]) {
      for (const field of ['volume', 'openPrice', 'currentPrice']) positive(p[field], `${id}.${field}`);
      for (const field of ['profit', 'swap', 'commission', 'stopLoss', 'takeProfit']) finite(p[field], `${id}.${field}`);
      if (!Number.isFinite(Date.parse(p.openTime))) throw new Error(`Invalid opening time: ${id}`);
    }
    symbols.set(position.symbol, (symbols.get(position.symbol) || 0) + 1);
  }
  return { broker, displayed, account, symbols: Object.fromEntries(symbols) };
}

// Explicit contract/currency calibration is mandatory. A copied display lot is
// never used for valuation. Unsupported contracts must be rejected by the caller.
export function prepareTransfer(snapshot, sourceLogin, targetLogin, specifications) {
  const inspected = inspectTransferSnapshot(snapshot, sourceLogin, targetLogin);
  const positions = [];
  for (const [ticket, raw] of inspected.broker) {
    const view = inspected.displayed.get(ticket);
    const spec = specifications[raw.symbol];
    if (spec?.calculation !== 'forex' || spec.accountCurrency !== inspected.account.currency) {
      throw new Error(`Unsupported valuation specification: ${raw.symbol}`);
    }
    const contractSize = positive(spec.contractSize, 'contractSize');
    const referenceRate = positive(spec.referenceRate, 'referenceRate');
    if (typeof spec.profitCurrency !== 'string' || !spec.profitCurrency) throw new Error('Missing profit currency');
    if (spec.profitCurrency === spec.accountCurrency) {
      if (referenceRate !== 1 || spec.conversionSymbol) throw new Error('Invalid same-currency conversion');
    } else if (!spec.conversionSymbol) throw new Error('Missing conversion symbol');
    const direction = raw.type === 'buy' ? 1 : -1;
    const units = raw.volume * contractSize;
    const anchorGross = direction * (view.currentPrice - view.openPrice) * units * referenceRate;
    positions.push({
      originalTicket: ticket, raw, view,
      valuation: {
        calculation: 'forex', units, direction,
        accountCurrency: spec.accountCurrency, profitCurrency: spec.profitCurrency,
        conversionSymbol: spec.conversionSymbol || null,
        referenceRate, anchorGross,
      },
    });
  }
  return {
    sourceLogin: String(sourceLogin), targetLogin: String(targetLogin),
    capturedAt: snapshot.completedAt, account: inspected.account, positions,
    snapshotHash: createHash('sha256').update(JSON.stringify({ snapshot, sourceLogin, targetLogin, specifications })).digest('hex'),
  };
}

function checkedQuote(symbol, quotes, now, maxAgeMs, conversion=false) {
  const quote = quotes[symbol];
  if (!quote || quote.symbol !== symbol) throw new Error(`Missing quote: ${symbol}`);
  positive(quote.bid, `${symbol}.bid`);
  positive(quote.ask, `${symbol}.ask`);
  if (!transferQuoteStatus(quote,{now,maxAgeMs,conversion}).usable) {
    throw new Error(`Invalid or stale quote: ${symbol}`);
  }
  return quote;
}

export function valueTransferredPosition(model, quotes, { now = Date.now(), maxAgeMs = 60000 } = {}) {
  const quote = checkedQuote(model.raw.symbol, quotes, now, maxAgeMs);
  const v = model.valuation;
  const conversion = v.conversionSymbol ? checkedQuote(v.conversionSymbol, quotes, now, maxAgeMs,true) : null;
  // Matches the current terminal's midpoint USDRUB conversion convention.
  const rate = conversion ? (conversion.bid + conversion.ask) / 2 : 1;
  const closePrice = model.raw.type === 'buy' ? quote.bid : quote.ask;
  const gross = v.direction * (closePrice - model.view.openPrice) * v.units * rate;
  const profit = addMoney(model.view.profit, gross - v.anchorGross);
  return {
    ...model.view, currentPrice: closePrice, profit,
    swap: roundMoney(model.view.swap), commission: roundMoney(model.view.commission),
  };
}

// The caller supplies a transaction client, keeping the full import atomic.
export async function importPreparedTransfer(client, prepared, snapshot) {
  const { rows } = await client.query(
    `INSERT INTO transfer_snapshots
       (snapshot_hash, source_login, target_login, captured_at, payload, account_view)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (snapshot_hash) DO NOTHING RETURNING id`,
    [prepared.snapshotHash, prepared.sourceLogin, prepared.targetLogin,
      prepared.capturedAt, snapshot, prepared.account],
  );
  if (!rows[0]) {
    const existing = await client.query('SELECT id FROM transfer_snapshots WHERE snapshot_hash = $1', [prepared.snapshotHash]);
    return { id: existing.rows[0].id, imported: false };
  }
  for (const model of prepared.positions) {
    await client.query(
      'INSERT INTO transferred_positions (snapshot_id, original_ticket, model) VALUES ($1,$2,$3)',
      [rows[0].id, model.originalTicket, model],
    );
  }
  return { id: rows[0].id, imported: true };
}

// Independent test ledger. No broker method is called. Repeated/concurrent
// closes return the same committed result, including if the quote has changed.
export async function closeTransferredPosition(client, id, quotes, actor, options = {}) {
  if (!actor) throw new Error('Actor is required');
  const { rows } = await client.query('SELECT * FROM transferred_positions WHERE id = $1 FOR UPDATE', [id]);
  const position = rows[0];
  if (!position) throw new Error('Transferred position not found');
  if (position.status === 'closed') {
    return (await client.query('SELECT * FROM transferred_position_closures WHERE position_id = $1', [id])).rows[0];
  }
  const executionValue = valueTransferredPosition(position.model, quotes, options);
  // Internal rehearsal may reproduce the original site's displayed P/L. Quote
  // validation always runs first; no HTTP route accepts a valuation callback.
  const value = options.valuePosition ? options.valuePosition(position.model, executionValue) : executionValue;
  if (value.id !== position.model.view.id || value.currentPrice !== executionValue.currentPrice ||
      !['profit','swap','commission'].every(k=>Number.isFinite(value[k]))) throw new Error('Invalid settlement value');
  const result = await client.query(
    `INSERT INTO transferred_position_closures
       (position_id, closed_at, actor, close_price, profit, swap, commission, total, quote_snapshot)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [id, new Date(options.now ?? Date.now()).toISOString(), String(actor), value.currentPrice,
      value.profit, value.swap, value.commission, addMoney(value.profit, value.swap, value.commission), quotes],
  );
  await client.query("UPDATE transferred_positions SET status = 'closed' WHERE id = $1", [id]);
  return result.rows[0];
}

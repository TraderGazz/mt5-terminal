// Мок-мост: имитирует SocketBridgeEA без Docker/MT5.
// Отдаёт данные в формах, близких к реальному EA (проходят через normalize.js),
// и генерит live-поток: price_update часто, trade_event (открытие/закрытие) редко.
//
// Символ — только EURUSD (уточнение заказчика). Валюта счёта — RUB.
import { EventEmitter } from 'node:events';

const SYMBOL = process.env.MT5_SYMBOL || 'EURUSD';
const DIGITS = 5;
const CONTRACT = 100_000;         // 1 лот EURUSD = 100 000 EUR
const USDRUB = 92.0;              // грубый курс для перевода P/L в рубли
const DAY = 86_400_000;

const rnd = (a, b) => a + Math.random() * (b - a);
const round = (v, d = DIGITS) => Number(v.toFixed(d));
const money = (v) => Number(v.toFixed(2));

// Прибыль позиции в рублях от движения цены.
function positionProfit(p, price) {
  const dir = p.type === 'buy' ? 1 : -1;
  return money(dir * (price - p.price_open) * p.volume * CONTRACT * USDRUB * (1 / p.price_open) * p.price_open);
}

const TF_MS = { M1: 60e3, M5: 300e3, M15: 900e3, M30: 1800e3, H1: 3600e3, H4: 14400e3, D1: 86400e3 };

export class MockBridge extends EventEmitter {
  constructor() {
    super();
    this.symbol = SYMBOL;
    this.mid = 1.08425;
    this.nextTicket = 90_300_000;
    this.timer = null;

    // счёт
    this.account = {
      login: '2000108452',
      name: 'Чулюков Сергей Анатольевич',
      server: 'AlfaForexRU-Real',
      currency: 'RUB',
      leverage: 100,
      balance: 1_250_000,
    };

    // открытые позиции (2 шт EURUSD)
    this.positions = [
      this.#mkPosition('buy', 0.5, this.mid - 0.0061, Date.now() - 26 * 3600e3),
      this.#mkPosition('sell', 0.2, this.mid + 0.0018, Date.now() - 9 * 3600e3),
    ];

    // история за ~6 месяцев
    this.history = this.#genHistory();
  }

  #mkPosition(type, volume, priceOpen, timeMs) {
    return {
      ticket: this.nextTicket++,
      symbol: this.symbol,
      type,
      volume,
      price_open: round(priceOpen),
      price_current: round(this.mid),
      time: Math.floor(timeMs / 1000),
      sl: 0,
      tp: 0,
      swap: money(rnd(-140, -10)),
      commission: money(-volume * 700),
      profit: 0,
    };
  }

  #genHistory() {
    const out = [];
    const now = Date.now();
    // балансовые операции
    out.push(this.#bal(90_150_001, now - 182 * DAY, 800_000, 'balance', 'Пополнение счёта'));
    out.push(this.#bal(90_150_002, now - 120 * DAY, -150_000, 'withdrawal', 'Вывод средств'));
    out.push(this.#bal(90_150_003, now - 40 * DAY, 300_000, 'balance', 'Пополнение счёта'));
    // CFD-начисления
    out.push(this.#bal(90_160_001, now - 30 * DAY, 1_250.0, 'cfd', 'CFD adjustment'));
    out.push(this.#bal(90_160_002, now - 12 * DAY, -840.5, 'cfd', 'CFD adjustment'));
    // закрытые сделки EURUSD
    let n = 0;
    for (let d = 178; d > 1; d -= rnd(3, 12)) {
      const daysAgo = Math.floor(d);
      const openMs = now - daysAgo * DAY - rnd(1, 6) * 3600e3;
      const closeMs = openMs + rnd(2, 30) * 3600e3;
      const type = Math.random() > 0.5 ? 'buy' : 'sell';
      const volume = Number(rnd(0.05, 0.5).toFixed(2));
      const openP = 1.05 + Math.random() * 0.06;
      const pips = rnd(-320, 420);
      const closeP = openP + (type === 'buy' ? pips : -pips) * 1e-4;
      const profit = money(pips * volume * 10 * USDRUB / 10); // ~ pips * $/pip * usdrub
      out.push({
        ticket: 90_200_000 + n,
        position: 90_200_000 + n,
        order: 90_200_000 + n + 1,
        symbol: this.symbol,
        type,
        deal_type: type,
        volume,
        price_open: round(openP),
        price_close: round(closeP),
        sl: 0,
        tp: 0,
        profit,
        swap: money(rnd(-60, 0)),
        commission: money(-volume * 700),
        time_open: Math.floor(openMs / 1000),
        time_close: Math.floor(closeMs / 1000),
        comment: '',
      });
      n++;
    }
    return out.sort((a, b) => (b.time_close || 0) - (a.time_close || 0));
  }

  #bal(ticket, ms, amount, deal_type, comment) {
    return {
      ticket, position: 0, order: 0, symbol: '', type: '', deal_type,
      volume: 0, price_open: 0, price_close: 0, sl: 0, tp: 0,
      profit: money(amount), swap: 0, commission: 0,
      time_open: Math.floor(ms / 1000), time_close: Math.floor(ms / 1000), comment,
    };
  }

  #refreshPositions() {
    for (const p of this.positions) {
      p.price_current = round(this.mid);
      p.profit = positionProfit(p, this.mid);
    }
  }

  #floatingProfit() {
    return money(this.positions.reduce((s, p) => s + p.profit + p.swap + p.commission, 0));
  }

  // ---- REST-подобные методы (EA-образные формы) ----

  async getAccount() {
    this.#refreshPositions();
    const floating = this.#floatingProfit();
    const margin = money(this.positions.reduce((s, p) => s + (p.volume * CONTRACT * USDRUB) / this.account.leverage, 0));
    const equity = money(this.account.balance + floating);
    return {
      ...this.account,
      equity,
      margin,
      margin_free: money(equity - margin),
      margin_level: margin > 0 ? money((equity / margin) * 100) : 0,
      profit: floating,
    };
  }

  async getPositions() {
    this.#refreshPositions();
    return { message: 'ok', ordersCount: this.positions.length, opened: this.positions.map((p) => ({ ...p })), pending: [] };
  }

  async getHistory({ from, to } = {}) {
    const f = from ? new Date(from).getTime() / 1000 : 0;
    const t = to ? new Date(to).getTime() / 1000 : Number.MAX_SAFE_INTEGER;
    const data = this.history.filter((d) => (d.time_close || d.time_open) >= f && (d.time_close || d.time_open) <= t);
    return { message: 'ok', orderCount: data.length, data };
  }

  async getCandles({ timeframe = 'M5', count = 300 } = {}) {
    const step = TF_MS[timeframe] || TF_MS.M5;
    const now = Date.now();
    const bars = [];
    let price = this.mid - rnd(0.001, 0.004);
    for (let i = count - 1; i >= 0; i--) {
      const time = new Date(now - i * step);
      const open = price;
      const drift = rnd(-1, 1) * (step / 60e3) * 8e-5;
      const close = open + drift;
      const high = Math.max(open, close) + rnd(0, 1) * 6e-5;
      const low = Math.min(open, close) - rnd(0, 1) * 6e-5;
      bars.push({
        time: time.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, '.'),
        open: round(open), high: round(high), low: round(low), close: round(close),
        volume: Math.floor(rnd(80, 900)),
      });
      price = close;
    }
    this.mid = round(price);
    return { symbol: this.symbol, timeframe, bars };
  }

  async getQuote() {
    const spread = 12e-5;
    return {
      symbol: this.symbol,
      bid: round(this.mid),
      ask: round(this.mid + spread),
      spread: round(spread),
      digits: DIGITS,
      time: new Date().toISOString(),
    };
  }

  // ---- live-поток ----

  start() {
    if (this.timer) return;
    let tick = 0;
    this.timer = setInterval(() => {
      tick++;
      // блуждание цены
      this.mid = round(this.mid + rnd(-1, 1) * 8e-5);
      this.#refreshPositions();
      this.emit('event', {
        type: 'price_update',
        symbol: this.symbol,
        bid: round(this.mid),
        ask: round(this.mid + 12e-5),
        spread: 0.00012,
        digits: DIGITS,
        timestamp: Math.floor(Date.now() / 1000),
      });
      // раз в ~40 тиков (≈32с при 800мс) — закрыть позицию и открыть новую
      if (tick % 40 === 0) this.simulateRoundTrip();
    }, 800);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // Демонстрация события открытия/закрытия сделки.
  simulateRoundTrip() {
    if (!this.positions.length) return;
    const p = this.positions.shift();
    p.price_current = round(this.mid);
    p.profit = positionProfit(p, this.mid);
    const gross = money(p.profit);
    const net = money(p.profit + p.swap + p.commission);
    this.account.balance = money(this.account.balance + net);

    const closed = {
      ticket: p.ticket, position: p.ticket, order: p.ticket + 1,
      symbol: p.symbol, type: p.type, deal_type: p.type,
      volume: p.volume, price_open: p.price_open, price_close: round(this.mid),
      sl: 0, tp: 0, profit: gross, swap: p.swap, commission: p.commission,
      time_open: p.time, time_close: Math.floor(Date.now() / 1000), comment: '',
    };
    this.history.unshift(closed);
    this.emit('event', {
      type: 'trade_event', symbol: p.symbol, ticket: p.ticket,
      side: p.type.toUpperCase(), reason: 'Manual',
      profit: net, gross_profit: gross, swap: p.swap, commission: p.commission,
    });

    // открыть новую взамен
    const type = Math.random() > 0.5 ? 'buy' : 'sell';
    const np = this.#mkPosition(type, Number(rnd(0.1, 0.5).toFixed(2)), this.mid, Date.now());
    this.positions.push(np);
    this.emit('event', {
      type: 'trade_event', symbol: np.symbol, ticket: np.ticket,
      side: type.toUpperCase(), reason: 'Open', profit: 0, gross_profit: 0, swap: 0, commission: np.commission,
    });
  }
}

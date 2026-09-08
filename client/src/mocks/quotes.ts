/**
 * Quote ticker: a tiny pub/sub store that random-walks mock quotes.
 * Demo mode ticks every ~3s (design.md §8). Consume via `useQuotes()`.
 */
import { SYMBOLS, getSymbolMeta, spreadAbs, type SymbolMeta } from './symbols';

export type TickDirection = 'up' | 'down' | 'flat';

export interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  /** Day change in percent, e.g. 0.12. */
  changePct: number;
  /** Direction of the last tick (drives flash animations). */
  direction: TickDirection;
  /** Monotonic tick counter — use as React key to restart flash animations. */
  tick: number;
  /** Timestamp (ms) of the last update. */
  updatedAt: number;
}

const TICK_MS = 3000;

type Listener = () => void;

const listeners = new Set<Listener>();
const state = new Map<string, Quote>();
/** Day open price per symbol, used to derive changePct. */
const dayOpen = new Map<string, number>();
let snapshot: Quote[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let lastUpdate = Date.now();

function round(value: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

function initQuote(meta: SymbolMeta): Quote {
  dayOpen.set(meta.symbol, meta.baseBid / (1 + meta.baseChangePct / 100));
  return {
    symbol: meta.symbol,
    bid: meta.baseBid,
    ask: meta.baseAsk,
    changePct: meta.baseChangePct,
    direction: 'flat',
    tick: 0,
    updatedAt: Date.now(),
  };
}

function tickOne(symbol: string): void {
  const meta = getSymbolMeta(symbol);
  const prev = state.get(symbol);
  if (!meta || !prev) return;
  const step = spreadAbs(meta) * 0.8;
  const delta = (Math.random() - 0.5) * 2 * step;
  const bid = round(prev.bid + delta, meta.digits);
  const open = dayOpen.get(symbol) ?? bid;
  state.set(symbol, {
    ...prev,
    bid,
    ask: round(bid + spreadAbs(meta), meta.digits),
    changePct: (bid / open - 1) * 100,
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
    tick: prev.tick + 1,
    updatedAt: Date.now(),
  });
}

function tickAll(): void {
  state.forEach((_, symbol) => tickOne(symbol));
  lastUpdate = Date.now();
  rebuild();
  listeners.forEach((l) => l());
}

function rebuild(): void {
  snapshot = Array.from(state.values());
}

// Seed the default Market Watch symbols.
for (const meta of SYMBOLS) {
  state.set(meta.symbol, initQuote(meta));
}
rebuild();

export function subscribeQuotes(listener: Listener): () => void {
  listeners.add(listener);
  if (timer === null) timer = setInterval(tickAll, TICK_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function getQuotesSnapshot(): Quote[] {
  return snapshot;
}

export function getQuote(symbol: string): Quote | undefined {
  return state.get(symbol);
}

export function getLastUpdate(): number {
  return lastUpdate;
}

/** Register extra symbols (e.g. added in edit mode) so the ticker walks them too. */
export function ensureSymbols(codes: string[]): void {
  let changed = false;
  for (const code of codes) {
    if (state.has(code)) continue;
    const meta = getSymbolMeta(code);
    if (!meta) continue;
    state.set(code, initQuote(meta));
    changed = true;
  }
  if (changed) {
    rebuild();
    listeners.forEach((l) => l());
  }
}

/** Pull-to-refresh: fake 800ms latency, then a fresh tick. Resolves with update time. */
export function refreshQuotes(): Promise<number> {
  return new Promise((resolve) => {
    setTimeout(() => {
      tickAll();
      resolve(lastUpdate);
    }, 800);
  });
}

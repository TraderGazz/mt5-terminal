/**
 * Editable-deals store for the trade pages (owned by the trade agent).
 *
 * A tiny pub/sub layer ON TOP of the read-only scaffold mocks in
 * `src/mocks/history.ts`: field edits from the TradeEdit page are kept as
 * per-ticket overrides in a Map, so `src/mocks/*` files stay untouched
 * (they are owned by the scaffold / other agents).
 *
 * Consumers read merged deals via `getDeal(ticket)` / `getDeals()` and
 * re-render through `useDealsVersion()` (useSyncExternalStore on a monotonic
 * version counter — snapshots stay referentially stable between mutations).
 */
import { useSyncExternalStore } from 'react';
import { HISTORY, type Deal } from '@/mocks/history';

/** Fields editable on the TradeEdit page (trade-edit.md). */
export interface DealPatch {
  profit?: number;
  swap?: number;
  commission?: number;
  comment?: string;
  openTime?: number;
  closeTime?: number;
  openPrice?: number;
  closePrice?: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();
/** ticket → applied edits (isEdited flag is stored alongside). */
const overrides = new Map<number, DealPatch & { isEdited: true }>();
/** ticket → merged deal cache, invalidated on mutation. */
const mergedCache = new Map<number, Deal>();
let version = 0;

function notify(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function subscribeDeals(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getDealsVersion(): number {
  return version;
}

/** React hook: re-renders the component whenever any deal is edited. */
export function useDealsVersion(): number {
  return useSyncExternalStore(subscribeDeals, getDealsVersion);
}

/** Base deal from the scaffold mock history (no edits applied). */
export function getBaseDeal(ticket: number): Deal | undefined {
  return HISTORY.find((d) => d.ticket === ticket);
}

/** Deal with user edits applied (cached — stable reference between mutations). */
export function getDeal(ticket: number): Deal | undefined {
  const cached = mergedCache.get(ticket);
  if (cached) return cached;
  const base = getBaseDeal(ticket);
  if (!base) return undefined;
  const patch = overrides.get(ticket);
  const merged: Deal = patch ? { ...base, ...patch } : base;
  mergedCache.set(ticket, merged);
  return merged;
}

/** All history deals with edits applied, newest first. */
export function getDeals(): Deal[] {
  return HISTORY.map((d) => getDeal(d.ticket) ?? d);
}

/**
 * Apply edits to a deal: merges the patch, forces `isEdited = true`
 * (drives the «(изм.)» marker) and notifies subscribers.
 */
export function updateDeal(ticket: number, patch: DealPatch): void {
  const prev = overrides.get(ticket);
  overrides.set(ticket, { ...prev, ...patch, isEdited: true });
  mergedCache.delete(ticket);
  notify();
}

/** Remove all edits for a deal (restores mock values, clears «(изм.)»). */
export function resetDeal(ticket: number): void {
  if (!overrides.has(ticket)) return;
  overrides.delete(ticket);
  mergedCache.delete(ticket);
  notify();
}

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';
export const SYMBOL = (import.meta.env.VITE_SYMBOL as string | undefined) ?? 'EURUSD';
export function wsUrl(token: string): string {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  const base =
    explicit ??
    `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
  return `${base}?token=${encodeURIComponent(token)}`;
}

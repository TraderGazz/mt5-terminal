import type { Deal } from '@/mocks/history';
import { formatDateTime, formatPrice, formatVolume } from '@/lib/format';
import { formatPlainMoney } from './utils';

/** Mock trade report generation (history-period.md): HTML window or CSV file. */

function reportRows(deals: Deal[]) {
  return deals.map((d) => ({
    ticket: d.ticket,
    openTime: formatDateTime(d.openTime),
    symbol: d.symbol,
    type: d.type,
    volume: formatVolume(d.volume),
    openPrice: formatPrice(d.openPrice, 5),
    closeTime: formatDateTime(d.closeTime),
    closePrice: formatPrice(d.closePrice, 5),
    swap: formatPlainMoney(d.swap),
    commission: formatPlainMoney(d.commission),
    profit: formatPlainMoney(d.profit),
  }));
}

function totals(deals: Deal[]) {
  const sum = (pick: (d: Deal) => number) => deals.reduce((s, d) => s + pick(d), 0);
  return {
    profit: sum((d) => d.profit),
    swap: sum((d) => d.swap),
    commission: sum((d) => d.commission),
  };
}

function escapeHtml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/** Opens a simple printable HTML report in a new window. */
export function openHtmlReport(deals: Deal[], title: string): boolean {
  const t = totals(deals);
  const total = t.profit + t.swap + t.commission;
  const rows = reportRows(deals)
    .map(
      (r) => `<tr>
<td>${r.ticket}</td><td>${r.openTime}</td><td>${escapeHtml(r.symbol)}</td>
<td class="${r.type === 'sell' ? 'sell' : 'buy'}">${r.type}</td><td>${r.volume}</td>
<td>${r.openPrice}</td><td>${r.closeTime}</td><td>${r.closePrice}</td>
<td>${r.swap}</td><td>${r.commission}</td>
<td class="${r.profit.startsWith('−') ? 'sell' : 'buy'}">${r.profit}</td></tr>`,
    )
    .join('\n');

  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body{font-family:-apple-system,"Segoe UI",Tahoma,sans-serif;margin:24px;color:#000}
h1{font-size:20px;margin:0 0 4px}p.sub{color:#8E8E93;font-size:13px;margin:0 0 16px}
table{border-collapse:collapse;width:100%;font-size:12px;font-variant-numeric:tabular-nums}
th,td{border-bottom:1px solid #E5E5E5;padding:6px 8px;text-align:right;white-space:nowrap}
th:first-child,td:first-child,th:nth-child(3),td:nth-child(3){text-align:left}
th{background:#F2F2F7;font-weight:600}
.buy{color:#007AFF}.sell{color:#FF3B30}
tr.total td{font-weight:700;border-top:2px solid #000}
</style></head><body>
<h1>Торговый отчёт</h1>
<p class="sub">${escapeHtml(title)}</p>
<table>
<thead><tr><th>Тикет</th><th>Открытие</th><th>Символ</th><th>Тип</th><th>Объём</th>
<th>Цена откр.</th><th>Закрытие</th><th>Цена закр.</th><th>Своп</th><th>Комиссия</th><th>Прибыль</th></tr></thead>
<tbody>
${rows}
<tr class="total"><td colspan="8">Итого, ₽</td>
<td>${formatPlainMoney(t.swap)}</td><td>${formatPlainMoney(t.commission)}</td>
<td class="${total < 0 ? 'sell' : 'buy'}">${formatPlainMoney(total)}</td></tr>
</tbody></table>
</body></html>`;

  const w = window.open('', '_blank');
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  return true;
}

/** Downloads a CSV (semicolon-separated, RU Excel friendly) report. */
export function downloadCsvReport(deals: Deal[], title: string): void {
  const header = 'Тикет;Открытие;Символ;Тип;Объём;Цена откр.;Закрытие;Цена закр.;Своп;Комиссия;Прибыль';
  const t = totals(deals);
  const lines = reportRows(deals).map((r) =>
    [
      r.ticket,
      r.openTime,
      r.symbol,
      r.type,
      r.volume,
      r.openPrice,
      r.closeTime,
      r.closePrice,
      r.swap,
      r.commission,
      r.profit,
    ].join(';'),
  );
  const total = t.profit + t.swap + t.commission;
  lines.push(
    ['', '', '', '', '', '', '', 'Итого', formatPlainMoney(t.swap), formatPlainMoney(t.commission), formatPlainMoney(total)].join(';'),
  );
  const csv = `﻿${title}\n${header}\n${lines.join('\n')}`;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'trade-report.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

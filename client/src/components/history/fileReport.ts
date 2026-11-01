import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';

export interface ReportDeal {
  ticket: number; symbol: string; type: string; volume: number;
  openTime: number; openPrice: number; closeTime: number; closePrice: number;
  swap: number; commission: number; profit: number;
}
export interface ReportMeta {
  title: string; login: string; holder: string; company: string; currency: string;
}

const HEADERS = ['Тикет', 'Открытие', 'Символ', 'Тип', 'Объём', 'Цена откр.', 'Закрытие', 'Цена закр.', 'Своп', 'Комиссия', 'Прибыль'];
const money = (value: number) => new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
const amount = (deals: ReportDeal[], key: 'swap' | 'commission' | 'profit') =>
  deals.reduce((sum, deal) => sum + Math.round(Number(deal[key] || 0) * 100), 0) / 100;
const averageProfit = (deals: ReportDeal[]) => {
  if (!deals.length) return 0;
  const totalCents = Math.round(amount(deals, 'profit') * 100);
  return Math.sign(totalCents) * Math.round(Math.abs(totalCents) / deals.length) / 100;
};

function brokerDate(time: number) {
  const date = new Date(time + 3 * 3600000);
  return date.toISOString().slice(0, 16).replace('T', ' ');
}
function values(deal: ReportDeal): (string | number)[] {
  return [String(deal.ticket), brokerDate(deal.openTime), deal.symbol, deal.type,
    deal.volume, deal.openPrice, brokerDate(deal.closeTime), deal.closePrice,
    deal.swap, deal.commission, deal.profit];
}
const accountLine = (meta: ReportMeta) => `Счёт: ${meta.login} · ${meta.holder} · ${meta.company} · ${meta.currency}`;

export async function createExcelReport(deals: ReportDeal[], meta: ReportMeta): Promise<Uint8Array<ArrayBuffer>> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MT5 Terminal';
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet('Торговый отчёт', {
    views: [{ state: 'frozen', ySplit: 5 }],
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:5' },
  });
  sheet.columns = [18, 22, 16, 12, 12, 16, 22, 16, 18, 18, 20].map(width => ({ width }));
  sheet.mergeCells('A1:K1');
  sheet.getCell('A1').value = 'Торговый отчёт';
  sheet.getCell('A1').font = { name: 'Arial', size: 18, bold: true, color: { argb: 'FF17365D' } };
  sheet.getRow(1).height = 30;
  sheet.mergeCells('A2:K2'); sheet.getCell('A2').value = meta.title;
  sheet.mergeCells('A3:K3'); sheet.getCell('A3').value = accountLine(meta);
  sheet.getRow(5).values = HEADERS;
  sheet.getRow(5).height = 28;
  sheet.getRow(5).eachCell(cell => {
    cell.font = { name: 'Arial', bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  deals.forEach((deal, index) => {
    const row = sheet.addRow(values(deal));
    row.font = { name: 'Arial', size: 10 };
    row.height = 20;
    for (const column of [5, 9, 10, 11]) row.getCell(column).numFmt = '#,##0.00;[Red]-#,##0.00';
    for (const column of [6, 8]) row.getCell(column).numFmt = '0.00000';
    if (index % 2 === 1) row.eachCell(cell => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F5F9' } }; });
  });
  const last = 5 + deals.length;
  if (deals.length) sheet.autoFilter = `A5:K${last}`;
  const total = sheet.addRow([]);
  total.getCell(8).value = `Итого, ${meta.currency}`;
  for (const [column, key] of [[9, 'swap'], [10, 'commission'], [11, 'profit']] as const) {
    const letter = String.fromCharCode(64 + column);
    total.getCell(column).value = deals.length ? { formula: `SUM(${letter}6:${letter}${last})`, result: amount(deals, key) } : 0;
    total.getCell(column).numFmt = '#,##0.00;[Red]-#,##0.00';
  }
  total.font = { bold: true, name: 'Arial' };
  const net = sheet.addRow([]);
  sheet.mergeCells(`A${net.number}:H${net.number}`);
  net.getCell(1).value = `Чистая прибыль, ${meta.currency}`;
  net.getCell(11).value = deals.length ? { formula: `SUM(I${total.number}:K${total.number})`, result: Math.round((amount(deals, 'profit') + amount(deals, 'swap') + amount(deals, 'commission')) * 100) / 100 } : 0;
  net.getCell(11).numFmt = '#,##0.00;[Red]-#,##0.00';
  net.font = { bold: true, name: 'Arial' };
  const average = sheet.addRow([]);
  sheet.mergeCells(`A${average.number}:H${average.number}`);
  average.getCell(1).value = `Средний результат сделки, ${meta.currency}`;
  average.getCell(11).value = deals.length ? { formula: `ROUND(K${total.number}/${deals.length},2)`, result: averageProfit(deals) } : 0;
  average.getCell(11).numFmt = '#,##0.00;[Red]-#,##0.00';
  if (!deals.length) sheet.addRow(['За выбранный период сделок нет']);
  const buffer = await workbook.xlsx.writeBuffer();
  return Uint8Array.from(new Uint8Array(buffer));
}

export function pdfReportDefinition(deals: ReportDeal[], meta: ReportMeta): TDocumentDefinitions {
  const profit = amount(deals, 'profit'), swap = amount(deals, 'swap'), commission = amount(deals, 'commission');
  const body: TableCell[][] = [HEADERS.map(text => ({ text, bold: true, color: '#ffffff', fillColor: '#17365d', margin: [0, 3, 0, 3] }))];
  for (const deal of deals) body.push(values(deal).map((value, index) => ({
    text: typeof value === 'number' ? (index === 5 || index === 7 ? value.toFixed(5) : money(value)) : value,
    alignment: typeof value === 'number' ? 'right' : 'left',
  })));
  return {
    info: { title: 'Торговый отчёт', author: meta.company, subject: meta.title },
    pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [24, 26, 24, 30],
    defaultStyle: { font: 'Roboto', fontSize: 7 },
    content: [
      { text: 'Торговый отчёт', fontSize: 18, bold: true, color: '#17365d', margin: [0, 0, 0, 6] },
      { text: meta.title, fontSize: 10, margin: [0, 0, 0, 4] },
      { text: accountLine(meta), fontSize: 9, margin: [0, 0, 0, 14] },
      { text: `Прибыль: ${money(profit)} · Своп: ${money(swap)} · Комиссия: ${money(commission)} ${meta.currency}`, alignment: 'right', fontSize: 9, margin: [0, 12, 0, 4] },
      { text: `Чистая прибыль: ${money((Math.round(profit * 100) + Math.round(swap * 100) + Math.round(commission * 100)) / 100)} ${meta.currency}`, alignment: 'right', bold: true, fontSize: 10 },
      { text: `Средний результат сделки: ${money(averageProfit(deals))} ${meta.currency}`, alignment: 'right', fontSize: 9, margin: [0, 4, 0, 0] },
      { text: ' ' },
      { table: { headerRows: 1, dontBreakRows: true, widths: ['auto', 67, 'auto', 25, 30, 43, 67, 43, 48, 48, 55], body }, layout: 'lightHorizontalLines' },
      ...(!deals.length ? [{ text: 'За выбранный период сделок нет', margin: [0, 8, 0, 0] as [number, number, number, number] }] : []),
    ],
    footer: (current, pages) => ({ text: `${current} / ${pages}`, alignment: 'right', margin: [24, 8, 24, 0], fontSize: 8 }),
  };
}

export async function createPdfReport(deals: ReportDeal[], meta: ReportMeta): Promise<Blob> {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js'),
  ]);
  return new Promise(resolve => pdfMake.createPdf(pdfReportDefinition(deals, meta), undefined, undefined, fonts as unknown as Record<string, string>).getBlob(resolve));
}

export async function downloadFileReport(kind: 'xlsx' | 'pdf', deals: ReportDeal[], meta: ReportMeta): Promise<void> {
  const blob = kind === 'pdf' ? await createPdfReport(deals, meta)
    : new Blob([await createExcelReport(deals, meta)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `trade-report-${meta.login}.${kind}`;
  document.body.append(link); link.click(); link.remove();
  // Mobile browsers may start the actual download after the click handler.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

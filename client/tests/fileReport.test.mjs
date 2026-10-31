import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createExcelReport, createPdfReport, pdfReportDefinition } from '../src/components/history/fileReport.ts';

const meta = {
  title: 'История: Все символы · Последний год', login: '1100013454',
  holder: 'Чулюков Сергей Анатольевич', company: 'ООО «Альфа-Форекс»', currency: 'RUB',
};
const deals = [
  {ticket:2031164191, symbol:'EURUSDrfd',type:'buy',volume:0.1,openTime:Date.UTC(2026,9,1,10),openPrice:1.12844,closeTime:Date.UTC(2026,9,29,14,45),closePrice:1.11533,swap:-112393.55,commission:-0.01,profit:-30594.23},
  {ticket:2031165019, symbol:'EURUSDrfd',type:'sell',volume:1.5,openTime:Date.UTC(2026,9,1,10),openPrice:1.12366,closeTime:Date.UTC(2026,9,29,14,56),closePrice:1.11606,swap:0,commission:0,profit:98808.88},
];

test('Excel is an actual workbook with branded account, numeric cells and cached formula totals', async () => {
  const bytes = await createExcelReport(deals, meta);
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), 'PK');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  const sheet = workbook.worksheets[0];
  assert.ok(sheet.getCell('A3').value.includes(meta.login));
  assert.ok(sheet.getCell('A3').value.includes(meta.holder));
  assert.equal(sheet.getCell('B6').value, '2026-10-01 13:00');
  assert.equal(sheet.getCell('E6').value, 0.1);
  assert.equal(sheet.getCell('F6').value, 1.12844);
  assert.equal(sheet.getCell('I6').value, -112393.55);
  assert.equal(sheet.getCell('K8').value.result, 68214.65);
  assert.equal(sheet.getCell('K9').value.result, -44178.91);
  assert.equal(sheet.getCell('K8').value.formula, 'SUM(K6:K7)');
  if (process.env.REPORT_TEST_OUTPUT_DIR) {
    await mkdir(process.env.REPORT_TEST_OUTPUT_DIR, {recursive:true});
    await writeFile(path.join(process.env.REPORT_TEST_OUTPUT_DIR, 'trade-report.xlsx'), bytes);
  }
});

test('empty period produces zero totals without invalid formula ranges', async () => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await createExcelReport([], meta));
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell('K6').value, 0);
  assert.equal(sheet.getCell('K7').value, 0);
  assert.equal(pdfReportDefinition([], meta).pageOrientation, 'landscape');
});

test('PDF is a real downloadable PDF and supports long multipage trade tables', async () => {
  const longDeals = Array.from({length:150}, (_, i) => ({...deals[i % 2], ticket:2031164191+i}));
  for (const [name, rows] of [['trade-report',deals], ['trade-report-long',longDeals], ['trade-report-empty',[]]]) {
    const pdf = await createPdfReport(rows, meta);
    const bytes = new Uint8Array(await pdf.arrayBuffer());
    assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), '%PDF');
    assert.ok(bytes.length > 5000);
    if (process.env.REPORT_TEST_OUTPUT_DIR) {
      await mkdir(process.env.REPORT_TEST_OUTPUT_DIR, {recursive:true});
      await writeFile(path.join(process.env.REPORT_TEST_OUTPUT_DIR, `${name}.pdf`), bytes);
    }
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { toHtml } from '../routes/admin.js';

test('report adds clean profit while keeping trade profit and profit factor unchanged', () => {
  const rows = [
    {ticket:1,deal_type:'buy',type:'buy',symbol:'EURUSD',volume:1,profit:100,swap:-30,commission:-2},
    {ticket:2,deal_type:'sell',type:'sell',symbol:'EURUSD',volume:1,profit:-20,swap:-10,commission:-1},
  ];
  const html = toHtml(rows,{login:'123',holder:'Тест',company:'Тест',currency:'RUB',account:{balance:37,equity:37}});
  assert.match(html,/Прибыль по сделкам:<\/td><td nowrap><b>80\.00<\/b>/);
  assert.match(html,/Чистая прибыль:<\/td><td nowrap><b>37\.00<\/b>/);
  assert.match(html,/Прибыльность:<\/td><td nowrap><b>5\.00<\/b>/);
  assert.match(html,/Средний результат сделки:<\/td><td nowrap><b>40\.00<\/b>/);
  assert.ok(html.includes('Положительные сделки:'));
  assert.ok(html.includes('Отрицательные сделки:'));
});

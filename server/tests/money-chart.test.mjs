import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { cents, roundMoney, addMoney, tradeDelta } from '../services/money.js';

test('money rounds positive and negative half-kopecks as posted NUMERIC values', () => {
  assert.equal(roundMoney(1.005), 1.01);
  assert.equal(roundMoney(-1.005), -1.01);
  assert.equal(cents(123456.005), 12345601);
  assert.equal(cents(0.004999999999), 0);
  assert.equal(cents(1e-8), 0);
  assert.equal(tradeDelta(-30594.234, -112393.554, -26757.05, -2393.55), -113837.18);
});
test('sub-kopeck position results cannot accumulate into a two-kopeck balance difference', () => {
  let balanceOffset = 0;
  for (let i = 0; i < 5; i++) {
    balanceOffset = addMoney(balanceOffset, tradeDelta(100.004, -10, 100, -10));
  }
  assert.equal(balanceOffset, 0);
  assert.equal(addMoney(483162.85, -113837.18, -113836.70), 255488.97);
  assert.throws(() => roundMoney(Infinity));
});
test('weekly/monthly requests ask EA for their own timeframe and enough history', async () => {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(new URL(req.url, 'http://localhost'));
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ data: [] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const saved = process.env.MT5_BRIDGE_URL;
  process.env.MT5_BRIDGE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    const { RealBridge } = await import('../services/mt5-bridge/real.js');
    const bridge = new RealBridge();
    for (const timeframe of ['M1', 'D1', 'W1', 'MN1']) await bridge.getCandles({ timeframe, count: 360 });
    const spans = requests.map(u => ({
      tf: u.searchParams.get('time_frame'),
      days: (new Date(u.searchParams.get('to_date')) - new Date(u.searchParams.get('from_date'))) / 86400000,
    }));
    assert.deepEqual(spans.map(x => x.tf), ['M1', 'D1', 'W1', 'MN1']);
    assert.ok(spans[0].days <= 2);
    assert.ok(spans[1].days >= 540);
    assert.ok(spans[2].days >= 360 * 7);
    assert.ok(spans[3].days >= 360 * 31);
  } finally {
    if (saved === undefined) delete process.env.MT5_BRIDGE_URL;
    else process.env.MT5_BRIDGE_URL = saved;
    await new Promise(resolve => server.close(resolve));
  }
});
test('actual desktop draw narrows sparse candles when zooming out', async () => {
  const source = await readFile(new URL('../../desktop/public/app.js', import.meta.url), 'utf8');
  const draw = source.split('\n').find(line => line.startsWith('const canvas=') && line.includes('function draw()'));
  assert.ok(draw);
  const context = vm.createContext({ result: null });
  vm.runInContext(`
    const noop = () => {};
    const fakeContext = new Proxy({}, { get: (target, key) => target[key] ?? noop, set: (target, key, value) => (target[key] = value, true) });
    const element = { getContext: () => fakeContext, getBoundingClientRect: () => ({width: 1200, height: 600}) };
    const $ = () => element;
    const devicePixelRatio = 1;
    const state = {zoom:1,offset:0,shift:true,grid:false,type:'candles',lines:[],bid:1.1,tf:'W1',symbol:'EURUSD'};
    const bars = Array.from({length: 12}, (_, i) => ({t: Date.UTC(2026, 0, i + 1), o: 1.1, h: 1.2, l: 1, c: 1.15}));
    let view, mouse = null;
    ${draw}
    draw(); const initial = view.step;
    state.zoom = .25; draw();
    result = { initial, zoomedOut: view.step };
  `, context);
  assert.ok(context.result.zoomedOut < context.result.initial / 3);
});

test('native renderer also permits zooming out with only twelve W1/MN bars', async () => {
  const source = await readFile(new URL('../../desktop/public/native.js', import.meta.url), 'utf8');
  const renderer = source.split('\n').find(line => line.startsWith('function renderPriceCanvas('));
  assert.ok(renderer);
  const context = vm.createContext({ result: null });
  vm.runInContext(`
    const noop = () => {};
    const ctx = new Proxy({measureText: () => ({width: 40})}, { get: (target, key) => target[key] ?? noop, set: (target, key, value) => (target[key] = value, true) });
    const canvas = { getContext: () => ctx, getBoundingClientRect: () => ({width: 1200, height: 600}) };
    const devicePixelRatio = 1, periods = {W1:10080, MN:43200};
    const px = value => value.toFixed(5);
    const data = Array.from({length: 12}, (_, i) => ({t: Date.UTC(2026, 0, i + 1), o: 1.1, h: 1.2, l: 1, c: 1.15}));
    ${renderer}
    result = ['W1','MN'].map(tf => {
      const opt = {tf,zoom:1,shift:true,type:'candles',quote:1.1};
      return [renderPriceCanvas(canvas,data,opt).step, renderPriceCanvas(canvas,data,{...opt,zoom:.25}).step];
    });
  `, context);
  for (const [initial, zoomedOut] of context.result) assert.ok(zoomedOut < initial / 3);
});

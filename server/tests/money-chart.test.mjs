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
  let failures = 0;
  const server = http.createServer((req, res) => {
    requests.push(new URL(req.url, 'http://localhost'));
    res.setHeader('Content-Type', 'application/json');
    if (failures > 0) {
      failures--;
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Failed to retrieve data' }));
      return;
    }
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
    failures = 1;
    await bridge.getCandles({ timeframe: 'MN1', count: 360 });
    assert.equal(requests.length, 6);
    assert.equal(requests[4].search, requests[5].search);
    failures = 2;
    await bridge.getCandles({ timeframe: 'MN1', count: 360 });
    assert.equal(requests.length, 9);
    assert.ok(requests[8].searchParams.get('from_date') > requests[7].searchParams.get('from_date'));
    failures = 3;
    await assert.rejects(bridge.getCandles({ timeframe: 'MN1', count: 360 }), /HTTP 500/);
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
      const initial = renderPriceCanvas(canvas,data,opt);
      const small = renderPriceCanvas(canvas,data,{...opt,zoom:.25});
      return [initial.step, small.step, initial.x(11), small.x(11), initial.pw * .81];
    });
  `, context);
  for (const [initial, zoomedOut, lastX, smallLastX, rightEdge] of context.result) {
    assert.ok(zoomedOut < initial / 3);
    assert.ok(Math.abs(lastX - rightEdge) < initial);
    assert.ok(Math.abs(smallLastX - rightEdge) < initial);
  }
});

test('desktop loads W1/MN1, ignores stale responses and exposes load failures', async () => {
  const source = await readFile(new URL('../../desktop/public/live.js', import.meta.url), 'utf8');
  const start = source.indexOf('  let candleUnsub = null;');
  const end = source.indexOf('// Служебная строка прототипа', start);
  assert.ok(start > 0 && end > start);
  const requests = [], displayed = [], elements = {};
  elements.chart = { append: node => { elements[node.id] = node; } };
  const context = vm.createContext({
    document: {
      getElementById: id => elements[id],
      createElement: () => ({ style: {}, replaceChildren() {}, append() {} }),
      createTextNode: text => text,
    },
    api: (path, options) => new Promise((resolve, reject) => requests.push({ path, options, resolve, reject })),
    ws: { on: () => () => {} },
    terminalAPI: { setBars: data => displayed.push(data) },
    console: { error() {} },
  });
  vm.runInContext(source.slice(start, end) + '\nglobalThis.load = loadCandles;', context);
  context.load('W1');
  context.load('MN');
  assert.equal(requests[0].options.query.timeframe, 'W1');
  assert.equal(requests[1].options.query.timeframe, 'MN1');
  requests[0].resolve({bars:[{time:1,open:1,high:2,low:0,close:1}]});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(displayed.length, 0);
  requests[1].reject(new Error('HTTP 502'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(elements.candleStatus.style.display, 'flex');
  context.load('W1');
  requests[2].resolve({bars:[{time:1,open:1,high:2,low:0,close:1}]});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(displayed.length, 1);
  assert.equal(elements.candleStatus.style.display, 'none');
});

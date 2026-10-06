// Слой подключения реальных данных поверх присланного прототипа. Намеренно
// не трогает app.js/header.js/sidebar.js/native.js/interaction.js — только
// добавляется ПОСЛЕДНИМ скриптом и использует тот же приём "обёртки поверх
// предыдущего слоя" (const prev=fn; fn=function(){prev(); ...}), что и сами
// эти файлы между собой (см. README проекта). Так проще принимать будущие
// обновления дизайна от заказчика без конфликтов.
//
// Контракт с бэкендом — тот же, что у мобильной версии и у прежнего
// React-черновика desktop/ (api/http.ts, auth.ts, ws.ts, rest.ts) — здесь
// просто переписан на обычный JS без сборки.
(() => {
  const API_URL = '/api';
  const TOKEN_KEY = 'mt5pc-token';
  const SUPPORTED_TF = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

  const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
  const clearToken = () => {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('mt5pc-user'); } catch { /* */ }
  };
  const logout = () => { clearToken(); location.reload(); };

  async function api(path, opts = {}) {
    const url = new URL(`${API_URL}${path}`, location.origin);
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: opts.method || 'GET', headers });
    if (res.status === 401) { clearToken(); throw new Error('Не авторизован'); }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error((data && data.error) || `Ошибка ${res.status}`);
    return data;
  }

  // --- WS-клиент: тот же протокол, что в client/desktop api/ws.ts ---------
  class WsClient {
    constructor() {
      this.ws = null;
      this.handlers = new Map();
      this.channels = new Set();
      this.timer = null;
      this.delay = 1000;
    }
    connect() {
      if (this.ws) return;
      const token = getToken();
      if (!token) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      let ws;
      try { ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`); }
      catch { this.retry(); return; }
      this.ws = ws;
      ws.onopen = () => { this.delay = 1000; if (this.channels.size) this.send({ op: 'subscribe', channels: [...this.channels] }); };
      ws.onmessage = (e) => {
        let m; try { m = JSON.parse(e.data); } catch { return; }
        if (!m.channel) return;
        (this.handlers.get(m.channel) || []).forEach((h) => h(m.data));
      };
      ws.onclose = () => { this.ws = null; this.retry(); };
      ws.onerror = () => { try { ws.close(); } catch { /* */ } };
    }
    retry() {
      if (this.timer) return;
      this.timer = setTimeout(() => { this.timer = null; this.delay = Math.min(this.delay * 1.6, 15000); this.connect(); }, this.delay);
    }
    send(o) { if (this.ws && this.ws.readyState === WebSocket.OPEN) { try { this.ws.send(JSON.stringify(o)); } catch { /* */ } } }
    on(channel, h) {
      let set = this.handlers.get(channel);
      if (!set) { set = new Set(); this.handlers.set(channel, set); }
      set.add(h);
      if (!this.channels.has(channel)) { this.channels.add(channel); this.connect(); this.send({ op: 'subscribe', channels: [channel] }); }
      return () => { set.delete(h); };
    }
  }
  const ws = new WsClient();

  // --- Выход: добавляем явную кнопку в заголовок окна (не трогаем чужую
  // разметку window-controls, просто вставляем перед ней) ------------------
  function mountLogout() {
    const controls = document.querySelector('.window-controls');
    if (!controls) return;
    let btn = controls.querySelector('.live-logout');
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'live-logout';
      btn.style.cssText = 'font-size:12px;padding:0 10px;';
      controls.prepend(btn);
    }
    const logged = !!getToken();
    btn.textContent = logged ? 'Выйти' : 'Войти';
    btn.title = logged ? 'Выйти из терминала' : 'Войти в торговый счёт';
    btn.onclick = logged ? logout : openAccountDialog;
  }

  // --- Реквизиты счёта: патчим заголовок окна и Навигатор после того, как
  // прототип отрисует свои хардкодные значения ------------------------------
  let accountInfo = null;
  function patchCaption() {
    if (!accountInfo) return;
    const caption = `${accountInfo.login} - ${accountInfo.server} - Hedge - ${accountInfo.company}`;
    document.title = caption;
    const el = document.getElementById('windowCaption');
    if (el) el.textContent = caption;
  }
  function patchNavigator() {
    if (!getToken()) {
      document.querySelectorAll('.tree-account').forEach((b) => b.closest('.tree-branch')?.remove());
      return;
    }
    if (!accountInfo) return;
    const btn = document.querySelector('.tree-account');
    if (!btn) return;
    const label = `${accountInfo.login}: ${accountInfo.holder}`;
    btn.title = label;
    const span = btn.querySelector('span');
    if (span) span.textContent = label;
  }
  if (typeof renderNavigator === 'function') {
    const prevRenderNavigator = renderNavigator;
    renderNavigator = function (...args) { prevRenderNavigator(...args); patchNavigator(); };
  }
  if (typeof switchSymbol === 'function') {
    const prevSwitchSymbol = switchSymbol;
    switchSymbol = function (...args) { prevSwitchSymbol(...args); patchCaption(); };
  }
  if (typeof action === 'function') {
    const prevAction = action;
    action = function (cmd, e) {
      prevAction(cmd, e);
      patchCaption();
      if (typeof cmd === 'string' && cmd.startsWith('tf:')) {
        const tf = cmd.slice(3);
        if (SUPPORTED_TF.includes(tf)) loadCandles(tf);
      }
    };
  }

  function loadAccount() {
    api('/account')
      .then((r) => { accountInfo = r.account; patchCaption(); patchNavigator(); patchTotals(); })
      .catch(() => {});
  }

  // --- Позиции -------------------------------------------------------------
  // Торговля: новые позиции сверху, самые старые внизу.
  const sortNewestFirst = (arr) => arr.sort((a, b) => (b.time ?? 0) - (a.time ?? 0));

  function mapPosition(p) {
    return {
      id: p.id,
      symbol: p.symbol,
      time: p.openTime ? new Date(p.openTime).getTime() : Date.now(),
      type: p.type,
      volume: p.volume,
      open: p.openPrice,
      sl: p.stopLoss || 0,
      tp: p.takeProfit || 0,
      swap: p.swap || 0,
      profit: p.profit,
    };
  }
  function loadPositions() {
    api('/positions')
      .then((r) => terminalAPI.setPositions(sortNewestFirst((r.positions || []).map(mapPosition))))
      .catch(() => {});
  }

  // --- История ---------------------------------------------------------------
  function mapHistoryRow(r) {
    return {
      id: r.ticket,
      symbol: r.symbol,
      time: r.openTime ? new Date(r.openTime).getTime() : null,
      type: r.type || r.dealType,
      volume: r.volume,
      open: r.openPrice,
      sl: r.stopLoss || 0,
      tp: r.takeProfit || 0,
      close: r.closePrice,
      closed: r.closeTime ? new Date(r.closeTime).getTime() : null,
      profit: r.profit,
      swap: r.swap || 0,
    };
  }
  function loadHistory() {
    // period:'all' тянет ВСЮ историю (на реальном счёте — тысячи сделок) —
    // та же причина, из-за которой тормозила История в мобильной версии.
    // Показываем только последние 2000 закрытых сделок (как и в мобильной) —
    // таблица прототипа рисует весь список разом, без подгрузки порциями.
    api('/history', { query: { tab: 'positions', period: 'year', sort: 'default' } })
      .then((r) => {
        const rows = (r.rows || [])
          .map(mapHistoryRow)
          .sort((a, b) => (a.closed ?? a.time ?? 0) - (b.closed ?? b.time ?? 0))
          .slice(-2000);
        terminalAPI.setHistory(rows);
      })
      .catch(() => {});
  }

  // --- Итоговая строка под таблицей (Торговля/История) — у прототипа она
  // декоративная (локальный sim.balance/"Пополнение: 100 000.00"), подменяем
  // на реальные цифры: те же, что заказчик видит на сайте (мобильная
  // версия) — официальная выписка + ручные записи, без мусора от EA.
  let historyTotals = null;
  function loadHistoryTotals() {
    api('/history/totals', { query: { period: 'year' } })
      .then((r) => { historyTotals = r.totals; patchTotals(); })
      .catch(() => {});
  }
  function patchTotals() {
    const el = document.getElementById('totals');
    if (!el) return;
    if (!getToken()) {
      el.innerHTML = state.tab === 'history'
        ? '•　Прибыль: 0.00　Кредит: 0.00　Пополнение: 0.00　Снятие: 0.00　Баланс: 0.00<span>0.00</span>'
        : '•　Баланс: 0.00　Средства: 0.00　Свободная маржа: 0.00　Маржа: 0.00　Уровень маржи: —<span>0.00</span>';
      return;
    }
    if (state.tab === 'history' && historyTotals) {
      el.innerHTML = `•　Прибыль: ${fmt(historyTotals.profit)}　Кредит: 0.00　Пополнение: ${fmt(historyTotals.deposit)}　Снятие: ${fmt(historyTotals.withdrawal)}　Баланс: ${fmt(historyTotals.balance)}<span>${fmt(historyTotals.profit)}</span>`;
    } else if (state.tab !== 'history' && accountInfo && typeof accountInfo.balance === 'number') {
      const currency = accountInfo.currency || 'EUR';
      // Прибыль внизу — сумма по строкам таблицы (как у заказчика в MT5), а не общий показатель моста.
      const floating = accountInfo.equity - accountInfo.balance;
      const level = typeof accountInfo.marginLevel === 'number' ? `${fmt(accountInfo.marginLevel)}%` : '—';
      el.innerHTML = `•　Баланс: ${fmt(accountInfo.balance)} ${currency}　Средства: ${fmt(accountInfo.equity)}　Свободная маржа: ${fmt(accountInfo.freeMargin)}　Маржа: ${fmt(accountInfo.margin)}　Уровень маржи: ${level}<span>${fmt(floating)}</span>`;
    }
  }
  // Новые позиции — внизу списка: при входе на вкладку и при первой загрузке
  // строк прокручиваем таблицу к низу, чтобы сразу были видны самые свежие.
  let lastTab = null;
  let lastRowCount = 0;
  let historySortSet = false;
  if (typeof table === 'function') {
    const prevTable = table;
    table = function (...args) {
      // По умолчанию история отсортирована по времени (колонка «Время», по возрастанию), как в оригинале.
      if (!historySortSet && state.tab === 'history') {
        historySortSet = true;
        if (!state.sort) state.sort = { index: 7, dir: 1 };
      }
      prevTable(...args);
      patchTotals();
      const sc = document.getElementById('tableScroll');
      const rowCount = document.querySelectorAll('#tableScroll tbody tr').length;
      if (sc && (state.tab !== lastTab || (lastRowCount === 0 && rowCount > 0))) {
        const toBottom = () => { sc.scrollTop = sc.scrollHeight; };
        toBottom();
        setTimeout(toBottom, 300);
        setTimeout(toBottom, 1000);
      }
      lastTab = state.tab;
      lastRowCount = rowCount;
    };
  }

  // --- Свечи -----------------------------------------------------------------
  let candleUnsub = null;
  function loadCandles(tf) {
    if (candleUnsub) { candleUnsub(); candleUnsub = null; }
    api('/candles', { query: { timeframe: tf, count: tf === 'M1' ? 1000 : 300 } })
      .then((r) => {
        terminalAPI.setBars((r.bars || []).map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close })));
      })
      .catch(() => {});
    candleUnsub = ws.on(`candle:${tf}`, (d) => {
      const bars = d && d.bars;
      if (!bars || !bars.length) return;
      terminalAPI.setBars(bars.map((c) => ({ t: c.time * 1000, o: c.open, h: c.high, l: c.low, c: c.close })));
    });
  }

  // Служебная строка прототипа «Пополнение 100 000» (deposit) — не реальные данные, убираем.
  if (typeof visibleRows === 'function') {
    const prevVisibleRows = visibleRows;
    visibleRows = function (...args) { return prevVisibleRows(...args).filter((p) => p !== deposit); };
  }

  // Линии на графике (координаты — время и цена, переживут смену ТФ и
  // перезагрузку) — сохраняем в localStorage по символу, как объекты в MT5.
  const linesKey = () => `mt5-lines-${state.symbol}`;
  function saveLines() {
    try { localStorage.setItem(linesKey(), JSON.stringify(state.lines)); } catch { /* */ }
  }
  function loadLines() {
    try {
      const saved = JSON.parse(localStorage.getItem(linesKey()) || '[]');
      if (Array.isArray(saved)) state.lines.splice(0, state.lines.length, ...saved);
    } catch { /* */ }
  }
  // Фракталы Вильямса и Ишимоку — всегда на графике, как в оригинальном MT5.
  const INDICATORS_KEY = 'mt5-indicators';
  const indFlags = () => {
    try { return { fractals: true, ichimoku: true, ...JSON.parse(localStorage.getItem(INDICATORS_KEY) || '{}') }; }
    catch { return { fractals: true, ichimoku: true }; }
  };
  function openIndicatorsDialog() {
    const f = indFlags();
    modal('Индикаторы', `
      <div style="font:12px Tahoma,Arial,sans-serif;color:#000;min-width:260px">
        <p><label><input type="checkbox" data-ind="fractals" ${f.fractals ? 'checked' : ''}> Фракталы Вильямса</label></p>
        <p><label><input type="checkbox" data-ind="ichimoku" ${f.ichimoku ? 'checked' : ''}> Ишимоку Кинко Хёо</label></p>
      </div>`);
  }
  document.addEventListener('change', (e) => {
    const key = e.target.dataset && e.target.dataset.ind;
    if (!key) return;
    localStorage.setItem(INDICATORS_KEY, JSON.stringify({ ...indFlags(), [key]: e.target.checked }));
    draw();
  });

  function drawIndicators(f) {
    if (!view || bars.length < 60) return;
    const { begin, end, pw, ph } = view;
    const X = (g) => view.x(g - begin);
    const Y = (p) => view.y(p);
    const hiR = (a, b) => { let m = -Infinity; for (let i = a; i <= b; i++) m = Math.max(m, bars[i].h); return m; };
    const loR = (a, b) => { let m = Infinity; for (let i = a; i <= b; i++) m = Math.min(m, bars[i].l); return m; };
    const n = bars.length;
    const tenkan = (p) => (hiR(p - 8, p) + loR(p - 8, p)) / 2;
    const kijun = (p) => (hiR(p - 25, p) + loR(p - 25, p)) / 2;
    const spanB = (p) => (hiR(p - 51, p) + loR(p - 51, p)) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, pw, ph);
    ctx.clip();

    if (f.fractals) {
    // Фракталы: 5 свечей, максимум (или минимум) выше/ниже двух соседей с каждой стороны.
    ctx.fillStyle = '#2b6cb0';
    for (let k = Math.max(2, begin); k < Math.min(n - 2, end); k++) {
      const b = bars[k];
      const up = bars[k - 2].h < b.h && bars[k - 1].h < b.h && bars[k + 1].h < b.h && bars[k + 2].h < b.h;
      const dn = bars[k - 2].l > b.l && bars[k - 1].l > b.l && bars[k + 1].l > b.l && bars[k + 2].l > b.l;
      if (up) { ctx.beginPath(); ctx.moveTo(X(k), Y(b.h) - 3); ctx.lineTo(X(k) - 4, Y(b.h) - 9); ctx.lineTo(X(k) + 4, Y(b.h) - 9); ctx.fill(); }
      if (dn) { ctx.beginPath(); ctx.moveTo(X(k), Y(b.l) + 3); ctx.lineTo(X(k) - 4, Y(b.l) + 9); ctx.lineTo(X(k) + 4, Y(b.l) + 9); ctx.fill(); }
    }

    }
    if (f.ichimoku) {
    // Ишимоку: Тенкан (9), Кийджун (26), Senkou A/B (52, сдвиг +26), Чикоу (сдвиг −26).
    const from = Math.max(begin, 52), to = Math.min(end, n);
    const line = (color, fn) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath();
      let started = false;
      for (let g = from; g < to; g++) {
        const v = fn(g);
        if (v == null) { started = false; continue; }
        if (!started) { ctx.moveTo(X(g), Y(v)); started = true; } else ctx.lineTo(X(g), Y(v));
      }
      ctx.stroke();
    };
    line('#e53935', (g) => tenkan(g));
    line('#1e88e5', (g) => kijun(g));
    line('#43a047', (g) => (g + 26 < n ? bars[g + 26].c : null));
    // Облако: между Senkou A (тенкан+кийджун)/2 и Senkou B, сдвинутыми на +26 вперёд.
    const sA = (g) => (g - 26 >= 52 ? (tenkan(g - 26) + kijun(g - 26)) / 2 : null);
    const sB = (g) => (g - 26 >= 52 ? spanB(g - 26) : null);
    ctx.fillStyle = 'rgba(67,160,71,0.12)';
    ctx.beginPath();
    let open = false;
    for (let g = from; g < to + 26; g++) {
      const a = sA(g), bb = sB(g);
      if (a == null || bb == null) { open = false; continue; }
      if (!open) { ctx.moveTo(X(g), Y(a)); open = true; } else ctx.lineTo(X(g), Y(a));
    }
    for (let g = Math.min(to + 26, end + 26) - 1; g >= from; g--) {
      const bb = sB(g);
      if (bb != null) ctx.lineTo(X(g), Y(bb));
    }
    ctx.closePath();
    ctx.fill();
    line('#f9a825', (g) => sA(g));
    line('#8e24aa', (g) => sB(g));
    }
    ctx.restore();
  }

  let saveTimer = null;
  if (typeof draw === 'function') {
    const prevDraw = draw;
    draw = function (...args) {
      prevDraw(...args);
      try { const f = indFlags(); if (f.fractals || f.ichimoku) drawIndicators(f); } catch { /* индикатор не должен ломать график */ }
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveLines, 300);
    };
  }

  // Окно счёта по клику на счёт в Навигаторе: без входа — форма логина
  // (сервер подставлен), после входа — реквизиты и статус подключения.
  function showLoginForm() {
    modal('Подключение', `
      <div style="font:12px Tahoma,Arial,sans-serif;width:380px;color:#000">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
          <img src="mt5-logo.png" alt="" style="width:40px;height:40px">
          <div>Авторизация позволяет получить доступ к торговому счету.</div>
        </div>
        <table style="width:100%;font:12px Tahoma,Arial,sans-serif;border-collapse:collapse">
          <tr><td style="width:70px;padding:3px 0">Логин:</td><td><input id="mt5Login" autocomplete="username" style="width:100%;box-sizing:border-box;height:22px"></td></tr>
          <tr><td style="padding:3px 0">Пароль:</td><td><input id="mt5Pass" type="password" autocomplete="current-password" style="width:100%;box-sizing:border-box;height:22px"></td></tr>
          <tr><td></td><td style="padding:4px 0"><label><input type="checkbox"> Сохранить пароль</label></td></tr>
          <tr><td style="padding:3px 0">Сервер:</td><td><input value="AlfaForexRU-Real" disabled style="width:100%;box-sizing:border-box;height:22px"></td></tr>
        </table>
        <p id="mt5LoginErr" style="color:#c00;min-height:16px;margin:6px 0"></p>
        <div style="text-align:right;margin-top:8px">
          <button type="button" id="mt5LoginBtn" style="min-width:80px;height:24px">ОК</button>
          <button value="cancel" style="min-width:80px;height:24px;margin-left:6px">Отмена</button>
        </div>
      </div>`);
  }
  async function doLogin() {
    const login = document.getElementById('mt5Login')?.value.trim() || '';
    const password = document.getElementById('mt5Pass')?.value || '';
    const err = document.getElementById('mt5LoginErr');
    if (err) err.textContent = '';
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.token) throw new Error(data?.error || 'Неверный логин или пароль');
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem('mt5pc-user', JSON.stringify(data.user));
      location.reload();
    } catch (e) {
      if (err) err.textContent = e.message || 'Нет связи с сервером';
    }
  }
  document.addEventListener('click', (e) => { if (e.target.id === 'mt5LoginBtn') doLogin(); });

  function openAccountDialog() {
    showLoginForm();
  }

  function init() {
    loadLines();
    draw();
    table();
    terminalAPI.setDemoRunning(false);
    mountLogout();
    document.querySelectorAll('.demo-status').forEach((e) => e.remove());
    document.addEventListener('click', (e) => {
      if (!e.target.closest) return;
      if (e.target.closest('.tree-account')) { openAccountDialog(); return; }
      const summary = e.target.closest('summary');
      if (summary && summary.textContent.trim() === 'Счета' && !getToken()) openAccountDialog();
      if (summary && summary.textContent.trim() === 'Индикаторы') openIndicatorsDialog();
    });
    if (!getToken()) {
      const cap = document.getElementById('windowCaption');
      if (cap) cap.textContent = 'MetaTrader 5 — Торговый терминал';
      document.title = 'MetaTrader 5';
      patchNavigator();
    }
    document.querySelectorAll('.terminal-emblem').forEach((e) => e.style.setProperty('background', 'transparent url(mt5-logo.png) center/20px 20px no-repeat', 'important'));
    startData();
  }

  let dataStarted = false;
  function startData() {
    if (dataStarted || !getToken()) return;
    dataStarted = true;
    loadAccount();
    // WS-пуш 'account' — это сырой bridge.account() (только живые цифры:
    // баланс/маржа/...), холдер/компания там нет — их добавляет только
    // REST /api/account (добор из БД). Мёржим поверх уже загруженных
    // реквизитов, а не заменяем целиком — иначе после первого WS-тика
    // ФИО/компания превращались бы в undefined.
    ws.on('account', (d) => { accountInfo = { ...accountInfo, ...d }; patchCaption(); patchNavigator(); patchTotals(); });
    loadPositions();
    ws.on("positions", (d) => terminalAPI.setPositions(sortNewestFirst((d || []).map(mapPosition))));
    loadHistory();
    loadHistoryTotals();
    // Мост шлёт котировки по ВСЕМ инструментам в один канал 'quote' — без
    // фильтра по символу сюда прилетала, например, цена золота или рубля и
    // ломала график активного EURUSD (ровно так и было до этой правки).
    ws.on('quote', (q) => {
      if (q && q.symbol === state.symbol && typeof q.bid === 'number' && typeof q.ask === 'number') {
        terminalAPI.setQuote(q.bid, q.ask);
      }
    });
    loadCandles(typeof state !== 'undefined' && SUPPORTED_TF.includes(state.tf) ? state.tf : 'H4');
    ws.connect();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

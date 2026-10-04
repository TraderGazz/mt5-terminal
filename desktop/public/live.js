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
  const logout = () => {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem('mt5pc-user'); } catch { /* */ }
    location.replace('login.html');
  };

  async function api(path, opts = {}) {
    const url = new URL(`${API_URL}${path}`, location.origin);
    for (const [k, v] of Object.entries(opts.query || {})) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(url, { method: opts.method || 'GET', headers });
    if (res.status === 401) { logout(); throw new Error('Не авторизован'); }
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
    if (!controls || controls.querySelector('.live-logout')) return;
    const btn = document.createElement('button');
    btn.className = 'live-logout';
    btn.textContent = 'Выйти';
    btn.title = 'Выйти из терминала';
    btn.style.cssText = 'font-size:12px;padding:0 10px;';
    btn.onclick = logout;
    controls.prepend(btn);
  }

  // --- Реквизиты счёта: патчим заголовок окна и Навигатор после того, как
  // прототип отрисует свои хардкодные значения ------------------------------
  let accountInfo = null;
  function patchCaption() {
    if (!accountInfo) return;
    const caption = `${accountInfo.login} — ${accountInfo.server}: ${accountInfo.company}`;
    document.title = caption;
    const el = document.getElementById('windowCaption');
    if (el) el.textContent = caption;
  }
  function patchNavigator() {
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
    api('/history', { query: { tab: 'deals', period: 'year', sort: 'default' } })
      .then((r) => {
        const rows = (r.rows || [])
          .map(mapHistoryRow)
          .sort((a, b) => (a.time ?? 0) - (b.time ?? 0))
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
    if (state.tab === 'history' && historyTotals) {
      el.innerHTML = `•　Прибыль: ${fmt(historyTotals.profit)}　Кредит: 0.00　Пополнение: ${fmt(historyTotals.deposit)}　Снятие: ${fmt(historyTotals.withdrawal)}　Баланс: ${fmt(historyTotals.balance)}<span>${fmt(historyTotals.profit)}</span>`;
    } else if (state.tab !== 'history' && accountInfo && typeof accountInfo.balance === 'number') {
      const currency = accountInfo.currency || 'EUR';
      el.innerHTML = `•　Баланс: ${fmt(accountInfo.balance)} ${currency}　Средства: ${fmt(accountInfo.equity)}　Свободная маржа: ${fmt(accountInfo.freeMargin)}<span>${fmt(accountInfo.floatingProfit ?? 0)}</span>`;
    }
  }
  // Новые позиции — внизу списка: при входе на вкладку и при первой загрузке
  // строк прокручиваем таблицу к низу, чтобы сразу были видны самые свежие.
  let lastTab = null;
  let lastRowCount = 0;
  if (typeof table === 'function') {
    const prevTable = table;
    table = function (...args) {
      prevTable(...args);
      patchTotals();
      const sc = document.getElementById('tableScroll');
      const rowCount = document.querySelectorAll('#tableScroll tbody tr').length;
      if (sc && (state.tab !== lastTab || (lastRowCount === 0 && rowCount > 0))) sc.scrollTop = state.tab === "trade" ? 0 : sc.scrollHeight;
      lastTab = state.tab;
      lastRowCount = rowCount;
    };
  }

  // --- Свечи -----------------------------------------------------------------
  let candleUnsub = null;
  function loadCandles(tf) {
    if (candleUnsub) { candleUnsub(); candleUnsub = null; }
    api('/candles', { query: { timeframe: tf, count: 300 } })
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

  function init() {
    if (!getToken()) { location.replace('login.html'); return; }
    terminalAPI.setDemoRunning(false);
    mountLogout();
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

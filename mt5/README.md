# mt5/ — MT5-мост (Этап 4)

Live-связь с MetaTrader 5 через Expert Advisor **SocketBridgeEA** — встроенный в
терминал HTTP+WebSocket сервер (порт 8890). Никаких HTML-отчётов и Python-cron.

Основано на **github.com/mobjoy0/mt5-bridge** (MIT). Провенанс — `UPSTREAM.txt`,
лицензия апстрима — `UPSTREAM-LICENSE-mt5-bridge.txt`.

```
mt5/
├── container/     Docker-образ: Debian + XFCE + Wine + MT5 + NoVNC + SocketBridgeEA.ex5
│   ├── Dockerfile
│   ├── entrypoint.sh / startup.sh / mt5-mt5debian.sh
│   └── SocketBridgeEA.ex5        (скомпилированный робот)
└── ea/            Исходники EA (MQL5) — для аудита / пересборки в MetaEditor
    ├── Experts/SocketBridgeEA.mq5
    └── include/*.mqh
```

## Наши правки к апстриму

- `mt5-mt5debian.sh`: `cp` вместо `mv` при копировании EA (переживает рестарт);
  обновление EA и в ветке «уже установлен».
- `docker-compose.yml` (корень репо): WINEPREFIX `/root/.mt5` вынесен в постоянный
  том `mt5_wine` — иначе логин и профиль MT5 слетают при пересборке. Порт 8890
  не публикуется (только сеть `mt5net`). NoVNC 6080 — только `127.0.0.1`.

## Запуск

Нужен Docker с Linux-контейнерами (Docker Desktop / Docker Engine на Linux).

```bash
docker compose up -d mt5
```

Первый запуск: контейнер сам ставит Wine + MT5 (10–20 мин). Дальше — разовая
ручная настройка через браузер:

1. SSH-туннель к серверу: `ssh -L 6080:127.0.0.1:6080 user@server`
2. Открыть `http://localhost:6080`, пароль из `mt5/container/.env` (`VNC_PASSWORD`).
3. Дожать установщики Mono / MT5.
4. Войти в счёт — данные в `mt5/container/.env` (`MT5_LOGIN` / `MT5_INVESTOR_PASSWORD`
   / `MT5_SERVER`). Сервер: **AlfaForex-Real**. Пароль инвесторский (только чтение).
5. Открыть график **EURUSD**, перетащить `SocketBridgeEA` из «Навигатора» на график,
   разрешить, включить «Автоторговлю» (Ctrl+E).
6. Вкладка «Эксперты» → должно быть `WebSocket server initialized on port 8890`.
7. Сохранить профиль (чтобы EA поднимался при рестарте). Сохранить пароль в MT5.

## API моста (что использует наш backend)

| REST `http://mt5:8890/v1` | |
|---|---|
| `GET /account` | баланс, средства, маржа, equity |
| `GET /order/list` | открытые позиции + отложенные |
| `GET /history/orders?mode=positions\|orders\|deals&from_date&to_date` | история |
| `GET /history/prices?symbol=EURUSD&time_frame=&from_date=&to_date=` | свечи |
| `GET /quote?symbol=EURUSD` | котировка |

| WebSocket `ws://mt5:8890` — подписка сообщением `{ "endpoint": "...", ... }` | |
|---|---|
| `/v1/track/prices` `{symbols:["EURUSD"]}` | live bid/ask |
| `/v1/track/ohlc` `{ohlc:[{time_frame,symbol,depth}]}` | live свечи |
| `/v1/track/orders` `{enabled:"true"}` | события открытия/закрытия сделок |

Торговые эндпоинты EA (`/v1/order`, `/order/close`, `/order/modify`) **не используем** —
терминал только просмотр.

## Разработка без Docker/MT5

`server/services/mt5-bridge/mock/` — мок-мост, отдаёт те же JSON-формы. Backend
переключается переменной `MT5_BRIDGE=mock|real`.

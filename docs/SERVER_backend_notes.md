# MT5 Mobile Terminal — Backend (server/ + database/)

Backend для PWA-терминала (визуальная копия MT5). Стек: Node.js 20, Express 4, PostgreSQL (pg), ES-модули. Фронтенд (React/Vite) живёт в `src/` и собирается отдельно — backend его не трогает.

## Структура

```
server/
├── index.js                  # вход: express, cors, json, маршруты, /api/health
├── db.js                     # пул pg по DATABASE_URL; при недоступной БД — 503, сервер не падает
├── routes/
│   ├── auth.js               # POST /api/auth/login (JWT), middleware authRequired/requireRole
│   ├── trades.js             # CRUD /api/trades (фильтры по периоду/символу, PATCH → is_edited=TRUE)
│   ├── quotes.js             # GET /api/quotes (кэш, интервал QUOTE_REFRESH_SEC)
│   ├── upload.js             # POST /api/upload/mt5-report (multer memory → парсер → «Загружено N сделок»)
│   ├── sync.js               # POST /api/sync/balance, GET /api/sync/trades, POST /api/sync/positions
│   └── admin.js              # пользователи, лог импортов, баланс, настройки автообмена, экспорт HTML/CSV
├── services/
│   ├── quotes/               # абстракция QuoteProvider: mock | external (Yahoo) | mt5
│   ├── mt5-parser.js         # парсер HTML-отчёта MT5 (cheerio, RU/EN заголовки, Deals/Orders/Positions)
│   ├── mt5-api.js            # слой-заглушка прямого подключения MT5 (mock, если нет кредов)
│   └── sync-service.js       # автообмен Русинvest→АльфаФорекс, cron 5 мин, лог в sync_log
└── scripts/
    └── mt5-sync.py           # Python-демон: MetaTrader5 API → POST /api/trades каждые 5 мин
database/
└── init.sql                  # trades (по ТЗ 4.2), users, accounts (счёт 50214896),
                              # import_log, sync_log, sync_settings
```

## Переменные окружения (`server/.env`, шаблон — `server/.env.example`)

| Переменная | Назначение | По умолчанию |
|---|---|---|
| `PORT` | порт API | `4000` |
| `DATABASE_URL` | строка подключения PostgreSQL | — |
| `JWT_SECRET` | секрет подписи JWT | — (обязательно задать) |
| `JWT_EXPIRES_IN` | срок жизни токена | `12h` |
| `QUOTE_PROVIDER` | источник котировок: `mock` / `external` / `mt5` | `mock` |
| `QUOTE_REFRESH_SEC` | интервал обновления кэша котировок, сек | `10` |
| `MT5_SERVER_IP` / `MT5_LOGIN` / `MT5_PASSWORD` | доступ к MT5 (запрашивается у заказчика) | — |
| `SYNC_ENABLED` | включить автообмен | `false` |
| `SYNC_DIRECTION` | направление (`rusinvest_to_alfaforex`) | `rusinvest_to_alfaforex` |
| `SYNC_PEERS` | `name=url` пиры обмена | — |
| `SYNC_API_KEY` | общий ключ для `/api/sync/*` | — |
| `ADMIN_LOGIN` / `ADMIN_PASSWORD` | первый админ (создаётся при старте, если users пуста) | `admin` / `admin123` |

## Локальный запуск (разработка)

```bash
# PostgreSQL (любым способом, например docker):
docker run -d --name pg -e POSTGRES_PASSWORD=terminal -e POSTGRES_USER=terminal \
  -e POSTGRES_DB=terminal -p 5432:5432 postgres:16

psql "postgres://terminal:terminal@localhost:5432/terminal" -f database/init.sql

cd server
cp .env.example .env          # отредактировать JWT_SECRET и пр.
npm install
npm run dev                   # http://localhost:4000/api/health
```

Без БД сервер тоже стартует: `/api/health` и `/api/quotes` работают, data-роуты отвечают `503`.

Проверка логина: `POST /api/auth/login {"login":"admin","password":"admin123"}` → JWT.

## Деплой на Timeweb Cloud (Ubuntu 22.04)

```bash
# 1. Система
sudo apt update && sudo apt -y upgrade
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql nginx certbot python3-certbot-nginx python3-pip
sudo npm i -g pm2

# 2. База
sudo -u postgres psql -c "CREATE USER terminal WITH PASSWORD '<пароль>';"
sudo -u postgres psql -c "CREATE DATABASE terminal OWNER terminal;"
psql "postgres://terminal:<пароль>@localhost/terminal" -f database/init.sql

# 3. Код
sudo mkdir -p /var/www/terminal && sudo chown $USER /var/www/terminal
git clone <repo> /var/www/terminal && cd /var/www/terminal
cd server && cp .env.example .env && nano .env && npm ci --omit=dev

# 4. PM2 (автозапуск)
pm2 start index.js --name mt5-terminal-api
pm2 save && pm2 startup

# 5. Фронтенд (собирается отдельно, раздаётся nginx как статика)
cd /var/www/terminal && npm ci && npm run build   # → dist/

# 6. Nginx reverse proxy + SSL (поддомен terminal.домен.ру)
sudo nano /etc/nginx/sites-available/terminal
```

Пример конфига nginx:

```nginx
server {
    server_name terminal.example.ru;
    root /var/www/terminal/dist;
    index index.html;

    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location / { try_files $uri $uri/ /index.html; }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/terminal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d terminal.example.ru    # Let's Encrypt, автообновление
```

## mt5-sync.py (автозагрузка из MT5, ТЗ 4.2.А)

Пакет `MetaTrader5` работает только на Windows (либо Wine). Скрипт запускается на машине с терминалом MT5:

```bash
pip install MetaTrader5
export MT5_SERVER_IP=... MT5_LOGIN=... MT5_PASSWORD=...
export API_BASE_URL=https://terminal.example.ru API_TOKEN=<jwt из /api/auth/login>
python3 server/scripts/mt5-sync.py        # демон, каждые 5 минут (SYNC_INTERVAL_SEC)
```

Без пакета/кредов скрипт завершается с понятным сообщением. В cron (если нужен разовый прогон):

```cron
*/5 * * * * cd /var/www/terminal/server/scripts && /usr/bin/python3 mt5-sync.py --once >> /var/log/mt5-sync.log 2>&1
```

## API кратко

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/health` | статус сервера и БД |
| POST | `/api/auth/login` | JWT-логин |
| GET | `/api/quotes` | котировки (кэш, `QUOTE_REFRESH_SEC`) |
| GET/PATCH/POST/DELETE | `/api/trades[/:id]` | сделки; `?period=&symbol=&from=&to=` |
| POST | `/api/upload/mt5-report` | загрузка HTML-отчёта MT5 |
| POST/GET | `/api/sync/balance`, `/api/sync/trades`, `/api/sync/positions` | автообмен (ключ `SYNC_API_KEY`) |
| GET/POST/PATCH/DELETE | `/api/admin/*` | админка (роль admin), отчёт: `GET /api/admin/report?format=html\|csv` |

## Что нужно от заказчика (ТЗ раздел 7)

1. Доступ к серверу Timeweb (SSH)
2. Доступ к MT5: IP сервера, логин, пароль счёта → `MT5_SERVER_IP/MT5_LOGIN/MT5_PASSWORD`
3. HTML-отчёт из MT5 (Файл → Сохранить как отчёт → HTML) — для проверки парсера на реальном файле
4. Иконка приложения PNG 192×192 и 512×512 (PWA)
5. Доступы к API сайтов Русинвест и АльфаФорекс → `SYNC_PEERS` + `SYNC_API_KEY`
6. Список символов для котировок (сейчас: EURUSD, USDRUB, XAUUSD, XAGUSD, GBPUSD, USDJPY)
7. Логины администраторов админки

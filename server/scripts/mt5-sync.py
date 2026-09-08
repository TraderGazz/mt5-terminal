#!/usr/bin/env python3
"""
mt5-sync.py — автозагрузка сделок из MetaTrader 5 в backend терминала.

ТЗ 4.2.А/Б:
  * подключение к MT5 через MetaTrader5 Python API;
  * каждые 5 минут проверка новых/закрытых сделок;
  * отправка в backend: POST /api/trades (upsert по ticket).

Конфигурация через переменные окружения (см. server/.env.example):
  MT5_SERVER_IP, MT5_LOGIN, MT5_PASSWORD  — доступ к торговому счёту
  API_BASE_URL                            — например http://127.0.0.1:4000
  API_TOKEN                               — JWT токен (см. /api/auth/login)
  SYNC_INTERVAL_SEC                       — интервал опроса (по умолчанию 300)

Если пакет MetaTrader5 недоступен или креды не заданы — понятный выход.
"""

import os
import sys
import json
import time
import datetime as dt
import urllib.request
import urllib.error

API_BASE_URL = os.environ.get("API_BASE_URL", "http://127.0.0.1:4000").rstrip("/")
API_TOKEN = os.environ.get("API_TOKEN", "")
SYNC_INTERVAL_SEC = int(os.environ.get("SYNC_INTERVAL_SEC", "300"))

MT5_SERVER_IP = os.environ.get("MT5_SERVER_IP", "")
MT5_LOGIN = os.environ.get("MT5_LOGIN", "")
MT5_PASSWORD = os.environ.get("MT5_PASSWORD", "")


def log(msg: str) -> None:
    print(f"[{dt.datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def import_mt5():
    try:
        import MetaTrader5 as mt5  # noqa: N813
        return mt5
    except ImportError:
        log(
            "ОШИБКА: пакет MetaTrader5 не установлен.\n"
            "  Установите на машине с терминалом MT5 (Windows):\n"
            "    pip install MetaTrader5\n"
            "  После этого задайте MT5_SERVER_IP / MT5_LOGIN / MT5_PASSWORD и перезапустите скрипт."
        )
        sys.exit(2)


def connect(mt5) -> None:
    if not (MT5_SERVER_IP and MT5_LOGIN and MT5_PASSWORD):
        log(
            "ОШИБКА: не заданы MT5_SERVER_IP / MT5_LOGIN / MT5_PASSWORD.\n"
            "  Запросите у заказчика доступ к счёту MT5 (ТЗ п.7.2) и пропишите в окружении."
        )
        sys.exit(3)
    # TODO(prod): боевые креды подставляются через env, не хранить в коде.
    if not mt5.initialize(server=MT5_SERVER_IP, login=int(MT5_LOGIN), password=MT5_PASSWORD):
        log(f"ОШИБКА подключения к MT5: {mt5.last_error()}")
        sys.exit(4)
    info = mt5.account_info()
    log(f"Подключено к MT5: счёт {info.login}, сервер {info.server}, баланс {info.balance}")


def post_trade(trade: dict) -> bool:
    """POST /api/trades — upsert по ticket. Возвращает True при успехе."""
    req = urllib.request.Request(
        f"{API_BASE_URL}/api/trades",
        data=json.dumps(trade).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {API_TOKEN}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return 200 <= resp.status < 300
    except urllib.error.HTTPError as e:
        log(f"  API вернул {e.code} для ticket={trade.get('ticket')}: {e.read()[:200]}")
    except urllib.error.URLError as e:
        log(f"  API недоступен ({API_BASE_URL}): {e.reason}")
    return False


def deal_to_trade(deal) -> dict | None:
    """MT5 deal -> запись таблицы trades. Пропускаем балансовые операции."""
    # deal.type: 0=buy, 1=sell, 2=balance ...
    if deal.type not in (0, 1):
        return None
    ts = dt.datetime.fromtimestamp(deal.time, tz=dt.timezone.utc).isoformat()
    return {
        "ticket": int(deal.ticket),
        "position_id": int(deal.position_id),
        "order_ticket": int(deal.order),
        "symbol": deal.symbol,
        "type": "buy" if deal.type == 0 else "sell",
        "volume": float(deal.volume),
        # Для отдельных сделок цена открытия позиции известна по position_id;
        # здесь фиксируем цену сделки, бэкенд склеивает пары при необходимости.
        "open_price": float(deal.price),
        "close_price": float(deal.price),
        "profit": float(deal.profit),
        "swap": float(deal.swap),
        "commission": float(deal.commission),
        "open_time": ts,
        "close_time": ts,
        "comment": deal.comment or "",
    }


def sync_once(mt5, since: dt.datetime) -> int:
    """Забирает сделки истории начиная с `since` и отправляет новые в API."""
    now = dt.datetime.now()
    deals = mt5.history_deals_get(since, now)
    if deals is None:
        log(f"history_deals_get вернул None: {mt5.last_error()}")
        return 0
    sent = 0
    for deal in deals:
        trade = deal_to_trade(deal)
        if trade is None:
            continue
        if post_trade(trade):
            sent += 1
    return sent


def main() -> None:
    mt5 = import_mt5()
    connect(mt5)
    # Первый прогон — за последние 90 дней, дальше — инкрементально.
    since = dt.datetime.now() - dt.timedelta(days=90)
    log(f"Старт синхронизации, интервал {SYNC_INTERVAL_SEC} сек, API: {API_BASE_URL}")
    try:
        while True:
            sent = sync_once(mt5, since)
            if sent:
                log(f"Отправлено сделок: {sent}")
            since = dt.datetime.now() - dt.timedelta(minutes=10)  # небольшой overlap
            time.sleep(SYNC_INTERVAL_SEC)
    except KeyboardInterrupt:
        log("Остановлено пользователем")
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()

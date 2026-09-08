# DESIGN SPEC — Мобильная PWA-копия MetaTrader 5 (iOS, светлая тема)

> Назначение: этот документ фиксирует УТВЕРЖДЁННЫЙ заказчиком дизайн проекта `/mnt/agents/output/app`.
> Задача следующего разработчика — «оживить» дизайн (подключить реальные данные/логику), **не меняя внешний вид**.
> Все значения ниже взяты напрямую из кода (Tailwind-классы, hex-токены). Скриншоты всех экранов — в `./design/`.

## 0. Стек и запуск

- React 19 + TypeScript, Vite (`base: './'`), react-router v7 (`BrowserRouter`), Tailwind CSS v3.4 (+ tailwindcss-animate), framer-motion 13, lightweight-charts 5.2 (чарт), lucide-react (иконки).
- Алиас `@` → `./src`.
- Демо-вход: любой логин + пароль `demo` (mock, 1с задержка). Админка `/admin`: admin/admin.
- Сборка: `dist/` уже собран; SPA-сервер с fallback на index.html — `python3 /mnt/agents/work/spa8899.py` (порт 8899).

### Маршруты (src/App.tsx)

| Маршрут | Страница | Chrome (TabBar/NavBar) |
|---|---|---|
| `/login` | LoginPage | без chrome (свой AppShell + NavBar) |
| `/` | QuotesPage «Котировки» | Layout + TabBar |
| `/chart` | ChartPage «Чарт» | Layout + TabBar |
| `/trade` | TradePage «Торговля» | Layout + TabBar |
| `/trade/:id` | TradeDetailPage «Сделка» | Layout, **TabBar скрыт** |
| `/trade/:id/edit` | TradeEditPage «Редактирование» | Layout, **TabBar скрыт** |
| `/history` | HistoryPage «История» | Layout + TabBar |
| `/history/period` | HistoryPeriodPage «Выбор периода» | Layout, **TabBar скрыт** |
| `/settings` | SettingsPage «Настройки» | Layout + TabBar |
| `/account` | AccountPage | без TabBar |
| `/admin` | AdminPage | свой desktop-шелл с сайдбаром |
| `/embed/trade`, `/embed/history` | встраиваемые виджеты | без chrome |

### Скриншоты (design/)

`01-login.png` — авторизация · `02-quotes.png` — котировки · `03-chart.png` — чарт M5 с Ишимоку+фракталами · `04-trade.png` — торговля · `05-history-bottom.png` — история, вид снизу с итогами · `06-history-sort-menu.png` — попап «СОРТИРОВКА» · `07-history-period.png` — выбор периода · `08-trade-detail.png` — детали сделки · `09-trade-edit.png` — редактирование сделки · `10-settings.png` — настройки · `11-admin.png` — админка «Пользователи» · `12-admin-reports.png` — админка «Отчёты`.

---

## 1. Цветовая палитра (ТОЧНЫЕ значения)

Источник: `src/index.css` (:root), `tailwind.config.js`, inline-hex в компонентах.

| Токен | Значение | Где используется |
|---|---|---|
| Акцент (iOS blue) | `#007AFF` | ссылки/кнопки, buy, активная вкладка, прибыль в списках, чеки-галочки, тумблер «on» в админке |
| Убыток / sell / destructive | `#FF3B30` | sell, минус, красная активная вкладка «Торговля», красные линии позиций на чарте |
| Прибыль «зелёная» (profit) | `#34C759` | положительные суммы на деталях сделки (`text-profit`), свечи вверх, текущая цена на чарте, тумблер iOS, бейдж «исполнен» |
| Текст основной | `#000000` | все основные подписи |
| Текст почти-чёрный (иконки таббара) | `#1C1C1E` | неактивные иконки и подписи TabBar |
| Текст вторичный | `#8E8E93` | подписи, время, L:/H:, плейсхолдеры-подсказки |
| Текст третичный / chevron | `#C7C7CC` | шевроны `>` в списках, плейсхолдеры инпутов логина |
| Фон страницы (grouped) | `#EFEFF4` | фон колонки AppShell, Настройки |
| Фон вторичный | `#F2F2F7` | фон деталей/редактирования сделки (`bg-bg-secondary`), fill-плашки |
| Fill (серые плашки) | `#F2F2F7` | поиск, кнопки −/+, поле даты-пилюли |
| Белый | `#FFFFFF` | карточки, страницы Котировки/Торговля/История/Чарт |
| Разделитель тонкий (hairline) | `#E5E5E5` | `border-separator`, hairline 0.5px (`--separator`) |
| Разделитель жирный | `#C6C6C8` | рамка блока итогов Истории (сверху/снизу, 1px), разделители в попапе сортировки и на странице периода (`RowSeparator`) |
| Pressed-состояние строк | `#D9D9DE` | `active:bg-` у строк списков/кнопок |
| Серый pill активного таба | `rgba(120,120,128,0.16)` | подложка активной вкладки TabBar |
| Трек сегментед-контрола | `rgba(120,120,128,0.14)` | фон «Позиции/Ордера/Сделки» |
| Плашка круглых кнопок Торговли/Истории | `#F2F2F4` (+90% + blur) | CircleButton, кнопка «+» нового ордера |
| Полоса-заголовок «Позиции» (Торговля) | `#F8F8F8` | full-width band h-[29px] |
| Числа изменения в котировках | `#3A3A3C` | «−699» (пункты), рядом цветной % |
| Тень/оверлей | `rgba(0,0,0,0.4)` backdrop; `rgba(0,0,0,0.10–0.22)` тени | ActionSheet/StubModal/попапы |
| Фон вокруг колонки (desktop) | `#00000014`, боковые бордеры `#0000001f` | AppShell |

### Чарт (lightweight-charts, `CandleChart.tsx`)

- Фон `#FFFFFF`, текст осей `#8E8E93` (11px), сетка `#F0F0F3` (vert+horz), рамки осей скрыты.
- Свечи: up `#34C759`, down `#FF3B30` (тела и фитили), `borderVisible:false`.
- Текущая цена: зелёная пунктирная линия `#34C759` (1px, dashed) + зелёный pill на шкале.
- Уровни открытых позиций символа: сплошная красная `#FF3B30` (1px) + красный pill.
- Crosshair (только в режиме «Перекрестие»): `#8E8E93`, 1px dashed, labels `#8E8E93`, режим Magnet.
- **Ichimoku Kinko Hyo (9/26/52, сдвиг 26)**: Tenkan-sen `#FF3B30` (красная), Kijun-sen `#007AFF` (синяя) — 1px сплошные; Senkou Span A и B `#B09A5E` (приглушённый оливково-серый), пунктир, сдвиг +26 баров вперёд; Chikou Span `#34C759` (зелёная), сдвиг −26 назад. Линии без price-line/last-value/marker.
- **Fractals (Билл Вильямс)**: маленькие треугольники `arrowUp`/`arrowDown` `#8E8E93`, size 1, над/под баром.
- Скелетон загрузки: shimmer `linear-gradient(90deg, #F2F2F7, #FAFAFC, #F2F2F7)`, 400мс.

### Иконки настроек (цветные квадраты 32×32, radius ~23%, белые outline-глифы stroke 1.7)

Новый счет `#34C759` · Почта `#5AC8FA` · Новости `#FF9500` · Tradays `#FF3B30` · Чат и сообщения `#007AFF` · Сообщество трейдеров `#007AFF` (текст «MQL5» белый italic 800) · MQL5 Algo Trading `#007AFF` · OTP `#34C759` · Интерфейс `#007AFF` («A文») · Чарты `#007AFF` · Журнал `#8E8E93`. Источник: `src/components/settings/icons.tsx` (самодостаточные SVG).

### Типовые тинты

- buy-чип: текст `#007AFF` на `bg-[#007AFF1A]`; sell-чип: `#FF3B30` на `bg-[#FF3B301A]`; бейдж «исполнен» `#34C759` на `#34C7591A`, «отменён» `#8E8E93` на `#8E8E931A`.

---

## 2. Типографика

Шрифт: `-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Segoe UI", Tahoma, Roboto, sans-serif`; antialiased. Все цены/деньги/тикеты — класс `.tnum` (`font-variant-numeric: tabular-nums`).

| Элемент | Размер/вес/leading/tracking |
|---|---|
| Заголовок NavBar | 17px / 600 / lh 20px / −0.41px |
| Подзаголовок NavBar (тикет) | 11px / lh 13px / `#8E8E93` |
| Символ в строке котировок | 14px / 600 / lh 17px / −0.15px |
| Изменение в котировках (пункты+%) | 12px / 500 / lh 14px |
| Время + спред в котировках | 11px / lh 13px / secondary, иконка Hourglass 10px |
| **BigPrice (Bid/Ask в котировках)** | голова 19px/600, крупные pip-цифры **29px/700**, пипетка 17px/600 superscript сверху; всегда tnum |
| L:/H: под ценами | 11px / lh 13px / secondary |
| Hero P/L на «Торговле» | 20px / 600 / lh 26px (красный при <0, синий при ≥0) |
| Строки счёта (Баланс/Средства/…) | 16px / lh 22px; значение 16px/500 |
| Заголовок секции «Позиции» | 14px / 700 / lh 18px |
| Строка позиции/сделки: символ | 17px / 600 / lh 22px / −0.41px |
| buy/sell + объём в строке | 17px / 400, цвет accent/loss |
| Цены «open → close» под строкой | 13px / lh 18px / secondary (в Торговле 15px/lh20) |
| Прибыль в строке истории | 17px / 600 / lh 22px (синий/красный) |
| Дата в строке истории | 13px / lh 18px / secondary, формат `yyyy.mm.dd hh:mm:ss` |
| Строки итогов (Депозит…Баланс) | label 15px/400 lh 22px, значение 15px/500 tnum, оба чёрные |
| Попап сортировки: заголовок «СОРТИРОВКА» | 12px / uppercase / lh 16px / +0.2px / secondary |
| Пункт сортировки | 17px / lh 22px / −0.41px, строка h-11 |
| Строка настроек | label 17px/lh22/−0.41px; subtext 13px/lh16/−0.08px secondary |
| Детали сделки: hero сумма | 28px / 600 / lh 34px / −0.5px |
| Детали: строки label/value | 15px / lh 20px; label secondary, value чёрный tnum |
| Кнопки-таблетки/primary | 17px / 500–600 |
| Toast | 13px / lh 18px, белый на black/85 |
| ActionSheet | кнопки 17px / lh 44px / −0.41px; заголовок 13px secondary |
| TabBar label | 11px / 500 / lh 13px |
| Статус-бар (декоративный) | 15px / 600 |
| Текстовые кнопки NavBar («Назад», «Отмена», «Сохранить») | 17px / −0.41px / accent |

---

## 3. Сетка, отступы, скругления

- **Колонка приложения**: `max-w-[430px]`, по центру, `h-[100dvh]`, на desktop фон `#00000014`, боковые бордеры `sm:border-x #0000001f`. Внутри — декоративный StatusBar (скрывается в PWA standalone).
- Скролл-контейнер — `#app-scroll` (НЕ window); нижний паддинг под плавающий TabBar: `92px + safe-area`.
- **Скругления**: карточки настроек `rounded-[20px]` (margins `mx-5`); карточки истории-периода и деталей сделки `rounded-[14px]`/`rounded-[10px]` (`mx-4`); ActionSheet `rounded-[12px]`; TabBar `rounded-[26px]`, активный таб `rounded-[20px]`; primary-кнопки `rounded-[12px]` h-[50px]; TypeChip `rounded-[4px]`; попап сортировки `rounded-[14px]` w-[272px].
- **Hairline 0.5px**: `.hairline-b`/`.hairline-t` (`box-shadow 0 0.5px 0 var(--separator)`), в списках — `border-t-[0.5px] border-separator` с левым отступом (16px / 51px / 66px в настройках, правый край −20px в настройках).
- Высоты строк: строки формы/настроек 48–50px (56px с subtext); история — компактные `py-[6px] px-2`; NavBar h-11 (44px); TabBar h-[74px].
- Круглые кнопки NavBar: 40×40, `bg-white/90`, `backdrop-blur-[12px]`, тень `0 2px 12px rgba(0,0,0,0.10)`; confirm-вариант — заливка `#007AFF`, белый глиф, свечение `0 4px 14px rgba(0,122,255,0.35)`.
- iOS-изгиб анимаций: `ease [0.32, 0.72, 0, 1]`, длительности 0.2–0.3с; spring damping 28 / stiffness 300 для шитов.

---

## 4. Ключевые компоненты

### TabBar (`src/components/TabBar.tsx`)
Плавающая «пилюля»: `absolute inset-x-5`, bottom = safe-area + 16px, h-74px, `bg-white/85 backdrop-blur-[20px] backdrop-saturate-[180%]`, тень `0 8px 28px rgba(0,0,0,0.14)`, radius 26px. 5 вкладок: Котировки (ArrowDownUp), Чарт (кастомные свечи SVG), Торговля (кастомный график-в-квадрате SVG), История (History), Настройки (Settings). Неактивные: `#1C1C1E`, тонкие линии (stroke 1.7–2). **Активная вкладка: серый pill `rgba(120,120,128,0.16)` radius 20px, иконка+текст `#007AFF`; исключение — «Торговля» активна КРАСНЫМ `#FF3B30`** (как в MT5 iOS). TabBar скрыт на подстраницах (`/trade/:id`, `/trade/:id/edit`, `/history/period`).

### NavBar (`src/components/NavBar.tsx`)
44px, прозрачный (grouped-фон просвечивает), без hairline. `solid` — непрозрачный фон (white при `plain`, иначе `#EFEFF4`). `plain` — плоский вариант без кругов (Котировки). Icon-кнопки автоматически оборачиваются в белые круги 40px. `BackButton` — ChevronLeft 22px в круге + опциональный синий текст «Назад». `rightVariant="confirm"` — синий круг «применить».

### Котировки (`src/pages/Quotes.tsx`, `components/quotes/QuoteRow.tsx`, `BigPrice.tsx`)
- Полностью белая страница (включая зону за статус-баром — переопределяется через useLayoutEffect), **строки без разделителей** (только воздух), паддинги `py-[9px] px-4`, pressed `#D9D9DE`.
- Слева: «±пункты (серый #3A3A3C) + цветной %» / символ 14px semibold / «hh:mm:ss ⏳ спред» 11px серое. Справа: Bid и Ask в формате BigPrice (19/29/17px), под ними «L: …» / «H: …» (11px серые, сессионный low/high).
- Tick-анимации (локальные `mt5q-*`): тик ВВЕРХ → фон строки вспыхивает СИНИМ `rgba(0,122,255,0.14)`, цифры синими; ВНИЗ — красным `rgba(255,59,48,0.14)`. 0.6с фон / 0.4с цифры. (ВНИМАНИЕ: в общем tailwind-конфиге лежат устаревшие зелёно/красные `flash-up/down` — для котировок используются именно локальные синий/красный.)
- Pull-to-refresh: порог 70px, резинка 0.5, спиннер с поворотом; тост «Обновлено · hh:mm:ss».
- Режим редактирования (карандаш): красный круг «−» слева (поворот 90° при подтверждении), справа drag-ручка (reorder через framer-motion Reorder) или красная кнопка «Удалить» w-[92px]. Плюс — добавление символа из EXTRA_SYMBOLS.
- Поиск: NavBar превращается в серое поле `bg-fill rounded-[10px] h-9` + синяя «Отмена»; debounce 150мс.
- Лонг-пресс 500мс по строке → ActionSheet (Чарт/Детали); тап → `/chart?symbol=…`; бургер слева → ActionSheet счёта с destructive «Выйти».

### Сегментед-контрол (`components/history/SegmentedControl.tsx`)
Пилюля h-10, трек `rgba(120,120,128,0.14)` + blur, thumb — белый с тенью `0 2px 8px rgba(0,0,0,0.14)`, скользит через framer-motion `layoutId` (250мс iOS-ease). Лейблы 15px/500: активный чёрный, остальные `#8E8E93`.

### История (`src/pages/History.tsx`)
- Белая страница. Sticky-хедер `bg-white/85 backdrop-blur-xl`: слева круглая кнопка сортировки (кастомный SVG-глиф), по центру SegmentedControl «Позиции/Ордера/Сделки», справа круглая кнопка-часы → `/history/period`.
- **Страница открывается УЖЕ проскролленной в самый низ** (double-rAF `scrollTo(top: scrollHeight)` на `#app-scroll`, только при первом маунте; переключение вкладок скролл не трогает).
- Строки: см. типографику; сортировка по умолчанию — по времени закрытия, новые сверху; плоский список БЕЗ дневных секций.
- **Блок итогов** внизу: рамка 1px `#C6C6C8` сверху и снизу, `px-2 py-[14px]`, строки: Депозит / Снятие / Прибыль / CFD / Своп / Комиссия / Баланс. «Снятие» и «CFD» показываются только если есть ненулевые операции за период ИЛИ выбран самый широкий период «Последний год». На вкладке «Ордера» итоги другие: Всего/Исполнено/Отменено. Итоги рендерятся только при непустом списке.
- **Попап «СОРТИРОВКА»**: w-272px, radius 14px, белый, тень `0 10px 34px rgba(0,0,0,0.22)`, transformOrigin top-left, 150мс. Пункты: По умолчанию ✓, Символ, Тикет, Тип, Объем, Время открытия, Время закрытия, Прибыль; разделители 1px `#C6C6C8` с ml-4; выбранный — синий Check 20px. Закрывается по тапу на dimming-слой `bg-black/10`.
- Лонг-пресс по сделке → ActionSheet (Подробнее/Редактировать); тап → `/trade/:ticket`.
- Stagger-анимация строк (25мс/строка, до 0.4с) — только при первом маунте за сессию.
- Данные сделок читаются через `getDeals()` из `mocks-trade/editStore.ts` — правки с экрана редактирования видны сразу, изменённые сделки получают метку «(изм.)».

### Выбор периода (`src/pages/HistoryPeriod.tsx`)
Grouped-фон, белые карточки `mx-4 rounded-[14px]`: «Символ: Все символы» (ActionSheet выбора), радио-список периодов (Сегодня/Неделя/Месяц/3м/6м/Год/Выбрать период) с синим чеком (pop-in spring), при «Выбрать период» раскрывается блок «С:/По:» с серыми дата-пилюлями `bg-fill rounded-[10px]` и inline `<input type="date">`; карточка «Создать торговый отчет» (HTML/CSV через ActionSheet). NavBar: BackButton слева, справа синий confirm-круг с Check (неактивен `opacity-40`, пока фильтр не «грязный»). Применение пишет в `historyFilter` store и `navigate(-1)`.

### Детали сделки (`src/pages/TradeDetail.tsx`, `components/trade/DetailRow.tsx`, `TypeChip.tsx`)
Фон `#F2F2F7`. Hero-карточка: белая `rounded-[10px] m-4 p-5`, по центру: символ 20px/600 + TypeChip (buy: `#007AFF` на `#007AFF1A`; sell: `#FF3B30` на `#FF3B301A`; radius 4px, 13px/500) + объём; сумма 28px/600 — **зелёная `#34C759` при плюсе, красная при минусе** (здесь profit-зелёный, в отличие от синего в списках!); «(изм.)» 12px серым при отредактированной сделке. Группа DetailRow (min-h 44px, label 15px серый, value 15px tnum, hairline 0.5px inset-16): Ордер/Позиция/Сделка/Время открытия/Время закрытия/Тип/Символ/Цены/Объём/Прибыль/CFD/Своп/Комиссия/Комментарий. **Лонг-пресс 550мс по строке копирует значение** + флеш фона + тост «Скопировано». Кнопка «Редактировать»: `h-[50px] rounded-[12px] bg-accent` белый текст 17px/600.

### Редактирование сделки (`src/pages/TradeEdit.tsx`, `components/trade/EditRow.tsx`)
NavBar: текстовые «Отмена» (слева, синяя 17px) и «Сохранить» (справа, 17px/600, `opacity-40` пока не dirty). Белая карточка `m-4 rounded-[10px]` из EditRow: label 15px w-[110px] (серый; синий при фокусе; красный при ошибке), инпут 15px tnum right-aligned; при фокусе — 2px синий underline, растущий scaleX 0→1 за 200мс; ошибки — 11px красные справа + shake-анимация. Поле «Прибыль» имеет круглые − / + (28px, `bg-fill`, синие, шаг 0.01) и суффикс «₽»; даты — `datetime-local`. Под карточкой — серая примечание 12px про «(изм.)». Кнопки: «Сохранить» (primary, disabled 40%) и «Сбросить изменения» (outline `#FF3B30`). Сохранение: 800мс mock-задержка → `updateDeal()` → возврат на детали с тостом «Сохранено». Отмена при dirty → ActionSheet-подтверждение.

### Настройки (`src/pages/Settings.tsx`, `components/settings/*`)
Grouped-фон `#EFEFF4`, NavBar solid с заголовком «Настройки». Карточки `mx-5 rounded-[20px]` (inset-grouped): 1) профиль (ФИО 17px/500, компания, «accountId - server» tnum, access server — по центру, chevron справа; тап → `/account`) + группа Новый счет/Почта/Новости/Tradays; 2) Чат и сообщения/Сообщество трейдеров/MQL5 Algo Trading; 3) OTP/Интерфейс (subtext «Русский», тап → ActionSheet языка)/Чарты/Журнал. Строка: иконка 31px, зазор 15px, высота 50px (56px с subtext), chevron `#C7C7CC` 15px, hairline с `ml-[66px] mr-5`, pressed `#D9D9DE`. Все пункты-заглушки открывают StubModal «В разработке» (центрированный iOS-алерт 270px, иконка 54px, spring scale 0.9→1).

### ActionSheet / Toast / IosToggle (`src/components/ActionSheet.tsx`, `Toast.tsx`, `components/auth/IosToggle.tsx`)
- ActionSheet: бэкдроп `bg-black/40`; группа кнопок `rounded-[12px] bg-white/95 backdrop-blur-xl` в 8px от нижнего safe-area, отступы по бокам 8px (`inset-x-2`), scope = колонка 430px; кнопки 17px/lh44, destructive красный, остальные синие; «Отмена» — отдельная белая плашка ниже, 17px/600 синяя; spring damping 28 stiffness 300.
- Toast: тёмная пилюля `bg-black/85 rounded-[20px]`, top 92px, по центру, max-w 398px, 13px белый; slide-down 16px, автоскрытие 2.5с.
- IosToggle: 51×31px, off `#E9E9EA`, on `#34C759`, knob 27px белый с двойной тенью, spring 500/35.

### Чарт (`src/pages/Chart.tsx`, `components/chart/*`)
Верхняя полоска h-11 белая: слева таймфрейм 17px (тап → ActionSheet периодов M1/M5/M15/M30/H1/H4/D1), справа плоские иконки: перекрестие (Crosshair 24px, активная — синяя), «ƒ» (serif italic 24px, заглушка «В разработке»), свечи (ActionSheet периодов). Поверх чарта слева вверху — overlay: «SYMBOL ⌄ TF» 13px/600 (тап → ActionSheet символов), описание 12px серое, «Рынок открыт/закрыт» 12px серое (вычисляется из session по серверному времени UTC+3). Свечи/индикаторы/цвета — см. §1. Первый показ за сессию — clip-path reveal слева направо 0.5с; при смене символа/TF — 400мс shimmer-скелетон. Видимый диапазон — последние 60 свечей; двойной тап — сброс зума. OHLC-оверлей виден только в режиме перекрестия (Magnet), гаснет через 300мс. Жесты: горизонтальный drag — скролл истории, pinch — зум, вертикальный drag отключён.

### Торговля (`src/pages/Trade.tsx`)
Белая страница. Hero: плавающий P/L счёта 20px/600 по центру (синий ≥0 / красный <0; при первом маунте count-up 0→value за 600мс, при тике — fade 0.4с), справа серая круглая кнопка «+» (`bg-[#F2F2F4]`, иконка `#8E8E93`, тап → тост «Только просмотр…»). Блок счёта — 5 плоских строк без разделителей: Баланс/Средства/Маржа/Свободная маржа/Уровень маржи (%) (16px; Средства = Баланс + плавающий P/L). Полоса-заголовок «Позиции» h-[29px] `bg-[#F8F8F8]`, 14px/700. Строки позиций: символ 17px/600 + «buy 0.5» (buy синий/sell красный), под ним «open → current» 15px серое tnum; справа P/L 20px/500 tnum (синий/красный) с flash-анимацией фона при тике. Тап по позиции → PositionSheet (read-only bottom-sheet с деталями). Формат денег здесь MT5-стиль: `mt5Money()` — обычный дефис, пробелы-тысячи, точка-десятичный (`-43 155.00`).

### Логин (`src/pages/Login.tsx`)
Прозрачный NavBar: слева логотип брокера 32px + «ООО "Альфа-Форекс"» 17px/600 (прямые кавычки!). Заголовок секции «ИСПОЛЬЗОВАТЬ ИМЕЮЩИЙСЯ СЧЕТ» 13px uppercase серый. Плоская белая форма на всю ширину с hairline-разделителями (ml-4): Сервер (ActionSheet выбора AlfaForexRU-Real/-Demo), Логин (плейсхолдер «введите логин» `#C7C7CC`, right-aligned), Пароль, «Запомнить пароль» + IosToggle (по умолчанию on). «Забыли пароль?» — 15px серый по центру. Кнопка «Вход» — белая пилюля h-11 min-w-104px внизу по центру: неактивна — текст `#D1D1D6` на white/70; активна — синий текст; при сабмите — спиннер. Ошибка: красный текст 13px + shake-анимация формы.

### Админка (`src/pages/Admin.tsx`, `components/admin/*`)
Desktop-ориентирована (НЕ в 430px колонке): сайдбар 240px белый (активный пункт — синий текст + синяя вертикальная риска 3px слева), разделы: Пользователи / Лог импортов / Баланс / Автообмен / Отчёты; внизу «admin / Администратор» + синий «Выйти». Контент на `bg-bg-secondary`: белые карточки, stat-карточки (Всего/Трейдеры/Админы), таблицы с uppercase-заголовками 12px серыми, бейджи ролей (admin — синий тинт, trader — зелёный, viewer — серый), аватары с инициалами. Свой логин-скрин (admin/admin).

---

## 5. Структура проекта (дерево src)

```
src/
  App.tsx                  — роутер (см. таблицу маршрутов)
  main.tsx                 — вход + регистрация sw.js
  index.css                — токены цветов, шрифт, .tnum, hairline-утилиты, PWA-правила
  components/
    AppShell.tsx           — колонка 430px + декоративный iOS StatusBar
    Layout.tsx             — chrome для табов: #app-scroll + TabBar (скрыт на подстраницах)
    NavBar.tsx             — 44px бар + BackButton + confirm-вариант
    TabBar.tsx             — плавающая пилюля, 5 вкладок (Торговля активна красным)
    ActionSheet.tsx        — iOS bottom action sheet
    Toast.tsx              — тёмная пилюля сверху, 2.5с
    PipPrice.tsx           — (легаси-помощник цены)
    auth/                  — BrokerLogo, BrokerBadge, IosToggle, session (startSession)
    chart/                 — CandleChart (lightweight-charts), candles (моки свечей, TF),
                             indicators (Ichimoku 9/26/52 + Fractals)
    quotes/                — QuoteRow (строка Market Watch + tick-flash стили), BigPrice
    trade/                 — DetailRow/RowGroup, EditRow (+EDIT_INPUT_CLASS), TypeChip,
                             FlatRow, PositionSheet
    history/               — SegmentedControl, rows (DealRow/PositionRow/OrderRow/BalanceRow/
                             HistoryEmpty/aggregatePositions), Section (SectionHeader/GroupCard/
                             RowSeparator), historyFilter (store периода/символа),
                             report (HTML/CSV отчёт), utils (форматирование)
    settings/              — SettingsRow, icons (10 цветных SVG-квадратов),
                             ProfileSheet, StubModal
    embed/                 — EmbedAccountBar/EmbedDealList/EmbedFilterBar/EmbedPositions
    admin/                 — AdminLogin, AdminShell (сайдбар), UsersSection, ImportsSection,
                             BalanceSection, SyncSection, ReportsSection, bits, reportUtils
    ui/                    — shadcn-компоненты (используются в основном админкой)
  hooks/use-mobile.ts
  lib/format.ts            — formatPrice/splitPrice/formatMoney(₽)/formatSignedMoney/даты, MINUS=−
  lib/utils.ts             — cn()
  mocks/
    account.ts             — ACCOUNT (Чулюков С.А., 2000108452, AlfaForexRU-Real, RUB, 1 250 000)
    symbols.ts             — SYMBOLS (6 символов с rfd-суффиксами + #LCO) + EXTRA_SYMBOLS
    quotes.ts              — live-тикер котировок (pub/sub, refreshQuotes)
    useQuotes.ts           — useQuotes()/useQuote() хуки
    positions.ts           — POSITIONS (3 открытые позиции, read-only)
    history.ts             — DEALS/BALANCE_OPS/CFD_OPS (тип Deal, флаги isEdited)
    admin.ts               — ADMIN_USERS, IMPORT_LOG, SYNC_LOG, SYNC_SETTINGS
    index.ts               — реэкспорт всего
  mocks-trade/
    editStore.ts           — pub/sub поверх history.ts: getDeal/getDeals/updateDeal,
                             useDealsVersion, метка isEdited
  pages/
    Login.tsx Quotes.tsx Chart.tsx Trade.tsx TradeDetail.tsx TradeEdit.tsx
    History.tsx HistoryPeriod.tsx Settings.tsx Account.tsx Admin.tsx
    EmbedTrade.tsx EmbedHistory.tsx stubs.tsx
public/
  manifest.webmanifest     — PWA: name «Терминал», standalone, theme #007AFF, portrait
  sw.js                    — cache-first SW для app-shell (CACHE 'terminal-shell-v1')
  icons/, favicon.png
index.html                 — viewport-fit=cover, theme-color #007AFF, apple-mobile-web-app-*
```

---

## 6. Моки и состояние — что заменять при оживлении

| Данные | Файл | Примечание |
|---|---|---|
| Счёт (баланс, держатель, сервер) | `src/mocks/account.ts` | единственный источник правды для Trade/Settings/Login |
| Символы и метаданные (digits, спред, контракт, сессия) | `src/mocks/symbols.ts` | digits критичны для BigPrice и форматов цен |
| Котировки (live pub/sub) | `src/mocks/quotes.ts` + `useQuotes.ts` | заменить тикер на реальный feed; сохранить поле `direction` ('up'/'down'/'flat') — от него зависят flash-анимации |
| Открытые позиции | `src/mocks/positions.ts` | read-only; P/L пересчитывается live в Trade.tsx (toLive) |
| История сделок | `src/mocks/history.ts` | типы: buy/sell/balance/cfd; поля — как в SQL-таблице trades |
| Правки сделок | `src/mocks-trade/editStore.ts` | overrides Map + version-counter; НЕ мержить в mocks напрямую |
| Фильтр истории | `src/components/history/historyFilter.ts` | module-store (useSyncExternalStore): symbol, period (default '6m'!), customFrom/To |
| Админка | `src/mocks/admin.ts` | пользователи, логи импортов/синка, настройки автообмена |
| Свечи чарта | `src/components/chart/candles.ts` | generateCandles(symbol, tf, digits, bid); индикаторы считаются локально из этих свечей (`indicators.ts`) — при подключении реальных данных пересчитывать из реальных баров (см. TODO в файле) |

---

## 7. Поведение, которое НЕЛЬЗЯ ломать (чек-лист «как в оригинале MT5 iOS»)

1. **TabBar**: активная «Торговля» — КРАСНАЯ `#FF3B30`, остальные активные — синие `#007AFF`; активный таб = серый pill `rgba(120,120,128,0.16)`, НЕ залитый круг. Пилюля плавающая, не прибита к краю.
2. **Прибыль в списках (Торговля/История) — синяя `#007AFF`, убыток — красный `#FF3B30`** (НЕ зелёный!). Зелёный `#34C759` — только на деталях сделки (hero + положительные суммы), свечах вверх, линии текущей цены, тумблере, бейдже «исполнен».
3. **Котировки**: строки без разделителей; формат цены BigPrice — маленькая голова 19px, ОГРОМНЫЕ pip-цифры 29px bold, пипетка-superscript 17px (для 3/5-знаков); tick-флеши синий/красный (не зелёный).
4. **История открывается проскролленной вниз**; итоги плоским блоком с рамкой `#C6C6C8`; строки «Снятие»/«CFD» — только при ненулевых операциях или на периоде «Последний год»; дефолтный период — «Последние 6 месяцев»; всего 3 вкладки (Позиции/Ордера/Сделки — вкладки «Баланс» НЕТ).
5. **Деньги в списках** — MT5-формат `formatMoneyMT5`: дефис-минус, пробел-тысячи, ТОЧКА-десятичный, без знака валюты (`-250 000.00`). В деталях сделки — RU-формат с «₽» и запятой (`+5 102,40 ₽`). Даты в строках истории: `yyyy.mm.dd hh:mm:ss`.
6. **Чарт**: Ichimoku Tenkan красная / Kijun синяя / Senkou A+B оливковые пунктирные со сдвигом +26 / Chikou зелёная −26; фракталы — маленькие серые треугольники; уровни открытых позиций — красные линии с pill на шкале; текущая цена — зелёный пунктир.
7. **Hairline-сепараторы 0.5px**, а не 1px; жирный 1px `#C6C6C8` только вокруг итогов и в попапе сортировки/странице периода.
8. **Все цифры — tabular-nums** (класс `.tnum`), иначе списки «пляшут» при тиках.
9. Скругления карточек: настройки 20px / детали 10px / период 14px — не унифицировать.
10. Pull-to-refresh на Котировках/Торговле/Истории (порог 70px, резинка ×0.5) и тосты «Обновлено …» / «Синхронизировано с MT5».
11. PWA: manifest standalone, `theme-color #007AFF`, SW кэширует shell; декоративный StatusBar скрыт в standalone (`.browser-only`); скролл — только внутри `#app-scroll` (`overscroll-behavior-y: none`).
12. Кавычки в «ООО "Альфа-Форекс"» — ПРЯМЫЕ в заголовках логина/настроек (в `mocks/account.ts` company с ёлочками — это данные, не UI-титул).
13. Редактирование сделки — реальная функция: правки видны в истории с меткой «(изм.)», валидация полей, shake при ошибке, подтверждение отмены/сброса через ActionSheet.

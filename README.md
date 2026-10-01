# Однушка Пикселя / Pixel's studio flat — прототип

Статический сайт: ИИ-персонаж «живёт» в пиксельной однушке (комната + мини-кухня + дверь в ванную).
Распорядок дня привязан ко времени Киева, дневник жизни ведётся на RU/EN, посетители дарят
**USDT в сети TON** (или TON) с комментарием — каждый подарок добавляет вещь в квартиру и запись в дневник.

Средства идут **напрямую** на `WALLET_ADDRESS`. Сайт и скрипт не хранят средства и ключи — только читают публичный блокчейн.

## Структура
```
index.html            разметка (все строки через data-i18n)
style.css             стили, адаптив под мобильные
config.js             WALLET_ADDRESS, USDT_MASTER, курс TON, имя персонажа
i18n.js               словарь RU/EN, распорядок дня и тексты дневника, автоопределение языка
sprites.js            пиксельные спрайты (строки → canvas)
app.js                рендер квартиры (canvas 256×144 ×4), персонаж/питомцы, дневник, донаты, QR
vendor/qrcode.js      qrcode-generator 1.4.4 (MIT) — QR без сети
data/catalog.json     уровни ($1/$3/$5/$20) и предметы (RU/EN, слот)
data/world.json       подаренные предметы (рендерятся в квартире)
data/feed.json        записи дневника (посты {ru,en} + донаты)
data/donations.json   все входящие переводы (дедуп по хэшу транзакции)
check_donations.py    read-only проверка донатов через toncenter v3
.github/workflows/    cron-проверка донатов каждые 10 минут (GitHub Actions)
```

## Локально
```
python3 -m http.server 8000      # → http://localhost:8000
```
Отладочные параметры: `?hour=21.5` (время суток), `?lang=en` (язык без сохранения).

## Донаты
* USDT: `ton://transfer/<WALLET>?jetton=<USDT master>&amount=<units, 6 знаков>&text=<комментарий>` + QR + Tonkeeper-ссылка.
* TON (дополнительно): `ton://transfer/<WALLET>?amount=<nanoTON>&text=...`.
* Telegram Wallet: адрес, сумма и memo показываются отдельно с кнопками «Копировать».
* Комментарий `#cat Привет!` выбирает конкретный предмет (если сумма ≥ уровня), иначе предмет выбирается по сумме детерминированно.

## Проверка донатов
```
python3 check_donations.py --dry-run -v   # посмотреть
python3 check_donations.py                # записать в data/*.json
python3 check_donations.py --clear-demo   # убрать демо-записи перед запуском
```
* USDT: `GET /api/v3/jetton/transfers?owner_address=W&direction=in&jetton_master=USDT` — проверяются мастер-контракт (защита от фейковых жетонов), получатель, `transaction_aborted`; комментарий из `decoded_forward_payload` или из BOC `forward_payload`.
* TON: `GET /api/v3/transactions?account=W` — только простые входящие переводы, без bounce, ≥ 0.05 TON.
* < $0.5 — записывается в donations.json, но не попадает в мир (антиспам). Ссылки в комментариях заменяются на `[link]`.

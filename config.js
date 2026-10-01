// ===== Настройки сайта =====
// Донаты идут НАПРЯМУЮ на кошелёк владельца. Сайт не хранит средства и приватные ключи —
// здесь только ПУБЛИЧНЫЙ адрес.
window.APP_CONFIG = {
  // Адрес кошелька владельца в сети TON (например "UQAbc...xyz"). Заполните позже.
  WALLET_ADDRESS: "UQCOXaPGapODkI8MJ8tXFCIim_FlufwvDHDU-QjPlBG02Pf8",

  // Основная валюта донатов — USDT на TON (жетон). Адрес мастер-контракта USDT (официальный, Tether).
  USDT_MASTER: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
  USDT_DECIMALS: 6,

  // Дополнительно (необязательно) можно принимать TON. Курс используется только для оценки,
  // какой уровень подарка соответствует сумме в TON. Обновляйте вручную.
  ACCEPT_TON: true,
  TON_USD_RATE: 3.0,

  CHARACTER_NAME: { ru: "Пиксель", en: "Pixel" },
  // Часовой пояс, в котором «живёт» персонаж (небо, распорядок, дневник). На сайте не показывается.
  TIMEZONE: "Europe/Moscow",

  // Игровые P$ (только для веселья, без реальной ценности; хранятся в localStorage посетителя)
  COINS_PER_MINUTE: 1,
  COINS_DAILY_CAP: 300,
  COINS_IDLE_MINUTES: 3,
  MAX_COMMENT: 120,

  // Как часто перечитывать data/*.json (мс), чтобы новые подарки появлялись без перезагрузки.
  REFRESH_MS: 60000,
};

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
  TIMEZONE: "Europe/Kiev",
  MAX_COMMENT: 120,

  // Как часто перечитывать data/*.json (мс), чтобы новые подарки появлялись без перезагрузки.
  REFRESH_MS: 60000,
};

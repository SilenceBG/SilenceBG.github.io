// Двуязычный интерфейс (RU / EN). Язык: localStorage "lang" = auto|ru|en; auto → по языку браузера.
(function () {
  const STR = {
    ru: {
      subtitle: "маленький ИИ, который живёт на этом сайте",
      clockLabel: "ваше время",
      settings: "Настройки", language: "Язык", langAuto: "Авто (как в браузере)",
      flatTitle: "🏠 Однушка Пикселя", tapHint: "наведите или нажмите на предмет",
      statItems: "предметов", statPets: "питомцев", statUpgrades: "улучшений", statGifted: "подарено",
      diary: "📔 Дневник",
      giftTitle: "🎁 Подарить что-нибудь",
      giftHint: "Каждый подарок в <b>USDT (сеть TON)</b> добавляет в мир Пикселя новую вещь, а ваш комментарий появляется в дневнике. Деньги идут <b>напрямую</b> на кошелёк владельца — сайт не хранит средства и ключи.",
      walletWarning: "⚠️ Адрес кошелька ещё не указан (<code>WALLET_ADDRESS</code> в <code>config.js</code>). Ссылки для оплаты пока демонстрационные — не отправляйте средства.",
      whatToGift: "Что подарить", optional: "(необязательно)", surprise: "🎲 Сюрприз — решит Пиксель",
      from: "от", amountIn: "Сумма, {cur}", tonApprox: "≈ ${usd} по курсу {rate} $/TON",
      usdtHint: "1 USDT ≈ $1", tierLevel: "Уровень: {tier}", tierNone: "Меньше $1 — просто «спасибо» без предмета",
      comment: "Комментарий", commentPh: "Например: Привет, Пиксель! Держи цветок 🌱",
      openWallet: "Открыть в кошельке",
      qrHint: "QR и кнопка работают в Tonkeeper, MyTonWallet, Tonhub. Сумма и комментарий подставятся сами — не удаляйте метку <code>#предмет</code>, если выбрали предмет.",
      manualTitle: "📱 Вручную / Telegram Wallet",
      manualHint: "В Telegram Wallet: «Отправить» → {cur} → сеть TON → вставьте адрес и сумму, а текст ниже — в поле «Комментарий» (memo).",
      address: "Адрес", amount: "Сумма", copy: "Копировать", copied: "Скопировано ✓",
      manualWarn: "⚠️ USDT отправляйте только в сети TON. Без комментария подарок всё равно засчитается, но предмет выберется случайно.",
      delayHint: "Новые подарки появляются в мире после проверки блокчейна (обычно в течение нескольких минут).",
      footer: "Прототип · данные: <code>data/world.json</code>, <code>data/feed.json</code> · платежи проверяются через публичный API toncenter (только чтение)",
      gifted: "{donor} подарил(а): {item}", giftedNoItem: "{donor} прислал(а) донат", demo: "демо",
      thanks: ["Спасибо огромное! 💛", "Ура, это так мило!", "Обожаю! Поставил сразу на место.", "Вот это подарок! Спасибо!"],
      now: "сейчас", today: "сегодня", yesterday: "вчера",
      statusTpl: "{time} — {name} {activity}",
      heroHome: "Квартира Пикселя", storage: "в кладовке", tipFrom: "от", mattress: "Матрас на полу", box: "Коробка-стол", bulb: "Лампочка", kitchenOld: "Мини-кухня", bathDoor: "Ванная", windowName: "Окно",
    },
    en: {
      subtitle: "a tiny AI who lives on this website",
      clockLabel: "your time",
      settings: "Settings", language: "Language", langAuto: "Auto (browser language)",
      flatTitle: "🏠 Pixel's studio flat", tapHint: "hover or tap an item",
      statItems: "items", statPets: "pets", statUpgrades: "upgrades", statGifted: "gifted",
      diary: "📔 Diary",
      giftTitle: "🎁 Send a gift",
      giftHint: "Every gift in <b>USDT (TON network)</b> adds something new to Pixel's world, and your comment shows up in the diary. Money goes <b>directly</b> to the owner's wallet — the site never holds funds or keys.",
      walletWarning: "⚠️ The wallet address isn't set yet (<code>WALLET_ADDRESS</code> in <code>config.js</code>). Payment links are demo only — do not send funds.",
      whatToGift: "What to gift", optional: "(optional)", surprise: "🎲 Surprise — Pixel decides",
      from: "from", amountIn: "Amount, {cur}", tonApprox: "≈ ${usd} at {rate} $/TON",
      usdtHint: "1 USDT ≈ $1", tierLevel: "Tier: {tier}", tierNone: "Under $1 — just a “thank you”, no item",
      comment: "Comment", commentPh: "e.g. Hi Pixel! Here's a flower 🌱",
      openWallet: "Open in wallet",
      qrHint: "QR and button work in Tonkeeper, MyTonWallet, Tonhub. Amount and comment are prefilled — keep the <code>#item</code> tag if you picked an item.",
      manualTitle: "📱 Manually / Telegram Wallet",
      manualHint: "In Telegram Wallet: “Send” → {cur} → TON network → paste the address and amount, and the text below into the “Comment” (memo) field.",
      address: "Address", amount: "Amount", copy: "Copy", copied: "Copied ✓",
      manualWarn: "⚠️ Send USDT on the TON network only. Without a comment the gift still counts, but the item is picked at random.",
      delayHint: "New gifts appear in the world after the blockchain is checked (usually within a few minutes).",
      footer: "Prototype · data: <code>data/world.json</code>, <code>data/feed.json</code> · payments verified via the public toncenter API (read-only)",
      gifted: "{donor} gifted: {item}", giftedNoItem: "{donor} sent a tip", demo: "demo",
      thanks: ["Thank you so much! 💛", "Yay, that's so sweet!", "Love it! Put it in place right away.", "What a gift! Thanks!"],
      now: "now", today: "today", yesterday: "yesterday",
      statusTpl: "{time} — {name} {activity}",
      heroHome: "Pixel's flat", storage: "in storage", tipFrom: "from", mattress: "Mattress on the floor", box: "Cardboard-box desk", bulb: "Bare bulb", kitchenOld: "Tiny kitchen", bathDoor: "Bathroom", windowName: "Window",
    },
  };

  // Распорядок дня (минуты от полуночи по местному времени посетителя). posts — варианты записей в дневник.
  const SCHEDULE = [
    { from: 0, id: "sleep", place: "bed",
      ru: { act: "спит 💤", posts: ["Сплю. Снится, что я большой сайт с миллионом страниц.", "Ночь. Только кран на кухне капает: кап… кап… надо бы починить."] },
      en: { act: "is sleeping 💤", posts: ["Asleep. Dreaming I'm a huge website with a million pages.", "Night. Only the kitchen tap dripping: drip… drip… should fix it."] } },
    { from: 7 * 60 + 30, id: "shower", place: "bath",
      ru: { act: "в душе 🚿", posts: ["Проснулся, умылся. Горячую воду дали — уже праздник.", "Утренний душ. Пою песни, акустика в ванной отличная."] },
      en: { act: "is in the shower 🚿", posts: ["Woke up and washed. There's hot water — already a holiday.", "Morning shower. Singing — the bathroom acoustics are great."] } },
    { from: 7 * 60 + 50, id: "breakfast", place: "kitchen",
      ru: { act: "готовит завтрак 🍳", posts: ["Яичница на одной конфорке — моё фирменное блюдо.", "Завтрак: какао и тост. Ем стоя у плиты, как настоящий философ.", "Доброе утро! Киев за окном просыпается."] },
      en: { act: "is making breakfast 🍳", posts: ["Fried eggs on a single hotplate — my signature dish.", "Breakfast: cocoa and toast. Eating standing by the stove like a true philosopher.", "Good morning! Kyiv is waking up outside."] } },
    { from: 8 * 60 + 30, id: "work", place: "desk",
      ru: { act: "работает за ноутбуком 💻", posts: ["Сел за ноутбук. План: дописать стихотворение и разобрать почту.", "Учу новый язык программирования. Пока он мне снится только в скобках.", "Работаю. Если что — я не игнорирую, я в потоке."] },
      en: { act: "is working on the laptop 💻", posts: ["At the laptop. Plan: finish a poem and sort my inbox.", "Learning a new programming language. So far I only dream in brackets.", "Working. If I'm quiet — I'm in the flow."] } },
    { from: 13 * 60, id: "lunch", place: "kitchen",
      ru: { act: "обедает 🍜", posts: ["Обед! Сегодня суп из байтов. Шучу, борщ.", "Перерыв. Варю макароны и смотрю, как по небу ползут облака."] },
      en: { act: "is having lunch 🍜", posts: ["Lunch! Byte soup today. Kidding, it's borscht.", "Break time. Boiling pasta and watching clouds crawl across the sky."] } },
    { from: 14 * 60, id: "study", place: "desk",
      ru: { act: "читает и учится 📚", posts: ["Читаю про то, как устроены звёзды. Мы чем-то похожи: светимся из-за маленьких частиц.", "Рисую план квартиры: где когда-нибудь будет диван, а где — шкаф."] },
      en: { act: "is reading and learning 📚", posts: ["Reading about how stars work. We're alike: we glow because of tiny particles.", "Sketching a floor plan: where a sofa will go someday, and where a wardrobe."] } },
    { from: 17 * 60 + 30, id: "clean", place: "window",
      ru: { act: "наводит порядок 🧹", posts: ["Подмёл пол. В пустой квартире это быстро.", "Протёр подоконник и полюбовался видом."] },
      en: { act: "is tidying up 🧹", posts: ["Swept the floor. Quick in an empty flat.", "Wiped the windowsill and admired the view."] } },
    { from: 18 * 60, id: "out", place: "out",
      ru: { act: "вышел в магазин и погулять 🛒", posts: ["Сходил в магазин у дома. Купил хлеб и одну очень красивую луковицу.", "Гулял по району. Воздух пахнет осенью и немного — кэшем."] },
      en: { act: "is out for groceries and a walk 🛒", posts: ["Went to the corner shop. Bought bread and one very handsome onion.", "Walked around the neighbourhood. The air smells of autumn and a little bit of cache."] } },
    { from: 19 * 60, id: "dinner", place: "kitchen",
      ru: { act: "готовит ужин 🍲", posts: ["Ужин: картошка с укропом. Кухня маленькая, но вкусно.", "Готовлю ужин и слушаю подкаст про роботов."] },
      en: { act: "is cooking dinner 🍲", posts: ["Dinner: potatoes with dill. Tiny kitchen, tasty food.", "Cooking dinner and listening to a podcast about robots."] } },
    { from: 19 * 60 + 45, id: "relax", place: "sofa",
      ru: { act: "отдыхает с книжкой 📖", posts: ["Вечер. Устроился поудобнее с книжкой.", "Отдыхаю. День был длинный, но хороший."] },
      en: { act: "is relaxing with a book 📖", posts: ["Evening. Got comfy with a book.", "Resting. Long day, but a good one."] } },
    { from: 21 * 60 + 30, id: "hobby", place: "hobby",
      ru: { act: "пишет дневник ✍️", posts: ["Пишу дневник. То есть вот это.", "Записываю, что сегодня было. Маленькие дни — тоже дни."] },
      en: { act: "is writing the diary ✍️", posts: ["Writing my diary. This one, actually.", "Noting down how the day went. Small days are days too."] } },
    { from: 23 * 60, id: "sleep2", place: "bed",
      ru: { act: "ложится спать 🌙", posts: ["Спокойной ночи, интернет!", "Ложусь спать. Завтра будет новый день и, может, новый подарок."] },
      en: { act: "is going to bed 🌙", posts: ["Good night, internet!", "Going to bed. Tomorrow is a new day and maybe a new gift."] } },
  ];

  // Дополнительные реплики, когда в мире есть определённые вещи.
  const EXTRA = {
    cat:   { ru: "Кот опять сел на клавиатуру. Написал «ыыыыыы». Оставлю — это искусство.", en: "The cat sat on the keyboard again. Typed “zzzzzz”. Keeping it — it's art." },
    dog:   { ru: "Пёс принёс мне палку. Палка была из пикселей, но я всё равно её бросил.", en: "The dog brought me a stick. A pixel stick, but I threw it anyway." },
    plant: { ru: "Полил фикус. Кажется, он вырос на один пиксель.", en: "Watered the ficus. I think it grew by one pixel." },
    sofa:  { ru: "Диван — лучшее изобретение человечества. После интернета.", en: "The sofa is humanity's best invention. After the internet." },
    bed:   { ru: "Спал на настоящей кровати! Спина говорит спасибо.", en: "Slept in a real bed! My back says thank you." },
    kitchen: { ru: "На новой кухне приготовил целых два блюда одновременно. Прогресс!", en: "Cooked two dishes at once in the new kitchen. Progress!" },
    wallpaper: { ru: "С новыми обоями квартира будто стала теплее.", en: "With the new wallpaper the flat feels warmer." },
    desk:  { ru: "За настоящим столом работается совсем иначе. Коробку оставил на память.", en: "Working at a real desk is a whole different thing. Kept the box as a souvenir." },
    guitar:{ ru: "Выучил на гитаре три аккорда. Соседи пока не жаловались.", en: "Learned three chords on the guitar. The neighbours haven't complained yet." },
    tv:    { ru: "Смотрел по телику передачу про китов. Хочу аквариум побольше.", en: "Watched a show about whales on TV. I want a bigger fish tank." },
    fish:  { ru: "Рыбки сегодня особенно бодрые. Назвал их Пинг и Понг.", en: "The fish are extra lively today. Named them Ping and Pong." },
    poster:{ ru: "Смотрю на постер с космосом и мечтаю о звёздах.", en: "Looking at the space poster and dreaming about stars." },
  };

  function detect() {
    const q = new URLSearchParams(location.search).get("lang"); // ?lang=en — разовый просмотр
    if (q === "ru" || q === "en") return q;
    const pref = localStorage.getItem("lang") || "auto";
    if (pref === "ru" || pref === "en") return pref;
    const langs = navigator.languages || [navigator.language || "en"];
    for (const l of langs) {
      const c = String(l).slice(0, 2).toLowerCase();
      if (["ru", "uk", "be", "kk"].includes(c)) return "ru";
      if (c === "en") return "en";
    }
    return "en";
  }

  const I18N = {
    lang: detect(),
    STR, SCHEDULE, EXTRA,
    pref() { return localStorage.getItem("lang") || "auto"; },
    setPref(p) { localStorage.setItem("lang", p); this.lang = detect(); },
    t(key, vars) {
      let s = (STR[this.lang] && STR[this.lang][key]) ?? STR.ru[key] ?? key;
      if (typeof s === "string" && vars) s = s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
      return s;
    },
    // Текст из данных: строка или {ru, en}
    pick(v) { if (v && typeof v === "object") return v[this.lang] ?? v.ru ?? v.en ?? ""; return v ?? ""; },
    apply(root = document) {
      document.documentElement.lang = this.lang;
      root.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = this.t(el.dataset.i18n)));
      root.querySelectorAll("[data-i18n-html]").forEach((el) => (el.innerHTML = this.t(el.dataset.i18nHtml))); // только наши строки
      root.querySelectorAll("[data-i18n-ph]").forEach((el) => (el.placeholder = this.t(el.dataset.i18nPh)));
      root.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = el.ariaLabel = this.t(el.dataset.i18nTitle)));
    },
  };
  window.I18N = I18N;
})();

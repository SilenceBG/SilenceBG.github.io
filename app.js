/* Однушка Пикселя — рендер мира, дневник, донаты. Чистый JS, без сборки. */
(function () {
  "use strict";
  const CFG = window.APP_CONFIG, I = window.I18N, SPR = window.SPRITES;
  const t = (k, v) => I.t(k, v);
  const W = 256, H = 144, SCALE = 4;
  const canvas = document.getElementById("world");
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const params = new URLSearchParams(location.search);

  let CATALOG = { tiers: [], items: {} }, WORLD = { items: [] }, FEED = [];
  let knownTx = null;
  let layout = null;           // расчёт расположения предметов
  let hitboxes = [];
  const effects = [];          // сердечки

  // ---------- время (локальное время посетителя, если CFG.TIMEZONE не задан) ----------
  function kyivParts(date = new Date()) {
    const f = new Intl.DateTimeFormat("en-GB", { timeZone: CFG.TIMEZONE || undefined, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour % 24, mi: +p.minute, s: +p.second };
  }
  function kyivOffsetMin(date = new Date()) {
    const p = kyivParts(date);
    return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - date.getTime()) / 60000);
  }
  function nowMinutes() {
    if (params.has("hour")) return Math.round(parseFloat(params.get("hour")) * 60) % 1440; // ?hour=21.5 для отладки
    const p = kyivParts(); return p.h * 60 + p.mi + p.s / 60;
  }
  const pad = (n) => String(n).padStart(2, "0");
  const fmtHM = (m) => pad(Math.floor(m / 60) % 24) + ":" + pad(Math.floor(m % 60));

  // ---------- утилиты ----------
  function hashStr(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; }; }
  const lerp = (a, b, k) => a + (b - a) * k;
  function mix(c1, c2, k) {
    const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
    const r = Math.round(lerp(a >> 16, b >> 16, k)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, k)), bl = Math.round(lerp(a & 255, b & 255, k));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
  }
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  function spr(name, x, bottom, scale = 2, flip = false) {
    const s = SPR[name + (flip ? "_f" : "")]; if (!s) return { w: 0, h: 0 };
    const w = s.width * scale, h = s.height * scale;
    ctx.drawImage(s, Math.round(x), Math.round(bottom - h), w, h);
    return { w, h };
  }
  const shortAddr = (a) => (!a ? "?" : a.length > 14 ? a.slice(0, 5) + "…" + a.slice(-4) : a);
  const itemName = (id) => { const it = CATALOG.items[id]; return it ? (I.lang === "en" ? it.name_en : it.name) : id; };
  const tierName = (tr) => (I.lang === "en" ? tr.name_en : tr.name);
  const tierDesc = (tr) => (I.lang === "en" ? tr.desc_en : tr.desc);
  const charName = () => I.pick(CFG.CHARACTER_NAME);

  // ---------- распорядок ----------
  function currentBlock(m) {
    let b = I.SCHEDULE[0];
    for (const s of I.SCHEDULE) if (m >= s.from) b = s;
    return b;
  }

  // ---------- освещение ----------
  // daylight 0..1, цвет неба
  const SKY = [[0, "#0b0d2a"], [5.5, "#1a1d4a"], [6.5, "#f59e7a"], [8, "#8fd0ff"], [12, "#79c4ff"], [17.5, "#8fc6ff"], [19, "#ff9a6a"], [20, "#5a3f7a"], [21, "#141640"], [24, "#0b0d2a"]];
  function skyColor(hf) {
    for (let i = 0; i < SKY.length - 1; i++) if (hf >= SKY[i][0] && hf <= SKY[i + 1][0]) return mix(SKY[i][1], SKY[i + 1][1], (hf - SKY[i][0]) / (SKY[i + 1][0] - SKY[i][0]));
    return SKY[0][1];
  }
  function daylight(hf) {
    if (hf < 5.5 || hf > 21) return 0;
    if (hf < 8) return (hf - 5.5) / 2.5;
    if (hf > 18.5) return 1 - (hf - 18.5) / 2.5;
    return 1;
  }

  // ---------- раскладка предметов ----------
  const SLOTS = {
    wall: [{ x: 86, y: 26 }, { x: 168, y: 28 }, { x: 200, y: 34 }, { x: 230, y: 34 }, { x: 40, y: 10 }],
    floor_small: [{ x: 86, b: 100 }, { x: 182, b: 100 }, { x: 56, b: 132 }, { x: 236, b: 136 }, { x: 98, b: 130 }, { x: 168, b: 138 }],
    floor_big: [{ x: 100, b: 100 }, { x: 10, b: 140 }, { x: 116, b: 142 }, { x: 204, b: 142 }],
  };
  function computeLayout() {
    const L = { wall: [], floor_small: [], floor_big: [], pets: [], desk: [], storage: [], flags: {}, rug: null, owners: {} };
    const used = { wall: 0, floor_small: 0, floor_big: 0 };
    for (const it of WORLD.items || []) {
      const def = CATALOG.items[it.id]; if (!def) continue;
      const slot = def.slot;
      if (["bed", "desk_upgrade", "kitchen", "wallpaper", "aircon", "wall_top"].includes(slot) || slot === "rug") {
        const key = slot === "wall_top" ? "garland" : slot;
        if (key === "rug") { if (!L.rug) L.rug = it; else L.storage.push(it); continue; }
        if (!L.flags[key]) { L.flags[key] = it; } else L.storage.push(it);
        continue;
      }
      if (slot === "pet") { if (L.pets.length < 4) L.pets.push(it); else L.storage.push(it); continue; }
      if (slot === "desk") { if (L.desk.length < 2) L.desk.push(it); else L.storage.push(it); continue; }
      const arr = SLOTS[slot];
      if (arr && used[slot] < arr.length) { L[slot].push({ it, pos: arr[used[slot]++] }); }
      else L.storage.push(it);
    }
    return L;
  }

  // ---------- персонаж и питомцы ----------
  const hero = { x: 210, b: 100, tx: 210, tb: 100, mode: "stand", facing: 1, moving: false, visible: true, bubble: null, bubbleT: 0 };
  let pets = [];
  function syncPets() {
    const prev = Object.fromEntries(pets.map((p) => [p.it.tx, p]));
    pets = layout.pets.map((it, i) => prev[it.tx] || { it, kind: it.id, x: 60 + i * 40, b: 120 + (i % 2) * 10, tx: 100, tb: 120, wait: 0, flip: false, frame: 0 });
  }
  function deskGeom() { return layout.flags.desk_upgrade ? { x: 146, w: 38, top: 72, b: 98 } : { x: 150, w: 22, top: 82, b: 98 }; }
  function sofaPos() { const s = layout.floor_big.find((e) => e.it.id === "sofa"); return s ? { x: s.pos.x + 20, b: s.pos.b - 4 } : null; }
  function heroTarget(block) {
    const d = deskGeom();
    switch (block.place) {
      case "bed": return { x: 214, b: 100, mode: "sleep", vis: true };
      case "bath": return { x: 72, b: 96, mode: "hidden", vis: false };
      case "out": return { x: 72, b: 96, mode: "hidden", vis: false };
      case "kitchen": return { x: 34, b: 99, mode: "back" };
      case "desk": return { x: d.x + d.w / 2, b: layout.flags.desk_upgrade ? 104 : 103, mode: "back" };
      case "window": return { x: 124, b: 101, mode: "back" };
      case "sofa": { const s = sofaPos(); return s ? { x: s.x, b: s.b, mode: "front" } : { x: 206, b: 104, mode: "front" }; }
      case "hobby": {
        const g = layout.floor_small.find((e) => e.it.id === "guitar");
        if (g) return { x: g.pos.x + 22, b: g.pos.b + 2, mode: "front" };
        const tv = layout.floor_big.find((e) => e.it.id === "tv");
        if (tv) return { x: tv.pos.x + 16, b: tv.pos.b + 24, mode: "back" };
        return { x: d.x + d.w / 2, b: 103, mode: "back" };
      }
    }
    return { x: 128, b: 110, mode: "front" };
  }

  // ---------- отрисовка комнаты ----------
  function drawWall(hf) {
    const wp = layout.flags.wallpaper;
    if (wp) {
      R(0, 0, W, 92, "#d9b8a0");
      for (let y = 4; y < 90; y += 10) for (let x = (y / 10) % 2 ? 6 : 1; x < W; x += 10) { R(x, y, 2, 2, "#c99c80"); R(x + 1, y - 1, 1, 1, "#e9cdb6"); }
      R(0, 0, W, 3, "#b48a6e");
    } else {
      R(0, 0, W, 92, "#a8a3a0"); // голый бетон
      const r = rng(7);
      for (let i = 0; i < 160; i++) R(r() * W, r() * 90, 1, 1, r() > 0.5 ? "#9b9693" : "#b4afac");
      // трещина
      ctx.fillStyle = "#86817e"; [[230, 6], [231, 7], [231, 8], [232, 9], [232, 10], [233, 11], [232, 12], [233, 13]].forEach(([x, y]) => ctx.fillRect(x, y, 1, 1));
    }
    R(0, 88, W, 4, wp ? "#7a5038" : "#8a8582"); // плинтус
  }
  function drawFloor() {
    R(0, 92, W, 52, "#9c6b43");
    for (let y = 92; y < H; y += 6) { R(0, y, W, 1, "#8a5c38"); for (let x = (y / 6) % 2 ? 0 : 20; x < W; x += 40) R(x, y, 1, 6, "#8a5c38"); }
  }
  function drawWindow(hf, m) {
    const x = 104, y = 16, w = 40, h = 42;
    R(x - 2, y - 2, w + 4, h + 4, "#e9e4dc");
    R(x, y, w, h, skyColor(hf));
    const dl = daylight(hf);
    if (dl < 0.5) { const r = rng(3); for (let i = 0; i < 14; i++) { const tw = (Math.sin(m * 3 + i) + 1) / 2; R(x + r() * w, y + r() * (h - 14), 1, 1, tw > 0.4 ? "#fff8d0" : "#8888aa"); } R(x + 28, y + 6, 6, 6, "#f4f0c8"); R(x + 30, y + 6, 4, 4, skyColor(hf)); }
    else { const sx = x + 6 + ((hf - 6) / 14) * (w - 12); R(sx, y + 6 + Math.abs(13 - hf) * 0.8, 5, 5, "#fff2a0"); }
    // облака
    const cx = ((m * 0.4) % (w + 20)) - 10;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    R(x + cx, y + 14, 12, 3, dl > 0.3 ? "#ffffffcc" : "#ffffff22"); R(x + cx + 3, y + 12, 6, 2, dl > 0.3 ? "#ffffffcc" : "#ffffff22");
    // силуэт города
    const r2 = rng(11); let bx = x;
    while (bx < x + w) { const bw = 4 + Math.floor(r2() * 6), bh = 6 + Math.floor(r2() * 12); R(bx, y + h - bh, bw, bh, dl > 0.4 ? "#6c7fa6" : "#232548"); if (dl < 0.5) for (let wy = y + h - bh + 2; wy < y + h - 1; wy += 3) if (r2() > 0.5) R(bx + 1 + Math.floor(r2() * (bw - 2)), wy, 1, 1, "#ffd76a"); bx += bw + 1; }
    ctx.restore();
    R(x + w / 2 - 1, y, 2, h, "#e9e4dc"); R(x, y + 18, w, 2, "#e9e4dc");
    R(x - 4, y + h + 2, w + 8, 3, "#f3efe8"); // подоконник
    hitboxes.push({ x: x - 2, y: y - 2, w: w + 4, h: h + 6, title: t("windowName") });
  }
  function drawKitchen(lit) {
    const up = layout.flags.kitchen;
    if (!up) {
      for (let ty = 52; ty < 72; ty += 4) for (let tx = 2; tx < 52; tx += 5) R(tx, ty, 4, 3, "#d8e3e8");
      R(2, 70, 50, 3, "#cfc8bd"); R(2, 73, 50, 21, "#e8e1d4"); R(2, 73, 50, 1, "#b9b2a6");
      R(26, 74, 1, 20, "#b9b2a6"); R(22, 82, 2, 3, "#888"); R(29, 82, 2, 3, "#888");
      R(8, 68, 12, 3, "#9fb3bf"); R(13, 62, 2, 7, "#9aa"); R(13, 62, 5, 2, "#9aa"); // раковина и кран
      R(32, 67, 14, 3, "#333"); R(35, 66, 8, 1, "#c33"); // плитка
      R(6, 40, 26, 2, "#8a4f24"); R(8, 34, 5, 6, "#f2f2f2"); R(15, 35, 4, 5, "#d9a441"); R(22, 33, 6, 7, "#c94c4c");
      hitboxes.push({ x: 2, y: 34, w: 50, h: 60, title: t("kitchenOld") });
    } else {
      R(2, 34, 16, 60, "#eef2f5"); R(2, 34, 16, 1, "#b8c2c8"); R(2, 56, 16, 1, "#b8c2c8"); R(15, 42, 1, 8, "#888"); R(15, 60, 1, 10, "#888");
      for (let ty = 52; ty < 72; ty += 4) for (let tx = 18; tx < 58; tx += 5) R(tx, ty, 4, 3, "#7fc8c0");
      R(18, 26, 40, 22, "#5a8f6a"); R(37, 26, 1, 22, "#3e6a4c"); R(30, 40, 2, 2, "#e5c07b"); R(42, 40, 2, 2, "#e5c07b");
      R(18, 70, 40, 3, "#e8d9b8"); R(18, 73, 40, 21, "#5a8f6a"); R(37, 73, 1, 21, "#3e6a4c"); R(34, 80, 2, 3, "#e5c07b"); R(40, 80, 2, 3, "#e5c07b");
      R(20, 66, 12, 4, "#9fb3bf"); R(25, 60, 2, 7, "#ccd"); R(40, 67, 14, 3, "#222"); R(42, 66, 4, 1, "#e33"); R(48, 66, 4, 1, "#e33");
      R(44, 62, 6, 4, "#999"); R(45, 61, 4, 1, "#bbb"); // кастрюля
      hitboxes.push({ x: 2, y: 26, w: 56, h: 68, it: up });
    }
  }
  function drawBathDoor(heroInBath) {
    R(60, 42, 24, 52, "#e9e4dc"); R(62, 44, 20, 50, "#b98a5a"); R(64, 47, 16, 18, "#a87a4c"); R(64, 69, 16, 22, "#a87a4c"); R(78, 68, 2, 3, "#e5c07b");
    R(67, 36, 10, 5, "#4fb3ff"); R(70, 37, 4, 3, "#ffffff"); // табличка
    if (heroInBath) { R(62, 93, 20, 1, "#ffe9a0"); }
    hitboxes.push({ x: 60, y: 36, w: 24, h: 58, title: t("bathDoor") });
  }
  function drawBulb(on) {
    const x = 162;
    R(x, 0, 1, 12, "#333"); R(x - 2, 12, 5, 2, "#555"); R(x - 2, 14, 5, 5, on ? "#fff6c0" : "#d8d4c0");
    if (on) { const g = ctx.createRadialGradient(x, 17, 1, x, 17, 26); g.addColorStop(0, "#fff6c055"); g.addColorStop(1, "#fff6c000"); ctx.fillStyle = g; ctx.fillRect(x - 26, 0, 52, 44); }
    hitboxes.push({ x: x - 3, y: 0, w: 7, h: 20, title: t("bulb") });
  }
  function drawAircon(it) { R(196, 10, 34, 11, "#f4f6f8"); R(196, 18, 34, 1, "#c7cfd6"); R(198, 19, 30, 2, "#dfe5ea"); R(224, 12, 3, 1, "#4fd1c5"); hitboxes.push({ x: 196, y: 10, w: 34, h: 11, it }); }
  function drawGarland(it, m) { for (let x = 4; x < W; x += 8) { const y = 4 + Math.round(Math.sin(x / 16) * 2); R(x, y - 1, 8, 1, "#3a3a3a"); const c = ["#ff6b8b", "#ffcc4d", "#4fd1c5", "#7fd6ff"][(x / 8 + Math.floor(m * 2)) % 4]; R(x + 3, y, 2, 2, c); } hitboxes.push({ x: 0, y: 0, w: W, h: 9, it }); }

  function drawMattressOrBed(sleeping, m) {
    const bed = layout.flags.bed;
    if (!bed) {
      R(190, 92, 60, 9, "#e8e4f0"); R(190, 100, 60, 2, "#b9b4c8"); R(240, 89, 10, 5, "#ffffff");
      if (!sleeping) R(196, 91, 36, 9, "#6f8fd6");
      hitboxes.push({ x: 190, y: 88, w: 60, h: 14, title: t("mattress") });
      return { headX: 236, headY: 84, blanket: [196, 90, 40, 10, "#6f8fd6"] };
    }
    R(188, 96, 3, 8, "#6b3d1f"); R(249, 96, 3, 8, "#6b3d1f"); R(246, 66, 6, 34, "#8a4f24"); R(247, 68, 4, 2, "#a8653a");
    R(188, 84, 60, 14, "#8a4f24"); R(188, 80, 58, 6, "#f3f0f8"); R(236, 76, 10, 5, "#ffffff");
    if (!sleeping) R(194, 79, 40, 9, "#d6556f");
    hitboxes.push({ x: 186, y: 66, w: 66, h: 38, it: bed });
    return { headX: 232, headY: 70, blanket: [194, 78, 40, 10, "#d6556f"] };
  }
  function drawDesk(m) {
    const d = deskGeom(), up = layout.flags.desk_upgrade;
    if (!up) {
      R(d.x, d.top, d.w, d.b - d.top, "#c9a06a"); R(d.x, d.top, d.w, 2, "#b08850"); R(d.x + 8, d.top + 6, 6, 1, "#9c7a48");
      hitboxes.push({ x: d.x, y: d.top - 8, w: d.w, h: d.b - d.top + 8, title: t("box") });
    } else {
      R(d.x, d.top, d.w, 3, "#8a4f24"); R(d.x + 2, d.top + 3, 2, d.b - d.top - 3, "#6b3d1f"); R(d.x + d.w - 4, d.top + 3, 2, d.b - d.top - 3, "#6b3d1f");
      R(d.x + d.w - 14, d.top + 3, 10, 10, "#a8653a"); R(d.x + d.w - 10, d.top + 7, 2, 1, "#e5c07b");
      hitboxes.push({ x: d.x, y: d.top - 8, w: d.w, h: d.b - d.top + 8, it: up });
    }
    // ноутбук
    const lx = d.x + 3, ly = d.top;
    R(lx, ly - 7, 12, 7, "#3b3b4a"); R(lx + 1, ly - 6, 10, 5, (Math.floor(m * 2) % 2) ? "#7fd6ff" : "#6cc6f0"); R(lx - 1, ly - 1, 14, 1, "#55556a");
    // предметы на столе
    layout.desk.forEach((e, i) => { const x = d.x + d.w - 8 - i * 8; const s = spr("mug", x, d.top, 1); hitboxes.push({ x, y: d.top - s.h, w: s.w, h: s.h, it: e.it }); });
  }
  function drawRug(it) { R(96, 108, 80, 18, "#7a4fa0"); R(98, 110, 76, 14, "#9a6cc4"); for (let x = 102; x < 172; x += 8) R(x, 116, 4, 2, "#ffcc4d"); hitboxes.push({ x: 96, y: 108, w: 80, h: 18, it }); }

  function drawWallItem(e, m, hf) {
    const { x, y } = e.pos, id = e.it.id;
    let w = 14, h = 18;
    if (id === "poster") { R(x, y, 14, 18, "#1b1f4a"); R(x + 1, y + 1, 12, 16, "#2c3378"); R(x + 4, y + 4, 4, 4, "#ffcc4d"); R(x + 9, y + 10, 2, 2, "#ff7a9a"); R(x + 3, y + 13, 1, 1, "#fff"); R(x + 10, y + 3, 1, 1, "#fff"); }
    else if (id === "clock") { w = h = 12; R(x, y, 12, 12, "#2a2547"); R(x + 1, y + 1, 10, 10, "#f5f0e6"); const p = kyivParts(); const a = ((p.h % 12) + p.mi / 60) / 12 * Math.PI * 2, b = p.mi / 60 * Math.PI * 2; ctx.fillStyle = "#222"; for (let i = 0; i < 4; i++) { ctx.fillRect(Math.round(x + 6 + Math.sin(a) * i * 0.8), Math.round(y + 6 - Math.cos(a) * i * 0.8), 1, 1); } for (let i = 0; i < 5; i++) ctx.fillRect(Math.round(x + 6 + Math.sin(b) * i), Math.round(y + 6 - Math.cos(b) * i), 1, 1); }
    else { R(x, y, w, h, "#888"); }
    hitboxes.push({ x, y, w, h, it: e.it });
  }

  // Предметы на полу: возвращает функцию отрисовки + нижнюю границу (для сортировки по глубине)
  function floorDrawables(m, hf, lightsOn) {
    const list = [];
    for (const e of layout.floor_small) {
      const { x, b } = e.pos, id = e.it.id;
      list.push({ b, draw: () => {
        let s;
        if (id === "plant") s = spr("plant", x, b);
        else if (id === "lamp") { s = spr("lamp", x, b); if (lightsOn) { const g = ctx.createRadialGradient(x + 9, b - 26, 2, x + 9, b - 26, 34); g.addColorStop(0, "#ffd76a66"); g.addColorStop(1, "#ffd76a00"); ctx.fillStyle = g; ctx.fillRect(x - 30, b - 60, 78, 70); } }
        else if (id === "guitar") s = spr("guitar", x, b);
        else if (id === "fish") { R(x, b - 18, 24, 4, "#2a2547"); R(x, b - 14, 24, 14, "#2a2547"); R(x + 1, b - 31, 22, 17, "#7fd6ffaa"); R(x + 1, b - 31, 22, 2, "#bfeaff"); R(x + 3, b - 16, 18, 2, "#e5c07b"); R(x + 5, b - 22, 1, 6, "#5ccf6a"); R(x + 18, b - 24, 1, 8, "#5ccf6a");
          const fx = x + 3 + ((Math.sin(m * 1.3) + 1) / 2) * 14; ctx.drawImage(Math.cos(m * 1.3) > 0 ? SPR.fishL_f : SPR.fishL, Math.round(fx), b - 26);
          const fx2 = x + 3 + ((Math.sin(m * 0.9 + 2) + 1) / 2) * 14; ctx.drawImage(Math.cos(m * 0.9 + 2) > 0 ? SPR.fishL_f : SPR.fishL, Math.round(fx2), b - 21);
          s = { w: 24, h: 31 }; R(x + 2 + (Math.floor(m * 4) % 18), b - 30 + (Math.floor(m * 6) % 8), 1, 1, "#ffffff"); }
        else s = { w: 10, h: 10 };
        hitboxes.push({ x, y: b - s.h, w: s.w, h: s.h, it: e.it });
      } });
    }
    for (const e of layout.floor_big) {
      const { x, b } = e.pos, id = e.it.id;
      list.push({ b, draw: () => {
        let w = 40, h = 22;
        if (id === "sofa") { R(x, b - 22, 40, 12, "#3f7fbf"); R(x - 2, b - 14, 6, 12, "#2f6aa6"); R(x + 36, b - 14, 6, 12, "#2f6aa6"); R(x + 2, b - 12, 36, 8, "#4f93d6"); R(x + 19, b - 12, 1, 8, "#3f7fbf"); R(x, b - 4, 2, 4, "#222"); R(x + 38, b - 4, 2, 4, "#222"); R(x + 6, b - 19, 7, 6, "#ffcc4d"); }
        else if (id === "shelf") { w = 24; h = 42; R(x, b - 42, 24, 42, "#8a4f24"); for (let i = 0; i < 4; i++) { R(x + 2, b - 40 + i * 10, 20, 8, "#5e3418"); const r = rng(i + 5); for (let k = 0; k < 6; k++) R(x + 3 + k * 3, b - 38 + i * 10 + Math.floor(r() * 2), 2, 6 - Math.floor(r() * 2), ["#c94c4c", "#4fb3ff", "#ffcc4d", "#5ccf6a", "#e8e0ff"][Math.floor(r() * 5)]); } }
        else if (id === "tv") { w = 32; h = 28; R(x + 2, b - 8, 28, 8, "#6b3d1f"); R(x, b - 28, 32, 20, "#1a1326"); const on = hf > 18 || hf < 1; R(x + 2, b - 26, 28, 16, on ? ["#4fd1c5", "#7fd6ff", "#ff9a6a"][Math.floor(m / 2) % 3] : "#2a2a3a"); }
        else if (id === "wardrobe") { w = 30; h = 56; R(x, b - 56, 30, 56, "#a8653a"); R(x + 1, b - 55, 13, 50, "#b9774a"); R(x + 16, b - 55, 13, 50, "#b9774a"); R(x + 12, b - 32, 1, 5, "#e5c07b"); R(x + 17, b - 32, 1, 5, "#e5c07b"); R(x, b - 4, 30, 4, "#6b3d1f"); }
        hitboxes.push({ x, y: b - h, w, h, it: e.it });
      } });
    }
    return list;
  }

  function drawHeroSprite(m) {
    if (!hero.visible) return;
    const bob = hero.moving ? (Math.floor(m * 6) % 2) : Math.round(Math.sin(m * 2) * 0.5 + 0.5) * 0;
    let name = "hero";
    if (hero.moving) name = Math.floor(m * 6) % 2 ? "hero" : "hero2";
    else if (hero.mode === "back") name = "heroBack";
    const s = SPR[name]; const w = s.width * 2, h = s.height * 2;
    ctx.drawImage(hero.facing < 0 ? SPR[name + "_f"] : s, Math.round(hero.x - w / 2), Math.round(hero.b - h - bob), w, h);
    hitboxes.push({ x: hero.x - w / 2, y: hero.b - h, w, h, title: charName() });
  }

  function drawBubble(text, x, y) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.font = "bold 22px system-ui, sans-serif"; const tw = ctx.measureText(text).width;
    let bx = x * SCALE - tw / 2 - 12, by = y * SCALE - 52;
    bx = Math.max(6, Math.min(canvas.width - tw - 30, bx));
    ctx.fillStyle = "#fffdf5"; ctx.strokeStyle = "#1a1326"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, tw + 24, 40, 10) : ctx.rect(bx, by, tw + 24, 40); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#1a1326"; ctx.textBaseline = "middle"; ctx.fillText(text, bx + 12, by + 21);
    ctx.restore();
  }

  // ---------- главный цикл ----------
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    const m = now / 1000;
    const mins = nowMinutes(), hf = mins / 60;
    const block = currentBlock(mins);
    hitboxes = [];
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); ctx.imageSmoothingEnabled = false;

    // цель персонажа
    const tg = heroTarget(block);
    const home = tg.vis !== false;
    hero.tx = tg.x; hero.tb = tg.b;
    const dx = hero.tx - hero.x, db = hero.tb - hero.b, dist = Math.hypot(dx, db);
    if (dist > 0.8) { const sp = 28 * dt; hero.x += (dx / dist) * Math.min(sp, dist); hero.b += (db / dist) * Math.min(sp, dist); hero.moving = true; hero.facing = dx < -0.3 ? -1 : dx > 0.3 ? 1 : hero.facing; hero.mode = "walk"; hero.visible = true; }
    else { hero.moving = false; hero.mode = tg.mode; hero.visible = home && tg.mode !== "sleep"; }
    const sleeping = !hero.moving && tg.mode === "sleep";
    const lightsOn = home && !sleeping && daylight(hf) < 0.7;

    drawWall(hf); drawFloor();
    drawWindow(hf, m);
    drawKitchen(lightsOn);
    drawBathDoor(block.place === "bath" && !hero.moving);
    if (layout.flags.garland) drawGarland(layout.flags.garland, m);
    if (layout.flags.aircon) drawAircon(layout.flags.aircon);
    layout.wall.forEach((e) => drawWallItem(e, m, hf));
    if (layout.rug) drawRug(layout.rug);
    const bedInfo = drawMattressOrBed(sleeping, m);
    if (sleeping) { // голова на подушке + одеяло
      const s = SPR.hero; ctx.drawImage(s, 0, 0, 10, 7, bedInfo.headX - 4, bedInfo.headY + 3, 14, 10);
      const [bx, by, bw, bh, bc] = bedInfo.blanket; R(bx, by, bw, bh, bc); R(bx, by, bw, 1, "#ffffff55");
      ctx.font = "6px monospace"; ctx.fillStyle = "#ffffff"; const z = Math.floor(m) % 3; for (let i = 0; i <= z; i++) ctx.fillText("z", bedInfo.headX + 8 + i * 4, bedInfo.headY - i * 4);
      hitboxes.push({ x: bedInfo.headX - 4, y: bedInfo.headY, w: 14, h: 12, title: charName() + " 💤" });
    }
    drawDesk(m);

    // питомцы: случайные прогулки, ночью спят у кровати
    for (const p of pets) {
      p.wait -= dt;
      if (sleeping) { p.tx = 186 - pets.indexOf(p) * 22; p.tb = 112; }
      else if (p.wait <= 0) { p.tx = 40 + Math.random() * 190; p.tb = 104 + Math.random() * 34; p.wait = 3 + Math.random() * 6; }
      const ddx = p.tx - p.x, ddb = p.tb - p.b, dd = Math.hypot(ddx, ddb);
      p.moving = dd > 0.8; if (p.moving) { const sp = (p.kind === "dog" ? 22 : 16) * dt; p.x += (ddx / dd) * Math.min(sp, dd); p.b += (ddb / dd) * Math.min(sp, dd); p.flip = ddx > 0; }
    }
    const drawables = floorDrawables(m, hf, lightsOn);
    for (const p of pets) drawables.push({ b: p.b, draw: () => { const nm = p.kind + (p.moving && Math.floor(m * 6) % 2 ? "2" : ""); const s = spr(nm, p.x - 10, p.b, 2, p.flip); hitboxes.push({ x: p.x - 10, y: p.b - s.h, w: s.w, h: s.h, it: p.it }); } });
    drawables.push({ b: hero.b, draw: () => drawHeroSprite(m) });
    drawables.sort((a, b) => a.b - b.b).forEach((d) => d.draw());

    drawBulb(lightsOn);

    // освещение
    const dl = daylight(hf);
    const dark = lightsOn ? (1 - dl) * 0.18 : (1 - dl) * 0.62;
    if (dark > 0.01) { ctx.fillStyle = `rgba(12,14,48,${dark.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
    if (lightsOn) { ctx.fillStyle = `rgba(255,200,120,${((1 - dl) * 0.08).toFixed(3)})`; ctx.fillRect(0, 0, W, H); }

    // эффекты (сердечки)
    for (let i = effects.length - 1; i >= 0; i--) { const e = effects[i]; e.t += dt; e.y -= 14 * dt; if (e.t > 2.5) { effects.splice(i, 1); continue; } ctx.globalAlpha = 1 - e.t / 2.5; spr("heart", e.x + Math.sin(e.t * 4 + i) * 3, e.y, 1); ctx.globalAlpha = 1; }

    // облачко с мыслью
    if (hero.visible && !hero.moving) {
      hero.bubbleT -= dt;
      if (hero.bubbleT <= 0) { hero.bubble = hero.bubble ? null : pickBubble(block); hero.bubbleT = hero.bubble ? 4 : 8 + Math.random() * 8; }
      if (hero.bubble) drawBubble(hero.bubble, hero.x, hero.b - 34);
    } else if (block.place === "bath" && !hero.moving) drawBubble("🚿 ♪", 72, 46);

    requestAnimationFrame(frame);
  }
  function pickBubble(block) {
    const opts = I.lang === "en"
      ? { kitchen: ["Mmm, smells good!", "Needs more salt…"], desk: ["Hmm…", "Almost done!", "One more line"], window: ["Nice view", "Clouds!"], sofa: ["Cozy…", "Page 42"], hobby: ["♪ ♫", "Dear diary…"], def: ["…"] }
      : { kitchen: ["Ммм, вкусно пахнет!", "Соли бы…"], desk: ["Хмм…", "Почти готово!", "Ещё строчку"], window: ["Красиво", "Облака!"], sofa: ["Уютно…", "Страница 42"], hobby: ["♪ ♫", "Дорогой дневник…"], def: ["…"] };
    const arr = opts[block.place] || opts.def; return arr[Math.floor(Math.random() * arr.length)];
  }

  // ---------- подсказки ----------
  const tip = document.getElementById("tooltip");
  function showTip(ev) {
    const r = canvas.getBoundingClientRect();
    const cx = ev.clientX ?? (ev.touches && ev.touches[0].clientX), cy = ev.clientY ?? (ev.touches && ev.touches[0].clientY);
    const lx = ((cx - r.left) / r.width) * W, ly = ((cy - r.top) / r.height) * H;
    let hit = null; for (let i = hitboxes.length - 1; i >= 0; i--) { const h = hitboxes[i]; if (lx >= h.x && lx <= h.x + h.w && ly >= h.y && ly <= h.y + h.h) { hit = h; break; } }
    if (!hit) { tip.hidden = true; canvas.style.cursor = "default"; return; }
    canvas.style.cursor = hit.it ? "pointer" : "default";
    tip.replaceChildren();
    const b = document.createElement("b"); b.textContent = hit.it ? itemName(hit.it.id) : hit.title; tip.append(b);
    if (hit.it) {
      const d = document.createElement("div"); d.textContent = `${t("tipFrom")} ${shortAddr(hit.it.donor)}`; tip.append(d);
      if (hit.it.comment) { const q = document.createElement("div"); q.style.fontStyle = "italic"; q.textContent = "«" + hit.it.comment + "»"; tip.append(q); }
    }
    tip.style.left = cx - r.left + "px"; tip.style.top = cy - r.top + "px"; tip.hidden = false;
  }
  canvas.addEventListener("mousemove", showTip);
  canvas.addEventListener("click", showTip);
  canvas.addEventListener("mouseleave", () => (tip.hidden = true));

  // ---------- дневник ----------
  function genLifeLog() {
    // Детерминированный «дневник жизни»: сегодня (до текущего момента) + 2 прошлых дня.
    const out = [];
    const off = kyivOffsetMin();
    const p = kyivParts();
    const mins = nowMinutes();
    const ownedSince = (WORLD.items || []).map((it) => ({ id: it.id, ts: Date.parse(it.ts) || 0 }));
    for (let back = 0; back < 3; back++) {
      const dayUTC = Date.UTC(p.y, p.mo - 1, p.d - back); // локальная полночь как UTC-метка
      const dayKey = new Date(dayUTC).toISOString().slice(0, 10);
      const r = rng(hashStr(dayKey));
      const usedTexts = new Set();
      I.SCHEDULE.forEach((blk, idx) => {
        if (idx > 0 && r() < 0.35) return; // не каждый пункт попадает в дневник
        const at = blk.from + Math.floor(r() * 20) + (idx === 0 ? 30 : 0);
        if (back === 0 && at > mins) return;
        const ms = dayUTC + at * 60000 - off * 60000;
        const owned = ownedSince.filter((o) => o.ts && o.ts < ms && I.EXTRA[o.id]);
        let text;
        const extras = owned.map((o) => I.pick(I.EXTRA[o.id])).filter((x) => !usedTexts.has(x));
        if (extras.length && r() < 0.3) text = extras[Math.floor(r() * extras.length)];
        else { const posts = (blk[I.lang] || blk.ru).posts; text = posts[Math.floor(r() * posts.length)]; }
        usedTexts.add(text);
        out.push({ ms, type: "life", text, act: blk.id, live: back === 0 && blk === currentBlock(mins) });
      });
    }
    return out;
  }
  function fmtWhen(ms) {
    const p = kyivParts(new Date(ms)), n = kyivParts();
    const hm = pad(p.h) + ":" + pad(p.mi);
    const dayDiff = Math.round((Date.UTC(n.y, n.mo - 1, n.d) - Date.UTC(p.y, p.mo - 1, p.d)) / 86400000);
    if (dayDiff === 0) return t("today") + ", " + hm;
    if (dayDiff === 1) return t("yesterday") + ", " + hm;
    return pad(p.d) + "." + pad(p.mo) + ", " + hm;
  }
  function renderFeed() {
    const ul = document.getElementById("feed");
    const entries = [...genLifeLog(), ...FEED.map((e) => ({ ...e, ms: Date.parse(e.ts) }))].filter((e) => !isNaN(e.ms) && e.ms <= Date.now() + 60000);
    entries.sort((a, b) => b.ms - a.ms);
    ul.replaceChildren();
    for (const e of entries.slice(0, 50)) {
      const li = document.createElement("li");
      const meta = document.createElement("div"); meta.className = "meta";
      const left = document.createElement("span"); const right = document.createElement("span");
      left.textContent = fmtWhen(e.ms) + (e.live ? " · " + t("now") : "");
      const text = document.createElement("div"); text.className = "text";
      if (e.type === "donation") {
        li.className = "donation";
        text.textContent = "🎁 " + (e.item ? t("gifted", { donor: shortAddr(e.donor), item: itemName(e.item) }) : t("giftedNoItem", { donor: shortAddr(e.donor) }));
        const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = `${e.amount} ${e.currency || "USDT"}`; right.append(badge);
        li.append(meta, text);
        if (e.comment) { const q = document.createElement("div"); q.className = "quote"; q.textContent = "«" + e.comment + "»"; li.append(q); }
        const th = I.t("thanks"); const reply = document.createElement("div"); reply.className = "text"; reply.style.marginTop = "6px";
        reply.textContent = charName() + ": " + th[hashStr(e.tx || e.ts) % th.length]; li.append(reply);
      } else {
        if (e.live) li.className = "live";
        text.textContent = I.pick(e.text);
        li.append(meta, text);
      }
      if (e.demo) { const d = document.createElement("span"); d.className = "demo"; d.textContent = t("demo"); left.append(d); }
      meta.append(left, right);
      ul.append(li);
    }
  }

  // ---------- статус, часы, статистика ----------
  function renderStatus() {
    const mins = nowMinutes(); const blk = currentBlock(mins);
    document.getElementById("clock-time").textContent = fmtHM(mins);
    document.getElementById("status-text").textContent = t("statusTpl", { time: fmtHM(mins), name: charName(), activity: (blk[I.lang] || blk.ru).act });
  }
  function renderStats() {
    let items = 0, petsN = 0, up = 0;
    for (const it of WORLD.items || []) { const d = CATALOG.items[it.id]; if (!d) continue; if (d.tier === "pet") petsN++; else if (d.tier === "upgrade") up++; else items++; }
    const usd = FEED.filter((e) => e.type === "donation").reduce((s, e) => s + (e.usd ?? (e.currency === "TON" ? e.amount * CFG.TON_USD_RATE : e.amount)), 0);
    document.getElementById("stat-items").textContent = items;
    document.getElementById("stat-pets").textContent = petsN;
    document.getElementById("stat-upgrades").textContent = up;
    document.getElementById("stat-usd").textContent = "$" + (Math.round(usd * 100) / 100);
  }

  // ---------- донаты ----------
  let currency = "USDT";
  const $ = (id) => document.getElementById(id);
  const placeholderWallet = () => !CFG.WALLET_ADDRESS || CFG.WALLET_ADDRESS.startsWith("PASTE_");
  function tierFor(usd) { let best = null; for (const tr of CATALOG.tiers) if (usd + 1e-9 >= tr.min_usd) best = tr; return best; }
  function amountUSD() { const a = parseFloat($("amount").value) || 0; return currency === "TON" ? a * CFG.TON_USD_RATE : a; }
  function usdToCur(usd) { return currency === "TON" ? Math.ceil((usd / CFG.TON_USD_RATE) * 10) / 10 : usd; }
  function renderTiers() {
    const box = $("tiers"); box.replaceChildren();
    const cur = tierFor(amountUSD());
    for (const tr of CATALOG.tiers) {
      const b = document.createElement("button"); b.type = "button"; b.className = "tier" + (cur && cur.id === tr.id ? " active" : "");
      const price = currency === "TON" ? `$${tr.min_usd} ≈ ${usdToCur(tr.min_usd)} TON` : `$${tr.min_usd}`;
      b.innerHTML = `<div class="e"></div><div class="n"></div><div class="p"></div><div class="d"></div>`;
      b.querySelector(".e").textContent = tr.emoji; b.querySelector(".n").textContent = tierName(tr);
      b.querySelector(".p").textContent = price; b.querySelector(".d").textContent = tierDesc(tr);
      b.onclick = () => { $("amount").value = usdToCur(tr.min_usd); const sel = $("item-select"); const d = CATALOG.items[sel.value]; if (d && d.tier !== tr.id) sel.value = ""; updatePay(); };
      box.append(b);
    }
  }
  function renderItemSelect() {
    const sel = $("item-select"), prev = sel.value; sel.replaceChildren();
    const o0 = document.createElement("option"); o0.value = ""; o0.textContent = t("surprise"); sel.append(o0);
    for (const tr of CATALOG.tiers) {
      const g = document.createElement("optgroup"); g.label = `${tr.emoji} ${tierName(tr)} — ${t("from")} $${tr.min_usd}`;
      for (const [id, d] of Object.entries(CATALOG.items)) if (d.tier === tr.id) { const o = document.createElement("option"); o.value = id; o.textContent = itemName(id); g.append(o); }
      sel.append(g);
    }
    sel.value = prev;
  }
  function buildMemo() {
    const id = $("item-select").value; const c = $("comment").value.trim().slice(0, CFG.MAX_COMMENT);
    return ((id ? "#" + id + " " : "") + c).trim();
  }
  function updatePay() {
    const a = Math.max(0, parseFloat($("amount").value) || 0);
    const memo = buildMemo(), addr = CFG.WALLET_ADDRESS;
    $("amount-label").textContent = t("amountIn", { cur: currency });
    const usd = amountUSD(), tr = tierFor(usd);
    $("amount-hint").textContent = (currency === "TON" ? t("tonApprox", { usd: Math.round(usd * 100) / 100, rate: CFG.TON_USD_RATE }) + " · " : "") + (tr ? t("tierLevel", { tier: tierName(tr) }) : t("tierNone"));
    $("comment-count").textContent = `${$("comment").value.length}/${CFG.MAX_COMMENT}`;
    const q = new URLSearchParams();
    let tonLink, tkLink;
    if (currency === "USDT") {
      const units = Math.round(a * 10 ** CFG.USDT_DECIMALS).toString();
      q.set("jetton", CFG.USDT_MASTER); q.set("amount", units); if (memo) q.set("text", memo);
    } else {
      const nano = Math.round(a * 1e9).toString(); q.set("amount", nano); if (memo) q.set("text", memo);
    }
    const qs = q.toString().replace(/\+/g, "%20");
    tonLink = `ton://transfer/${addr}?${qs}`; tkLink = `https://app.tonkeeper.com/transfer/${addr}?${qs}`;
    $("pay-ton").href = tonLink; $("pay-tonkeeper").href = tkLink;
    $("pay-ton").textContent = (currency === "USDT" ? "💵 " : "💎 ") + t("openWallet") + ` · ${a} ${currency}`;
    $("manual-addr").textContent = addr; $("manual-amount").textContent = `${a} ${currency}`; $("manual-memo").textContent = memo || "—";
    $("manual-hint").textContent = t("manualHint", { cur: currency });
    try {
      const qr = qrcode(0, "L"); qr.addData(tonLink); qr.make();
      $("qr").innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      const svg = $("qr").querySelector("svg"); if (svg) { svg.setAttribute("width", "168"); svg.setAttribute("height", "168"); }
    } catch (err) { $("qr").textContent = "QR error"; }
    document.querySelectorAll(".tier").forEach((el, i) => el.classList.toggle("active", tr && CATALOG.tiers[i] && CATALOG.tiers[i].id === tr.id));
  }
  function initDonate() {
    $("wallet-warning").hidden = !placeholderWallet();
    if (!CFG.ACCEPT_TON) $("cur-ton").hidden = true;
    document.querySelectorAll(".cur").forEach((b) => b.onclick = () => {
      if (b.dataset.cur === currency) return;
      const usd = amountUSD(); currency = b.dataset.cur;
      document.querySelectorAll(".cur").forEach((x) => x.classList.toggle("active", x === b));
      $("amount").value = currency === "TON" ? Math.ceil((usd / CFG.TON_USD_RATE) * 10) / 10 : Math.round(usd * 100) / 100;
      renderTiers(); updatePay();
    });
    $("item-select").onchange = () => {
      const d = CATALOG.items[$("item-select").value];
      if (d) { const tr = CATALOG.tiers.find((x) => x.id === d.tier); if (tr && amountUSD() < tr.min_usd) $("amount").value = usdToCur(tr.min_usd); }
      updatePay();
    };
    $("amount").oninput = updatePay; $("comment").oninput = updatePay;
    document.querySelectorAll("[data-copy]").forEach((b) => b.onclick = async () => {
      const txt = $(b.dataset.copy).textContent.replace(/ (USDT|TON)$/, "");
      try { await navigator.clipboard.writeText(txt); } catch { const ta = document.createElement("textarea"); ta.value = txt; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove(); }
      const old = b.textContent; b.textContent = t("copied"); setTimeout(() => (b.textContent = t("copy")), 1500);
    });
  }

  // ---------- настройки / язык ----------
  function initSettings() {
    const btn = $("settings-btn"), panel = $("settings");
    btn.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; btn.setAttribute("aria-expanded", String(!panel.hidden)); };
    document.addEventListener("click", (e) => { if (!panel.hidden && !panel.contains(e.target)) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); } });
    document.querySelectorAll('input[name="lang"]').forEach((r) => { r.checked = r.value === I.pref(); r.onchange = () => { I.setPref(r.value); renderAllText(); }; });
  }
  function renderAllText() {
    I.apply();
    document.title = `${charName()} — ${t("subtitle")}`;
    $("title").textContent = charName();
    renderItemSelect(); renderTiers(); updatePay(); renderFeed(); renderStatus(); renderStats();
  }

  // ---------- загрузка данных ----------
  async function getJSON(path) { const r = await fetch(path + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(path + " " + r.status); return r.json(); }
  async function loadData(first) {
    try {
      const [cat, world, feed] = await Promise.all([getJSON("data/catalog.json"), getJSON("data/world.json"), getJSON("data/feed.json")]);
      CATALOG = cat; WORLD = world; FEED = Array.isArray(feed) ? feed : [];
    } catch (e) { console.warn("data load failed", e); if (first) { CATALOG = CATALOG || { tiers: [], items: {} }; } }
    const txs = new Set((WORLD.items || []).map((i) => i.tx));
    if (knownTx && !first) for (const tx of txs) if (!knownTx.has(tx)) for (let k = 0; k < 8; k++) effects.push({ x: 110 + Math.random() * 40, y: 100 + Math.random() * 20, t: Math.random() * 0.6 });
    knownTx = txs;
    layout = computeLayout(); syncPets();
    if (first) { const blk = currentBlock(nowMinutes()); const tg = heroTarget(blk); hero.x = tg.x; hero.b = tg.b; }
    renderAllText();
  }

  // ---------- старт ----------
  initSettings(); initDonate();
  layout = computeLayout();
  loadData(true).then(() => requestAnimationFrame(frame));
  setInterval(renderStatus, 1000);
  setInterval(() => loadData(false), CFG.REFRESH_MS);
  setInterval(renderFeed, 60000);
})();

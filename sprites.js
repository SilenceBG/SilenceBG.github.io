// Простые пиксельные спрайты: строки = ряды пикселей, символ = цвет из палитры, "." = прозрачный.
(function () {
  const PAL = {
    k: "#1a1326", h: "#5b3a29", H: "#7a5038", s: "#ffd2a1", S: "#e8a978", e: "#1a1326",
    r: "#ff7a9a", b: "#4fb3ff", B: "#2f7fc4", p: "#3b3561", P: "#2a2547", w: "#ffffff",
    g: "#5ccf6a", G: "#2f8f45", o: "#c97a3d", O: "#8a4f24", y: "#ffcc4d", Y: "#d99a1e",
    c: "#f2a65a", C: "#b86a2a", d: "#d8b48a", D: "#9a7350", n: "#9a9ab8", N: "#5c5c7a",
    t: "#4fd1c5", T: "#2a8f88", m: "#efe7ff", R: "#c43d5a", z: "#2b2440", u: "#7fd6ff",
  };

  const MAPS = {
    hero: [
      "..kkkkkk..",
      ".khhhhhhk.",
      "khhHhhhhhk",
      "khsssssshk",
      "kssessessk",
      "ksrssssrsk",
      ".kssskssk.",
      "..kbbbbk..",
      ".kbbbbbbk.",
      "kbbbbbbbbk",
      "ksbbbbbbsk",
      "ksbBBBBbsk",
      ".kppppppk.",
      ".kppkkppk.",
      ".kpk..kpk.",
      ".kkk..kkk.",
    ],
    hero2: [
      "..kkkkkk..",
      ".khhhhhhk.",
      "khhHhhhhhk",
      "khsssssshk",
      "kssessessk",
      "ksrssssrsk",
      ".kssskssk.",
      "..kbbbbk..",
      ".kbbbbbbk.",
      "kbbbbbbbbk",
      "ksbbbbbbsk",
      "ksbBBBBbsk",
      ".kppppppk.",
      ".kppkppk..",
      "..kpkkpk..",
      "..kkk.kkk.",
    ],
    heroBack: [
      "..kkkkkk..",
      ".khhhhhhk.",
      "khhhhhhhhk",
      "khhhhhhhhk",
      "khhhhhhhhk",
      "khhhhhhhhk",
      ".khhhhhhk.",
      "..kbbbbk..",
      ".kbbbbbbk.",
      "kbbbbbbbbk",
      "ksbbbbbbsk",
      "ksbBBBBbsk",
      ".kppppppk.",
      ".kppkkppk.",
      ".kpk..kpk.",
      ".kkk..kkk.",
    ],
    cat: [
      "k.k.......",
      "kckk......",
      "kcekk...kk",
      "kccck...kc",
      ".kkckkkkkc",
      "..kcccccck",
      "..kcCcCcck",
      "..kk.kk.kk",
    ],
    cat2: [
      "k.k.......",
      "kckk.....k",
      "kcekk...kc",
      "kccck...kc",
      ".kkckkkkkk",
      "..kcccccck",
      "..kcCcCcck",
      "...kk.kk.k",
    ],
    dog: [
      ".kk.........",
      "kDdk........",
      "kddddk......",
      "kdedddk...k.",
      "kkddddk..kd.",
      ".kkdddkkkkd.",
      "...kddddddk.",
      "...kdDdDddk.",
      "...kk.kk.kk.",
    ],
    dog2: [
      ".kk.........",
      "kDdk......k.",
      "kddddk...kd.",
      "kdedddk..kd.",
      "kkddddk..kd.",
      ".kkdddkkkkk.",
      "...kddddddk.",
      "...kdDdDddk.",
      "....kk.kk.k.",
    ],
    plant: [
      "...kk.kk..",
      "..kgGkgGk.",
      ".kgggkgggk",
      "kgGgggGgk.",
      ".kggGggggk",
      "..kgggGgk.",
      "...kGGk...",
      "...kOOk...",
      "..kooook..",
      "..kooook..",
      "...kOOk...",
    ],
    mug: [
      ".m.m..",
      "m.m...",
      "kkkkk.",
      "kRRRkk",
      "kRwRk.k",
      "kRRRkk",
      ".kkk..",
    ],
    lamp: [
      "..kkkkk..",
      ".kyyyyyk.",
      "kyyyyyyyk",
      "kkkkkkkkk",
      "....k....",
      "....k....",
      "....k....",
      "....k....",
      "....k....",
      "....k....",
      "....k....",
      "....k....",
      "....k....",
      "....k....",
      "..kkkkk..",
    ],
    guitar: [
      "...kk",
      "...ok",
      "...k.",
      "...k.",
      "..kk.",
      ".kook",
      "kooook",
      "koOOok",
      ".kook.",
      "kooook",
      "kooOok",
      "koooook",
      ".kooook",
      "..kkkk.",
    ],
    fishL: [".yy.", "yyyky", ".yy."],
    cookie: [".kkkk.", "kOooOk", "koOook", "kooOok", "kOoook", ".kkkk."],
    pcoin: [".kkkk.", "kyyyyk", "kyYkyk", "kykYyk", "kyyyyk", ".kkkk."],
    st_star: ["...k...", "..kyk..", "kkkyykk", "kyyyyyk", ".kyyyk.", ".kyky k", "kk...kk"],
    st_heart: [".kk.kk.", "krrkrrk", "krrrrrk", "krrrrrk", ".krrrk.", "..krk..", "...k..."],
    st_flower: [".k.k.k.", "krkrkrk", ".krykrk", "krryrrk", ".krrrk.", "...g...", "..ggg.."],
    st_ufo: ["...kkk...", "..kuuuk..", ".kkkkkkk.", "knnnnnnnk", ".kyky ky.", "..y.y.y.."],
    st_rainbow: ["..rrrrr..", ".ryyyyyr.", "rygggggyr", "ygbbbbbgy", "gb.....bg", "b.......b"],
    st_pizza: ["kkkkkkk", "kyRyyRk", ".kyyyk.", ".kRyRk.", "..kyk..", "..kyk..", "...k..."],
    heart: [".r.r.", "rrrrr", "rrrrr", ".rrr.", "..r.."],
  };

  function build(map) {
    const w = Math.max(...map.map((r) => r.length));
    const h = map.length;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const x = c.getContext("2d");
    map.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i];
        if (ch === "." || !PAL[ch]) continue;
        x.fillStyle = PAL[ch];
        x.fillRect(i, j, 1, 1);
      }
    });
    return c;
  }

  function flip(src) {
    const c = document.createElement("canvas");
    c.width = src.width; c.height = src.height;
    const x = c.getContext("2d");
    x.translate(src.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0);
    return c;
  }

  const SPR = {};
  for (const k in MAPS) { SPR[k] = build(MAPS[k]); SPR[k + "_f"] = flip(SPR[k]); }
  window.SPRITES = SPR;
  // Перекраска футболки героя (локальная покупка за P$)
  window.recolorHero = function (main, shade) {
    const P2 = Object.assign({}, PAL, { b: main, B: shade });
    const save = Object.assign({}, PAL);
    Object.assign(PAL, P2);
    for (const k of ["hero", "hero2", "heroBack"]) { SPR[k] = build(MAPS[k]); SPR[k + "_f"] = flip(SPR[k]); }
    Object.assign(PAL, save);
  };
  window.PAL = PAL;
})();

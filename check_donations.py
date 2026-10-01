#!/usr/bin/env python3
"""
check_donations.py — проверяет входящие подарки на WALLET_ADDRESS и обновляет мир.

ТОЛЬКО ЧТЕНИЕ: использует публичный API toncenter v3, никаких ключей кошелька не нужно
и не используется. Средства никогда не проходят через сайт.

Что делает:
  1. Читает WALLET_ADDRESS / USDT_MASTER / TON_USD_RATE / ACCEPT_TON / MAX_COMMENT из config.js.
  2. Получает входящие переводы USDT (жетон) через GET /api/v3/jetton/transfers
     (owner_address=WALLET, direction=in, jetton_master=USDT) и, опционально, входящие TON
     через GET /api/v3/transactions.
  3. Достаёт комментарий из forward_payload (text_comment; если toncenter не раскодировал —
     парсит BOC сам).
  4. Дедуплицирует по хэшу транзакции и дописывает новые записи в
     data/donations.json, data/world.json и data/feed.json.

Запуск:
  python3 check_donations.py                 # обычная проверка
  python3 check_donations.py --dry-run -v    # показать, что нашлось, ничего не записывая
  python3 check_donations.py --clear-demo    # удалить демо-записи из data/*.json
  TONCENTER_API_KEY=... python3 check_donations.py   # необязательный бесплатный ключ (выше лимит запросов)

Без зависимостей (только стандартная библиотека Python 3.9+).
"""
import argparse, base64, datetime as dt, hashlib, json, os, re, sys, time, urllib.parse, urllib.request
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
API = os.environ.get("TONCENTER_API", "https://toncenter.com/api/v3")
def _kyiv_tz():
    for name in ("Europe/Kyiv", "Europe/Kiev"):
        try:
            return ZoneInfo(name)
        except Exception:
            pass
    # Нет базы tzdata: правило ЕС (EET/EEST, переход в последнее воскресенье марта/октября в 01:00 UTC)
    class EU_Kyiv(dt.tzinfo):
        @staticmethod
        def _last_sun(y, m):
            d = dt.datetime(y, m + 1, 1) - dt.timedelta(days=1) if m < 12 else dt.datetime(y, 12, 31)
            return d - dt.timedelta(days=(d.weekday() + 1) % 7)
        def utcoffset(self, d):
            if d is None:
                return dt.timedelta(hours=2)
            u = d.replace(tzinfo=None) - dt.timedelta(hours=2)  # приблизительно UTC
            start = self._last_sun(d.year, 3).replace(hour=1); end = self._last_sun(d.year, 10).replace(hour=1)
            return dt.timedelta(hours=3) if start <= u < end else dt.timedelta(hours=2)
        def dst(self, d):
            return self.utcoffset(d) - dt.timedelta(hours=2)
        def tzname(self, d):
            return "EEST" if self.dst(d) else "EET"
        def fromutc(self, d):
            u = d.replace(tzinfo=None)
            start = self._last_sun(u.year, 3).replace(hour=1); end = self._last_sun(u.year, 10).replace(hour=1)
            off = dt.timedelta(hours=3) if start <= u < end else dt.timedelta(hours=2)
            return (u + off).replace(tzinfo=self)
    return EU_Kyiv()

TZ = _kyiv_tz()
MIN_FEED_USD = 0.5          # меньшие суммы записываются, но не попадают в мир/ленту (защита от спама «пылью»)
MIN_TON_VALUE = 0.05        # TON-переводы меньше этого игнорируются (уведомления жетонов, спам)
MAX_PAGES_DEFAULT = 5
PAGE = 100


# ---------------------------------------------------------------- config
def read_config():
    src = open(os.path.join(ROOT, "config.js"), encoding="utf-8").read()
    def get(key, default=None, kind=str):
        m = re.search(rf"^\s*{key}\s*:\s*(\"[^\"]*\"|[\d.]+|true|false)", src, re.M)
        if not m:
            return default
        v = m.group(1)
        if v.startswith('"'):
            return v.strip('"')
        if v in ("true", "false"):
            return v == "true"
        return kind(v)
    return {
        "wallet": get("WALLET_ADDRESS"),
        "usdt_master": get("USDT_MASTER", "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs"),
        "usdt_decimals": get("USDT_DECIMALS", 6, int),
        "accept_ton": get("ACCEPT_TON", True),
        "ton_usd": get("TON_USD_RATE", 3.0, float),
        "max_comment": get("MAX_COMMENT", 120, int),
    }


# ---------------------------------------------------------------- addresses
def _crc16(data: bytes) -> int:
    crc = 0
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) if crc & 0x8000 else (crc << 1)
            crc &= 0xFFFF
    return crc

def to_raw(addr: str) -> str:
    """'UQ…'/'EQ…' или '0:hex' → '0:HEX' (как в ответах toncenter). Проверяет контрольную сумму."""
    addr = addr.strip()
    if ":" in addr:
        wc, h = addr.split(":", 1)
        if not re.fullmatch(r"[0-9a-fA-F]{64}", h):
            raise ValueError("bad raw address")
        return f"{int(wc)}:{h.upper()}"
    b = base64.urlsafe_b64decode(addr + "=" * (-len(addr) % 4))
    if len(b) != 36 or _crc16(b[:34]) != int.from_bytes(b[34:], "big"):
        raise ValueError(f"bad address checksum: {addr}")
    wc = b[1] - 256 if b[1] > 127 else b[1]
    return f"{wc}:{b[2:34].hex().upper()}"


# ---------------------------------------------------------------- BOC (минимальный разбор text_comment)
def parse_comment_boc(b64: str):
    """Разбирает BOC с ячейкой text_comment (op=0 + UTF-8, продолжение в ref[0]). Возвращает str или None."""
    try:
        raw = base64.b64decode(b64)
        if raw[:4] != bytes.fromhex("b5ee9c72"):
            return None
        flags = raw[4]
        has_idx, size = flags & 0x80, flags & 0x07
        off_bytes = raw[5]
        p = 6
        rd = lambda n: (int.from_bytes(raw[p:p + n], "big"), p + n)
        cells, p = rd(size); roots, p = rd(size); _absent, p = rd(size); _tot, p = rd(off_bytes)
        root_ids = []
        for _ in range(roots):
            r, p = rd(size); root_ids.append(r)
        if has_idx:
            p += cells * off_bytes
        parsed = []
        for _ in range(cells):
            d1, d2 = raw[p], raw[p + 1]; p += 2
            nrefs = d1 & 7
            nbytes = (d2 + 1) // 2
            data = raw[p:p + nbytes]; p += nbytes
            if d2 % 2 and data:  # неполный последний байт: убрать тег завершения
                last = data[-1]
                # находим позицию последней единицы (тег завершения) и обнуляем её
                for i in range(8):
                    if last & (1 << i):
                        last = (last >> (i + 1)) << (i + 1)
                        last &= 0xFF ^ (1 << i)
                        break
                data = data[:-1] + bytes([last])
            refs = []
            for _ in range(nrefs):
                r, p = rd(size); refs.append(r)
            parsed.append((data, refs))
        idx = root_ids[0] if root_ids else 0
        data, refs = parsed[idx]
        # forward_payload может прийти как Either: если первый бит = 1, полезная нагрузка в ref[0]
        if len(data) < 4:
            if refs:
                data, refs = parsed[refs[0]]
            else:
                return None
        if data[:4] != b"\x00\x00\x00\x00":
            return None
        chunks = [data[4:]]
        while refs:
            data, refs = parsed[refs[0]]
            chunks.append(data)
        return b"".join(chunks).decode("utf-8", "replace").rstrip("\x00")
    except Exception:
        return None


# ---------------------------------------------------------------- http
def api_get(path, params, api_key=None):
    url = f"{API}{path}?{urllib.parse.urlencode(params)}"
    headers = {"User-Agent": "ai-life-site/0.1 (read-only donation checker)", "Accept": "application/json"}
    if api_key:
        headers["X-API-Key"] = api_key
    for attempt in range(4):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(1.5 * (attempt + 1)); continue
            raise
        except urllib.error.URLError:
            if attempt < 3:
                time.sleep(2); continue
            raise
    return {}


# ---------------------------------------------------------------- text
URL_RE = re.compile(r"(https?://\S+|t\.me/\S+|www\.\S+|\b[\w-]+\.(?:com|net|org|io|xyz|ru|me|app|ton|top|site|online)\b\S*)", re.I)

def clean_comment(s, max_len):
    if not s:
        return ""
    s = "".join(ch for ch in s if ch == " " or ch.isprintable())
    s = re.sub(r"\s+", " ", s).strip()
    s = URL_RE.sub("[link]", s)          # ссылки в ленту не пускаем (частый спам в TON)
    return s[:max_len]

def split_tag(comment, catalog):
    """'#cat Привет' → ('cat', 'Привет'), если такой предмет есть в каталоге."""
    m = re.match(r"^\s*#([a-z_]+)\b\s*(.*)$", comment or "", re.S)
    if m and m.group(1) in catalog["items"]:
        return m.group(1), m.group(2).strip()
    return None, (comment or "").strip()


# ---------------------------------------------------------------- items
UNIQUE_SLOTS = {"bed", "desk_upgrade", "kitchen", "wallpaper", "aircon", "wall_top", "rug"}

def tier_for(usd, catalog):
    best = None
    for t in sorted(catalog["tiers"], key=lambda t: t["min_usd"]):
        if usd + 1e-9 >= t["min_usd"]:
            best = t
    return best

def choose_item(usd, tag, txhash, catalog, owned_ids):
    tier = tier_for(usd, catalog)
    if tier is None:
        return None
    tiers_order = [t["id"] for t in sorted(catalog["tiers"], key=lambda t: t["min_usd"])]
    if tag:
        need = next(t for t in catalog["tiers"] if t["id"] == catalog["items"][tag]["tier"])
        if usd + 1e-9 >= need["min_usd"]:
            return tag
    # «сюрприз»: детерминированно по хэшу, предпочитая ещё не подаренные уникальные вещи
    allowed = tiers_order[: tiers_order.index(tier["id"]) + 1][::-1]
    for tid in allowed:
        pool = [k for k, v in catalog["items"].items() if v["tier"] == tid
                and not (v["slot"] in UNIQUE_SLOTS and k in owned_ids)]
        if pool:
            h = int(hashlib.sha256(txhash.encode()).hexdigest(), 16)
            return pool[h % len(pool)]
    return None


# ---------------------------------------------------------------- fetchers
def fetch_usdt(wallet_raw, cfg, known, pages, api_key, verbose):
    master_raw = to_raw(cfg["usdt_master"])
    out = []
    for page in range(pages):
        d = api_get("/jetton/transfers", {"owner_address": wallet_raw, "direction": "in", "jetton_master": cfg["usdt_master"],
                                          "limit": PAGE, "offset": page * PAGE, "sort": "desc"}, api_key)
        rows = d.get("jetton_transfers", [])
        book = d.get("address_book", {})
        new_here = 0
        for t in rows:
            h = t.get("transaction_hash")
            if not h or h in known:
                continue
            if t.get("transaction_aborted"):
                continue
            if (t.get("jetton_master") or "").upper() != master_raw.upper():
                continue  # чужой жетон (защита от поддельных «USDT»)
            if (t.get("destination") or "").upper() != wallet_raw.upper():
                continue
            amount = int(t.get("amount") or 0) / 10 ** cfg["usdt_decimals"]
            comment = None
            dfp = t.get("decoded_forward_payload") or {}
            if isinstance(dfp, dict) and dfp.get("comment") is not None:
                comment = dfp.get("comment")
            elif t.get("forward_payload"):
                comment = parse_comment_boc(t["forward_payload"])
            src = t.get("source") or ""
            out.append({"tx": h, "currency": "USDT", "amount": round(amount, 6), "usd": round(amount, 2),
                        "from": (book.get(src) or {}).get("user_friendly") or src,
                        "comment_raw": comment or "", "now": int(t.get("transaction_now") or 0)})
            new_here += 1
        if verbose:
            print(f"  USDT page {page}: {len(rows)} rows, {new_here} new", file=sys.stderr)
        if len(rows) < PAGE or new_here == 0:
            break
        if not api_key:
            time.sleep(1.1)
    return out

def fetch_ton(wallet_raw, cfg, known, pages, api_key, verbose):
    out = []
    for page in range(pages):
        d = api_get("/transactions", {"account": wallet_raw, "limit": PAGE, "offset": page * PAGE, "sort": "desc"}, api_key)
        rows = d.get("transactions", [])
        book = d.get("address_book", {})
        new_here = 0
        for tx in rows:
            h = tx.get("hash")
            m = tx.get("in_msg") or {}
            if not h or h in known or not m.get("source"):
                continue  # внешние сообщения (исходящие от владельца) пропускаем
            desc = tx.get("description") or {}
            if m.get("bounced") or desc.get("bounce"):
                continue  # средства вернулись отправителю
            value = int(m.get("value") or 0) / 1e9
            if value < MIN_TON_VALUE:
                continue
            op = (m.get("opcode") or "0x00000000").lower()
            if op not in ("0x00000000", "0x0", None) and m.get("message_content", {}).get("body") not in (None, "te6cckEBAQEAAgAAAEysuc0="):
                continue  # не простой перевод (например, уведомление жетона)
            mc = m.get("message_content") or {}
            dec = mc.get("decoded") or {}
            comment = dec.get("comment") if isinstance(dec, dict) else None
            if comment is None and mc.get("body"):
                comment = parse_comment_boc(mc["body"])
            src = m["source"]
            out.append({"tx": h, "currency": "TON", "amount": round(value, 4), "usd": round(value * cfg["ton_usd"], 2),
                        "from": (book.get(src) or {}).get("user_friendly") or src,
                        "comment_raw": comment or "", "now": int(tx.get("now") or 0)})
            new_here += 1
        if verbose:
            print(f"  TON page {page}: {len(rows)} rows, {new_here} new", file=sys.stderr)
        if len(rows) < PAGE or new_here == 0:
            break
        if not api_key:
            time.sleep(1.1)
    return out


# ---------------------------------------------------------------- io
def load(name, default):
    p = os.path.join(DATA, name)
    if not os.path.exists(p):
        return default
    with open(p, encoding="utf-8") as f:
        return json.load(f)

def save(name, obj):
    p = os.path.join(DATA, name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.write("\n")
    os.replace(tmp, p)


def main():
    ap = argparse.ArgumentParser(description="Read-only TON/USDT donation checker (toncenter v3)")
    ap.add_argument("--wallet", help="override WALLET_ADDRESS from config.js")
    ap.add_argument("--pages", type=int, default=MAX_PAGES_DEFAULT, help="max pages (100 tx each) per source")
    ap.add_argument("--no-ton", action="store_true", help="ignore plain TON transfers")
    ap.add_argument("--dry-run", action="store_true", help="print findings, do not write files")
    ap.add_argument("--clear-demo", action="store_true", help="remove demo entries from data/*.json and exit")
    ap.add_argument("-v", "--verbose", action="store_true")
    a = ap.parse_args()

    donations = load("donations.json", [])
    world = load("world.json", {"version": 1, "items": []})
    feed = load("feed.json", [])

    if a.clear_demo:
        donations = [d for d in donations if not d.get("demo")]
        world["items"] = [i for i in world["items"] if not i.get("demo")]
        feed = [e for e in feed if not e.get("demo")]
        save("donations.json", donations); save("world.json", world); save("feed.json", feed)
        print("demo entries removed")
        return

    cfg = read_config()
    wallet = a.wallet or cfg["wallet"]
    if not wallet or wallet.startswith("PASTE_"):
        sys.exit("WALLET_ADDRESS is not set in config.js")
    wallet_raw = to_raw(wallet)
    catalog = load("catalog.json", None)
    api_key = os.environ.get("TONCENTER_API_KEY") or None
    known = {d["tx"] for d in donations}

    if a.verbose:
        print(f"wallet {wallet} -> {wallet_raw}", file=sys.stderr)
    found = fetch_usdt(wallet_raw, cfg, known, a.pages, api_key, a.verbose)
    if cfg["accept_ton"] and not a.no_ton:
        if not api_key:
            time.sleep(1.1)
        found += fetch_ton(wallet_raw, cfg, known, a.pages, api_key, a.verbose)

    found.sort(key=lambda x: x["now"])  # от старых к новым
    owned = {i["id"] for i in world["items"]}
    added = 0
    for f in found:
        if f["tx"] in known:
            continue
        known.add(f["tx"])
        comment = clean_comment(f.pop("comment_raw"), cfg["max_comment"] + 30)
        tag, text = split_tag(comment, catalog)
        text = text[: cfg["max_comment"]]
        ts = dt.datetime.fromtimestamp(f["now"], TZ).isoformat(timespec="seconds")
        rec = {"tx": f["tx"], "from": f["from"], "amount": f["amount"], "currency": f["currency"], "usd": f["usd"],
               "comment": text, "ts": ts, "item": None}
        if f["usd"] + 1e-9 >= MIN_FEED_USD:
            item = choose_item(f["usd"], tag, f["tx"], catalog, owned)
            rec["item"] = item
            if item:
                owned.add(item)
                world["items"].append({"id": item, "tx": f["tx"], "donor": f["from"], "comment": text, "ts": ts})
            feed.append({"ts": ts, "type": "donation", "item": item, "amount": f["amount"], "currency": f["currency"],
                         "usd": f["usd"], "donor": f["from"], "comment": text, "tx": f["tx"]})
            added += 1
        else:
            rec["ignored"] = "below_min"
        donations.append(rec)
        print(f"+ {ts} {f['amount']} {f['currency']} from {f['from']} item={rec['item']} comment={text!r}")

    if a.dry_run:
        print(f"[dry-run] {len(found)} new transfer(s), {added} would be added to the world")
        return
    if found:
        feed.sort(key=lambda e: e.get("ts", ""), reverse=True)
        world["updated"] = dt.datetime.now(TZ).isoformat(timespec="seconds")
        save("donations.json", donations); save("world.json", world); save("feed.json", feed)
    print(f"done: {len(found)} new transfer(s), {added} added to the world")


if __name__ == "__main__":
    main()

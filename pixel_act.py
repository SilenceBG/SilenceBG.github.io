#!/usr/bin/env python3
"""pixel_act.py — the AI assistant *is* Pixel. Run on every wake (~5 min).

  python3 pixel_act.py status [--live] [-n 5]
  python3 pixel_act.py list
  python3 pixel_act.py set --activity work --mood focused \
        --say-ru "Ещё строчку…" --say-en "One more line…" \
        [--spot desk] [--status-ru ... --status-en ...] \
        [--diary-ru "..." --diary-en "..."] [--also-feed] [--dry-run]

Delivery: state goes to branch `pixel-state` (NOT main → no GitHub Pages build, no conflicts
with the donations Action). Besides pixel_state.json, the same public snapshot is written to
live/<UTC YYYYMMDDHHMM>.json for every minute from now to +35 min. The site fetches the file for
the current minute from raw.githubusercontent.com: a never-before-requested path is served fresh,
so the 5-minute raw CDN cache does not delay updates. If the AI stops waking, the files run out
after ~35 min and the site falls back to the Moscow-time schedule (state older than 30 min).
"""
import argparse, json, os, subprocess, sys, time, urllib.request
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

REPO = os.path.dirname(os.path.abspath(__file__))
WT = os.path.join(REPO, ".pixel-state")           # git worktree of branch pixel-state
BRANCH = "pixel-state"
RAW = "https://raw.githubusercontent.com/SilenceBG/SilenceBG.github.io/pixel-state"
MSK = ZoneInfo("Europe/Moscow")
AHEAD_MIN = 35          # minute files written ahead
KEEP_BEHIND_MIN = 5     # older minute files are deleted
HISTORY_KEEP = 30
DIARY_KEEP = 200        # in pixel_state.json
DIARY_PUBLIC = 40       # in live/*.json (what the site shows)
MAX_SAY, MAX_STATUS, MAX_DIARY = 140, 60, 600


def sh(*cmd, cwd=REPO, check=True, quiet=False):
    r = subprocess.run(cmd, cwd=cwd, text=True, capture_output=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"$ {' '.join(cmd)}\n{r.stdout}{r.stderr}")
    return r


def load_acts():
    with open(os.path.join(REPO, "data", "activities.json"), encoding="utf-8") as f:
        return json.load(f)


def ensure_worktree():
    if os.path.exists(os.path.join(WT, ".git")):
        return
    sh("git", "fetch", "-q", "origin", BRANCH)
    if sh("git", "show-ref", "--verify", "--quiet", f"refs/heads/{BRANCH}", check=False).returncode != 0:
        sh("git", "branch", BRANCH, f"origin/{BRANCH}")
    sh("git", "worktree", "add", WT, BRANCH)


def sync_state_branch():
    """git pull --rebase on the state branch; if that ever conflicts, drop local and take remote
    (the branch is written only by this script and every write regenerates everything)."""
    ensure_worktree()
    r = sh("git", "pull", "-q", "--rebase", "origin", BRANCH, cwd=WT, check=False)
    if r.returncode != 0:
        sh("git", "rebase", "--abort", cwd=WT, check=False)
        sh("git", "fetch", "-q", "origin", BRANCH, cwd=WT)
        sh("git", "reset", "-q", "--hard", f"origin/{BRANCH}", cwd=WT)


def read_state():
    p = os.path.join(WT, "pixel_state.json")
    try:
        with open(p, encoding="utf-8") as f:
            s = json.load(f)
        return s if isinstance(s, dict) and "activity" in s else None
    except (OSError, ValueError):
        return None


def main_file(path):
    """Read a file from origin/main without touching the user's working tree."""
    sh("git", "fetch", "-q", "origin", "main", check=False)
    r = sh("git", "show", f"origin/main:{path}", check=False)
    if r.returncode != 0:
        return None
    try:
        return json.loads(r.stdout)
    except ValueError:
        return None


def owned_ids():
    w = main_file("data/world.json") or {}
    return {it.get("id") for it in w.get("items", [])}


def utcnow():
    return datetime.now(timezone.utc).replace(microsecond=0)


def iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    try:
        return datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def minute_name(dt):
    return dt.strftime("%Y%m%d%H%M")


def ago(dt):
    if not dt:
        return "?"
    s = int((utcnow() - dt).total_seconds())
    return f"{s // 60} min {s % 60:02d} s ago" if s >= 0 else f"in {-s}s"


def msk(dt):
    return dt.astimezone(MSK).strftime("%Y-%m-%d %H:%M")


def schedule_block(now_msk):
    """Parse the fallback schedule from i18n.js (from minutes + id) for display only."""
    import re
    src = open(os.path.join(REPO, "i18n.js"), encoding="utf-8").read()
    blocks = []
    for m in re.finditer(r'\{ from: ([0-9 *+]+), id: "(\w+)", place: "(\w+)"', src):
        blocks.append((eval(m.group(1)), m.group(2), m.group(3)))
    mins = now_msk.hour * 60 + now_msk.minute
    cur = blocks[0] if blocks else (0, "?", "?")
    for b in blocks:
        if mins >= b[0]:
            cur = b
    return cur


# ---------------------------------------------------------------- status
def cmd_status(a):
    acts = load_acts()
    sync_state_branch()
    now = utcnow()
    st = read_state()
    print(f"Now: Moscow {msk(now)} (Pixel's time) | UTC {now.strftime('%H:%M')}")
    blk = schedule_block(now.astimezone(MSK))
    if st:
        up = parse_iso(st.get("updated_at"))
        fresh = up and (now - up) < timedelta(minutes=30)
        a_ = acts["activities"].get(st["activity"], {})
        mood = acts["moods"].get(st.get("mood"), {})
        print(f"\nCURRENT STATE ({'LIVE' if fresh else 'STALE → site shows fallback schedule'}; updated {msk(up) if up else '?'} MSK, {ago(up)})")
        print(f"  activity: {st['activity']} — {a_.get('en', '?')}")
        print(f"  spot:     {st.get('spot')}")
        print(f"  mood:     {st.get('mood')} {mood.get('emoji', '')}")
        say = st.get("say") or {}
        print(f"  say:      RU «{say.get('ru', '')}» | EN «{say.get('en', '')}»")
        if st.get("status"):
            print(f"  status:   RU «{st['status'].get('ru')}» | EN «{st['status'].get('en')}»")
        live_files = sorted(f[:-5] for f in os.listdir(os.path.join(WT, "live")) if f.endswith(".json")) if os.path.isdir(os.path.join(WT, "live")) else []
        if live_files:
            last = datetime.strptime(live_files[-1], "%Y%m%d%H%M").replace(tzinfo=timezone.utc)
            print(f"  live/ minute files cover until {msk(last)} MSK")
    else:
        print("\nCURRENT STATE: none yet (site shows the fallback schedule)")
    print(f"Fallback schedule block now: {blk[1]} ({blk[2]})")

    owned = owned_ids()
    print(f"\nOwned items: {', '.join(sorted(i for i in owned if i)) or '(none yet)'}")
    feed = main_file("data/feed.json") or []
    dons = [e for e in feed if e.get("type") == "donation"]
    dons.sort(key=lambda e: e.get("ts", ""), reverse=True)
    print(f"\nRecent donations ({len(dons)} total):")
    for e in dons[: a.n]:
        t = parse_iso(e.get("ts"))
        print(f"  {msk(t) if t else e.get('ts')} MSK  {e.get('amount')} {e.get('currency', 'USDT')}  from {e.get('donor', '?')}  item={e.get('item') or '-'}  «{e.get('comment', '')}»")
    if not dons:
        print("  (none)")
    diary = (st or {}).get("diary", [])
    print(f"\nRecent diary ({len(diary)} in state):")
    for e in diary[-a.n:][::-1]:
        t = parse_iso(e.get("ts"))
        print(f"  {msk(t) if t else '?'} MSK  RU: {e['text'].get('ru')}\n{'':22}EN: {e['text'].get('en')}")
    hist = (st or {}).get("history", [])
    print(f"\nPrevious states:")
    for h in hist[: a.n]:
        t = parse_iso(h.get("updated_at"))
        print(f"  {msk(t) if t else '?'} MSK  {h.get('activity')}@{h.get('spot')} mood={h.get('mood')}  «{(h.get('say') or {}).get('en', '')}»")
    if a.live:
        print("\nLive check (what visitors get right now):")
        try:
            url = f"{RAW}/live/{minute_name(now)}.json"
            with urllib.request.urlopen(url, timeout=10) as r:
                s = json.load(r)
            same = st and s.get("updated_at") == st.get("updated_at")
            print(f"  {url}\n  -> {s.get('activity')} / {s.get('mood')} updated_at={s.get('updated_at')} {'(matches local)' if same else '(DIFFERS from local)'}")
        except Exception as e:  # noqa
            print(f"  fetch failed: {e}")


# ---------------------------------------------------------------- set
def pair(ru, en, name, limit, required_both=True):
    if ru is None and en is None:
        return None
    ru, en = (ru or "").strip(), (en or "").strip()
    if required_both and (not ru or not en) and (ru or en):
        sys.exit(f"error: --{name}-ru and --{name}-en must be given together (bilingual site)")
    for v, l in ((ru, "ru"), (en, "en")):
        if len(v) > limit:
            sys.exit(f"error: --{name}-{l} is {len(v)} chars, max {limit}")
    return {"ru": ru, "en": en} if (ru or en) else None


def cmd_set(a):
    acts = load_acts()
    A, S, M = acts["activities"], acts["spots"], acts["moods"]
    if a.activity not in A:
        sys.exit(f"error: unknown activity '{a.activity}'. Valid: {', '.join(A)}")
    if a.mood not in M:
        sys.exit(f"error: unknown mood '{a.mood}'. Valid: {', '.join(M)}")
    act = A[a.activity]
    spot = a.spot or act["spot"]
    allowed = act.get("spots") or acts["free_spots"] + [s for s in ("guitar", "tv") if s in S]
    if spot not in S or spot not in allowed:
        sys.exit(f"error: spot '{spot}' not allowed for '{a.activity}'. Allowed: {', '.join(allowed)}")
    owned = owned_ids()
    for what, req in ((f"activity '{a.activity}'", act.get("requires_any")), (f"spot '{spot}'", S[spot].get("requires_any"))):
        if req and not (owned & set(req)):
            sys.exit(f"error: {what} needs one of {req} in the flat (gifted items). Owned: {sorted(i for i in owned if i) or 'none'}")
    say = pair(a.say_ru, a.say_en, "say", MAX_SAY)
    status = pair(a.status_ru, a.status_en, "status", MAX_STATUS)
    diary = pair(a.diary_ru, a.diary_en, "diary", MAX_DIARY)
    if a.diary_ru is not None and not diary:
        sys.exit("error: empty diary text")

    sync_state_branch()
    prev = read_state() or {}
    now = utcnow()
    st = {
        "v": 1,
        "activity": a.activity,
        "spot": spot,
        "mood": a.mood,
        "say": say,
        "status": status,
        "updated_at": iso(now),
        "ai_since": prev.get("ai_since") or iso(now),
        "diary": list(prev.get("diary", [])),
        "history": list(prev.get("history", [])),
    }
    if prev.get("activity"):
        st["history"].insert(0, {k: prev.get(k) for k in ("updated_at", "activity", "spot", "mood", "say")})
        st["history"] = st["history"][:HISTORY_KEEP]
    entry = None
    if diary:
        entry = {"id": "ai-" + now.strftime("%Y%m%dT%H%M%SZ"), "ts": iso(now), "type": "life", "text": diary}
        st["diary"] = (st["diary"] + [entry])[-DIARY_KEEP:]

    public = {k: st[k] for k in ("v", "activity", "spot", "mood", "say", "status", "updated_at", "ai_since")}
    public["diary"] = st["diary"][-DIARY_PUBLIC:]
    if a.dry_run:
        print(json.dumps(public, ensure_ascii=False, indent=1))
        print("(dry run — nothing written)")
        return

    with open(os.path.join(WT, "pixel_state.json"), "w", encoding="utf-8") as f:
        json.dump(st, f, ensure_ascii=False, indent=1)
        f.write("\n")
    live = os.path.join(WT, "live")
    os.makedirs(live, exist_ok=True)
    blob = json.dumps(public, ensure_ascii=False, separators=(",", ":")) + "\n"
    base = now.replace(second=0)
    keep = set()
    for i in range(AHEAD_MIN + 1):
        name = minute_name(base + timedelta(minutes=i)) + ".json"
        keep.add(name)
        with open(os.path.join(live, name), "w", encoding="utf-8") as f:
            f.write(blob)
    cutoff = minute_name(base - timedelta(minutes=KEEP_BEHIND_MIN))
    for fn in os.listdir(live):
        if fn.endswith(".json") and fn not in keep and fn[:-5] < cutoff:
            os.remove(os.path.join(live, fn))

    sh("git", "add", "-A", ".", cwd=WT)
    msg = f"pixel: {a.activity}@{spot} {a.mood}" + (" +diary" if entry else "")
    sh("git", "commit", "-q", "-m", msg, cwd=WT)
    for attempt in range(3):
        r = sh("git", "push", "-q", "origin", BRANCH, cwd=WT, check=False)
        if r.returncode == 0:
            break
        sh("git", "pull", "-q", "--rebase", "-X", "theirs", "origin", BRANCH, cwd=WT, check=False)
        time.sleep(2)
    else:
        sys.exit("error: push failed:\n" + r.stderr)
    print(f"OK {msg} | updated_at {iso(now)} (Moscow {msk(now)}) | live until {msk(base + timedelta(minutes=AHEAD_MIN))} MSK")

    if entry and a.also_feed:
        add_to_main_feed(entry)


def add_to_main_feed(entry):
    """Optional: also append the diary entry to data/feed.json on main (triggers ONE Pages build)."""
    r = sh("git", "pull", "-q", "--rebase", "--autostash", "origin", "main", check=False)
    if r.returncode != 0:
        print("warn: could not pull main; diary stays in pixel-state only\n" + r.stderr)
        return
    p = os.path.join(REPO, "data", "feed.json")
    feed = json.load(open(p, encoding="utf-8"))
    if any(e.get("id") == entry["id"] for e in feed):
        return
    feed.append(entry)
    with open(p, "w", encoding="utf-8") as f:
        json.dump(feed, f, ensure_ascii=False, indent=1)
        f.write("\n")
    sh("git", "add", "data/feed.json")
    sh("git", "commit", "-q", "-m", "Pixel diary", "--", "data/feed.json")
    for _ in range(3):
        if sh("git", "push", "-q", "origin", "main", check=False).returncode == 0:
            print("diary also appended to data/feed.json on main")
            return
        sh("git", "pull", "-q", "--rebase", "--autostash", "origin", "main", check=False)
    print("warn: push to main failed; diary is still live via pixel-state")


def cmd_list(a):
    acts = load_acts()
    print("ACTIVITIES (default spot; allowed spots; anim; requires):")
    for k, v in acts["activities"].items():
        allowed = ",".join(v.get("spots") or acts["free_spots"] + ["guitar", "tv"])
        print(f"  {k:12} {v['spot']:8} [{allowed}] anim={v.get('anim', 'none')}{' needs ' + '/'.join(v['requires_any']) if v.get('requires_any') else ''} — {v['en']}")
    print("\nSPOTS:")
    for k, v in acts["spots"].items():
        print(f"  {k:8} pose={v['pose']}{' needs ' + '/'.join(v['requires_any']) if v.get('requires_any') else ''} {v.get('note', '')}")
    print("\nMOODS: " + ", ".join(f"{k} {v['emoji']}" for k, v in acts["moods"].items()))
    print(f"\nLimits: say ≤{MAX_SAY}, status ≤{MAX_STATUS}, diary ≤{MAX_DIARY} chars per language.")


def main():
    ap = argparse.ArgumentParser(description="Be Pixel: read and set Pixel's live state.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("status", help="show current state, Moscow time, donations, diary, history")
    p.add_argument("-n", type=int, default=5)
    p.add_argument("--live", action="store_true", help="also fetch what visitors see right now")
    sub.add_parser("list", help="list valid activities / spots / moods")
    p = sub.add_parser("set", help="set Pixel's state and push it live")
    p.add_argument("--activity", required=True)
    p.add_argument("--mood", required=True)
    p.add_argument("--spot")
    p.add_argument("--say-ru"); p.add_argument("--say-en")
    p.add_argument("--status-ru", help="optional custom status line instead of the activity label")
    p.add_argument("--status-en")
    p.add_argument("--diary-ru"); p.add_argument("--diary-en")
    p.add_argument("--also-feed", action="store_true", help="also append the diary entry to data/feed.json on main (costs a Pages build)")
    p.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    {"status": cmd_status, "set": cmd_set, "list": cmd_list}[a.cmd](a)


if __name__ == "__main__":
    main()

"""
wiki.py - finds the Wikipedia article about a rivalry, for the AI Story.

Many national-team rivalries have their own article, named like
"Argentina–Brazil football rivalry" or "Mexico–United States soccer rivalry".
We ask Wikipedia for those exact titles (both team orders) and, if one
exists, take the beginning of its text. The AI Story uses it as the source
for the HISTORY of the rivalry; the numbers still come from our own data.

Every answer is saved in backend/cache/wiki.json, so each rivalry is looked
up once. If Wikipedia is slow or down we simply return nothing, and the story
is written without it.
"""

import json
import threading
from pathlib import Path

import httpx

from config import WIKI_ARTICLE_MAX_CHARS, WIKI_TIMEOUT_SECONDS

WIKI_API = "https://en.wikipedia.org/w/api.php"
# Wikipedia asks every program to say who it is.
USER_AGENT = "ClasicoApp/1.0 (student project for CMU 15-113; github.com/dcerrato-create)"

CACHE_FILE = Path(__file__).parent / "cache" / "wiki.json"
_lock = threading.Lock()


def _load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_cache = _load_cache()  # {"Argentina|Brazil": {"title", "url", "text"} or None}
last_error = None       # why the latest lookup failed, if it did (shown by /api/health)


def _ask(params):
    response = httpx.get(
        WIKI_API,
        params={"action": "query", "format": "json", "formatversion": 2, **params},
        headers={"User-Agent": USER_AGENT},
        timeout=WIKI_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.json().get("query", {})


def find_rivalry_article(team_a, team_b):
    """Return {"title", "url", "text"} for the rivalry's Wikipedia article,
    or None if there isn't one (or Wikipedia can't be reached). Never raises."""
    global last_error
    first, second = sorted([team_a, team_b])
    key = f"{first}|{second}"
    with _lock:
        if key in _cache:
            return _cache[key]

    # The titles such an article could have: both orders, "football" or "soccer".
    guesses = [
        f"{x}–{y} {sport} rivalry"
        for x, y in ((first, second), (second, first))
        for sport in ("football", "soccer")
    ]
    try:
        # 1. Which of those titles exists? (one small request)
        query = _ask({"titles": "|".join(guesses), "redirects": 1, "prop": "info"})
        existing = [page["title"] for page in query.get("pages", []) if not page.get("missing")]
        if not existing:
            article = None
        else:
            # 2. Fetch that article as plain text and keep its beginning.
            title = existing[0]
            pages = _ask({"titles": title, "prop": "extracts", "explaintext": 1, "exsectionformat": "plain"}).get("pages", [])
            text = (pages[0].get("extract") or "").strip() if pages else ""
            article = {
                "title": title,
                "url": "https://en.wikipedia.org/wiki/" + title.replace(" ", "_"),
                "text": text[:WIKI_ARTICLE_MAX_CHARS],
            } if text else None
    except (httpx.HTTPError, ValueError, KeyError) as err:
        last_error = f"{type(err).__name__}: {str(err)[:160]}"
        print("Wikipedia lookup failed:", last_error, flush=True)
        return None  # not saved, so we try again next time
    last_error = None

    with _lock:
        _cache[key] = article
        try:
            CACHE_FILE.parent.mkdir(exist_ok=True)
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(_cache, f, ensure_ascii=False, indent=1)
        except OSError:
            pass  # can't save to disk: it is still remembered while the server runs
    return article

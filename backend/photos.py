"""
photos.py - finds players' photos on Wikipedia for the Top Scorers tab.

The danger is showing the WRONG face (for example Cristiano Ronaldo for the
Brazilian Ronaldo). So a Wikipedia page is only accepted when its one-line
description says ALL of these:
  1. the person is a footballer,
  2. the person is from the right country,
  3. the birth year (when given) fits the years the player scored in our data.
If no page passes, or Wikipedia is slow or down, there is no photo and the
app shows a "Photo not available" placeholder.

There are two ways to look, because Wikipedia only allows a few SEARCHES in
a row before it starts refusing them:
  - quick_lookup(): one single request for a whole list of players, asking
    for pages by their exact title ("Carlos Pavón", "Ronaldo (Brazilian
    footballer)"...). This finds most players.
  - search_lookup(): a real search ("Adriano Brazil footballer") for one
    player the quick way could not find. Slower, and done one at a time.

Every final answer is saved in backend/cache/photos.json, so each player is
only looked up once.
"""

import json
import os
import re
import threading
import time
import unicodedata
from pathlib import Path

import httpx

from config import NATIONALITY_WORDS, PHOTO_SECONDS_BETWEEN_SEARCHES, PHOTO_TIMEOUT_SECONDS

# Can be pointed somewhere else for testing (e.g. to simulate an outage).
WIKI_API = os.environ.get("WIKIPEDIA_API_URL", "https://en.wikipedia.org/w/api.php")
# Wikipedia asks every program to say who it is.
USER_AGENT = "ClasicoApp/1.0 (student project for CMU 15-113; github.com/dcerrato-create)"

CACHE_FILE = Path(__file__).parent / "cache" / "photos.json"
_lock = threading.Lock()         # protects the cache
_search_lock = threading.Lock()  # only one Wikipedia search at a time
_last_search = 0.0               # when the previous search finished


def _load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_cache = _load_cache()  # {"Ronaldo|Brazil": {"photo": url or None, "page": url or None}}
_not_found_by_title = set()  # players the quick way already failed on (until restart)


def _remember(name, team, answer):
    """Save a final answer (a photo, or 'this player has none')."""
    with _lock:
        _cache[f"{name}|{team}"] = answer
        CACHE_FILE.parent.mkdir(exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(_cache, f, ensure_ascii=False, indent=1)


def _recall(name, team):
    """A saved answer with its status, or None if we never looked."""
    with _lock:
        saved = _cache.get(f"{name}|{team}")
    if saved is None:
        return None
    return {**saved, "status": "found" if saved["photo"] else "none"}


def _plain(text):
    """Lowercase without accents: 'Pavón' -> 'pavon'."""
    decomposed = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def _clean_name(name):
    """Drop nicknames in quotes: 'Eduardo "Volkswagen" Hernández' -> 'Eduardo Hernández'."""
    return " ".join(re.sub(r'"[^"]*"', " ", name).split())


def _ask_wikipedia(params):
    return httpx.get(
        WIKI_API,
        params={"action": "query", "format": "json", "formatversion": 2, **params},
        headers={"User-Agent": USER_AGENT},
        timeout=PHOTO_TIMEOUT_SECONDS,
    )


# ---------------------------------------------------------------------------
# The checks
# ---------------------------------------------------------------------------

def _is_footballer(description):
    description = description.lower()
    other_sports = ["american football", "gridiron", "rugby", "australian rules", "gaelic", "canadian football"]
    if any(sport in description for sport in other_sports):
        return False
    return "football" in description or "soccer" in description


def _is_from(team, description):
    words = NATIONALITY_WORDS.get(team, []) + [team]
    return any(_plain(word) in _plain(description) for word in words)


def _age_fits(description, first_year, last_year):
    """Does a birth year like '(born 1976)' or '(1924–1996)' fit the years
    this player scored? If Wikipedia gives no year we can't tell, so it passes."""
    found = (re.search(r"born[^)]*?(1[89]\d\d|20\d\d)", description)
             or re.search(r"\(\D*?(1[89]\d\d)\s*[–-]", description))
    if not found:
        return True
    born = int(found.group(1))
    # International goalscorers are between about 15 and 45 years old.
    return first_year - 45 <= born <= last_year - 14


def _is_the_player(page, player):
    """True if this Wikipedia page is clearly about our player."""
    description = page.get("description", "")
    return (
        _is_footballer(description)
        and _is_from(player["team"], description)
        and _age_fits(description, player["first_year"], player["last_year"])
    )


def _answer_from(page):
    # The right person. They may still have no picture on Wikipedia.
    return {
        "photo": page.get("thumbnail", {}).get("source"),
        "page": "https://en.wikipedia.org/wiki/" + page["title"].replace(" ", "_"),
    }


# ---------------------------------------------------------------------------
# 1. The quick way: many players, one request, exact page titles
# ---------------------------------------------------------------------------

def _title_guesses(player):
    """Page titles this player is likely to have, most specific first."""
    name = _clean_name(player["name"])
    nationality = (NATIONALITY_WORDS.get(player["team"]) or [player["team"]])[0]
    return [f"{name} ({nationality} footballer)", f"{name} (footballer)", name]


def quick_lookup(players):
    """Look up a whole list of players at once. Never raises an error.

    players: [{"name", "team", "first_year", "last_year"}, ...]
    Returns one result per player, in the same order:
      {"name", "team", "photo", "page", "status"} where status is
        "found"       - here is the photo
        "none"        - we know this player has no usable photo
        "search"      - not found by title; worth trying search_lookup()
        "unavailable" - Wikipedia could not be reached
    """
    results = {}
    unknown = []
    for player in players:
        key = (player["name"], player["team"])
        saved = _recall(*key)
        if saved:
            results[key] = saved
        elif key in _not_found_by_title:
            results[key] = {"photo": None, "page": None, "status": "search"}  # no need to ask again
        else:
            unknown.append(player)

    if unknown:
        guesses = {(p["name"], p["team"]): _title_guesses(p) for p in unknown}
        all_titles = sorted({title for titles in guesses.values() for title in titles})
        pages = {}  # the title we asked for -> the page Wikipedia gave back
        try:
            for start in range(0, len(all_titles), 50):  # Wikipedia takes 50 titles per request
                response = _ask_wikipedia({
                    "titles": "|".join(all_titles[start:start + 50]),
                    "redirects": 1,  # follow "Nilo Braga" -> "Nilo (footballer)"
                    "prop": "pageimages|description",
                    "piprop": "thumbnail",
                    "pithumbsize": 400,
                    "pilimit": 50,
                })
                response.raise_for_status()
                query = response.json().get("query", {})
                by_title = {page["title"]: page for page in query.get("pages", []) if not page.get("missing")}
                # Wikipedia may rename what we asked for; follow each rename.
                renamed = {r["from"]: r["to"] for r in query.get("normalized", []) + query.get("redirects", [])}
                for title in all_titles[start:start + 50]:
                    final = title
                    while final in renamed:
                        final = renamed[final]
                    if final in by_title:
                        pages[title] = by_title[final]
        except (httpx.HTTPError, ValueError, KeyError):
            for player in unknown:
                results[(player["name"], player["team"])] = {"photo": None, "page": None, "status": "unavailable"}
            unknown = []

        for player in unknown:
            key = (player["name"], player["team"])
            match = next((pages[t] for t in guesses[key] if t in pages and _is_the_player(pages[t], player)), None)
            if match:
                answer = _answer_from(match)
                _remember(*key, answer)
                results[key] = {**answer, "status": "found" if answer["photo"] else "none"}
            else:
                _not_found_by_title.add(key)
                results[key] = {"photo": None, "page": None, "status": "search"}

    return [{"name": p["name"], "team": p["team"], **results[(p["name"], p["team"])]} for p in players]


# ---------------------------------------------------------------------------
# 2. The careful way: one player, a real search
# ---------------------------------------------------------------------------

def _title_has_name(name, title):
    """The page title must contain the player's first and last name."""
    words = _plain(_clean_name(name)).split()
    title = _plain(title)
    return bool(words) and words[0] in title and words[-1] in title


def search_lookup(player):
    """Search Wikipedia for one player, e.g. "Adriano Brazil footballer".
    Never raises an error. Returns {"photo", "page", "status"}."""
    global _last_search
    saved = _recall(player["name"], player["team"])
    if saved:
        return saved

    try:
        # One search at a time, with a pause in between: Wikipedia refuses
        # programs that search too fast.
        with _search_lock:
            wait = PHOTO_SECONDS_BETWEEN_SEARCHES - (time.time() - _last_search)
            if wait > 0:
                time.sleep(wait)
            try:
                response = _ask_wikipedia({
                    "generator": "search",
                    "gsrsearch": f'{_clean_name(player["name"])} {player["team"]} footballer',
                    "gsrlimit": 5,
                    "prop": "pageimages|description",
                    "piprop": "thumbnail",
                    "pithumbsize": 400,
                })
            finally:
                _last_search = time.time()
        response.raise_for_status()  # includes "429 Too Many Requests"
        pages = sorted(response.json().get("query", {}).get("pages", []),
                       key=lambda page: page.get("index", 99))  # best match first
    except (httpx.HTTPError, ValueError):
        # Slow, down or refusing us. Not saved, so we try again another time.
        return {"photo": None, "page": None, "status": "unavailable"}

    answer = {"photo": None, "page": None}
    for page in pages:
        if _title_has_name(player["name"], page.get("title", "")) and _is_the_player(page, player):
            answer = _answer_from(page)
            break
    _remember(player["name"], player["team"], answer)
    return {**answer, "status": "found" if answer["photo"] else "none"}

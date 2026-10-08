"""
story.py - writes the "AI Story" paragraph with the OpenAI API, live.

How one story is made:
  1. build_facts() gathers the numbers we already computed for the rivalry.
     The model must take every statistic from these facts.
  2. wiki.py looks for the rivalry's Wikipedia article. Its text, plus what
     the model already knows, is where the HISTORY in the story comes from
     (see STORY_PROMPT in config.py for the exact rules).
  3. start_story() makes exactly ONE call to OpenAI and hands back the text
     piece by piece as it is generated, so the page can show it being typed.
  4. When the story is complete it is saved in backend/cache/stories.json.

What protects the OpenAI credits:
  - Cache: a rivalry + language is only ever written once, even after a
    restart. Team order does not matter (Brazil v Argentina = Argentina v Brazil).
  - One call per story, no automatic retries, and a cap on the length.
  - If the visitor leaves mid-story, the call to OpenAI is closed.
  - Rate limit: each visitor gets a few new stories per minute and per day,
    and there is a daily cap for everyone combined.
  - The key lives only in .env (OPENAI_API_KEY) and never reaches the browser.
"""

import json
import os
import threading
import time
from datetime import date
from pathlib import Path

import openai

import data
import wiki
from config import (
    DEFAULT_OPENAI_MODEL,
    STORY_LANGUAGES,
    STORY_LIMIT_PER_DAY,
    STORY_LIMIT_PER_VISITOR,
    STORY_LIMIT_PER_VISITOR_PER_DAY,
    STORY_LIMIT_WINDOW_SECONDS,
    STORY_MAX_TOKENS,
    STORY_PROMPT,
    STORY_TIMEOUT_SECONDS,
    STORY_VERSION,
)
from errors import ApiError

CACHE_FILE = Path(__file__).parent / "cache" / "stories.json"

_lock = threading.Lock()   # one request at a time may touch the things below
_in_progress = set()       # stories being written right now (so none is written twice at once)
_recent_requests = {}      # visitor -> times they started a new story (last minute)
_visitor_daily = {}        # visitor -> how many new stories they started today
_daily = {"day": date.today(), "count": 0}  # new stories today, everyone combined


# ---------------------------------------------------------------------------
# Cache: {"Argentina|Brazil|en|110|2025-03-25|v2": {"story", "model", "source"}}
# ---------------------------------------------------------------------------

def _load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_cache = _load_cache()


def _cache_key(team_a, team_b, matches, lang):
    # The teams arrive in alphabetical order (app.py sorts them), so both ways
    # of picking the two teams share a story. The match count and latest date
    # are part of the key, so a story is written again automatically when the
    # dataset gets new matches. STORY_VERSION changes when the prompt does,
    # which also starts a fresh story.
    return "|".join([team_a, team_b, lang, str(len(matches)), matches[-1]["date"], f"v{STORY_VERSION}"])


def check_language(lang):
    if lang not in STORY_LANGUAGES:
        raise ApiError("The story is only available in English (en) or Spanish (es).", 400)


def get_cached(team_a, team_b, matches, lang):
    """The saved story as {"story", "model", "source"}, or None if it was never written."""
    with _lock:
        return _cache.get(_cache_key(team_a, team_b, matches, lang))


# ---------------------------------------------------------------------------
# Rate limit
# ---------------------------------------------------------------------------

def _check_rate_limit(visitor):
    """Count one new story for this visitor, or raise a friendly error."""
    now = time.time()
    today = date.today()

    if _daily["day"] != today:  # a new day: start counting again
        _daily["day"] = today
        _daily["count"] = 0
        _visitor_daily.clear()
    if _daily["count"] >= STORY_LIMIT_PER_DAY:
        raise ApiError("The AI writer has reached its limit for today. Please come back tomorrow.", 429)
    if _visitor_daily.get(visitor, 0) >= STORY_LIMIT_PER_VISITOR_PER_DAY:
        raise ApiError("You've reached today's limit of new AI stories. Stories you already opened still work.", 429)

    recent = [t for t in _recent_requests.get(visitor, []) if now - t < STORY_LIMIT_WINDOW_SECONDS]
    if len(recent) >= STORY_LIMIT_PER_VISITOR:
        raise ApiError("You're asking for new stories very quickly. Please wait a minute and try again.", 429)

    recent.append(now)
    _recent_requests[visitor] = recent
    _visitor_daily[visitor] = _visitor_daily.get(visitor, 0) + 1
    _daily["count"] += 1


# ---------------------------------------------------------------------------
# The facts we send to the model
# ---------------------------------------------------------------------------

def build_facts(team_a, team_b, matches):
    """A compact summary of the rivalry with the team names spelled out, so
    the model can't mix up 'team a' and 'team b'. Everything comes from the
    same functions that feed the rest of the page."""
    a, b = team_a, team_b
    overview = data.overview(matches, today=date.today())
    book = data.record_book(matches)
    shootouts = data.shootout_stats(a, b, matches)

    # Facts are given as plain values (not ready-made English phrases), so
    # the model has to write its own sentence in whichever language it uses.
    def day(iso_date):  # "2000-09-02" -> "2 September 2000"
        return data.format_date(iso_date, month="%B")

    def match_fact(match):
        if not match:
            return None
        return {
            "date": day(match["date"]),
            "home_team": match["home_team"], "home_goals": match["home_score"],
            "away_team": match["away_team"], "away_goals": match["away_score"],
            "competition": "friendly match" if match["tournament"] == "Friendly" else data.tournament_label(match["tournament"]),
            "city": match["city"],
        }

    def streak_fact(streak):
        return streak and {"matches_in_a_row": streak["length"], "from": day(streak["start"]), "to": day(streak["end"])}

    def record_fact(record):
        return {"matches": record["matches"], f"{a} wins": record["a_wins"],
                "draws": record["draws"], f"{b} wins": record["b_wins"]}

    decades = data.decade_records(matches, matches)
    return {
        "teams": [a, b],
        "matches_played": overview["matches"],
        "record": record_fact(overview),
        "percentages": {f"{a} wins": overview["a_pct"], "draws": overview["draws_pct"], f"{b} wins": overview["b_pct"]},
        "goals": {a: overview["a_goals"], b: overview["b_goals"], "average_per_match": overview["goals_per_game"]},
        "first_meeting": match_fact(matches[0]),
        "last_meeting": match_fact(matches[-1]),
        f"biggest {a} win": match_fact(data.biggest_win(matches, "a")),
        f"biggest {b} win": match_fact(data.biggest_win(matches, "b")),
        "longest_streaks": {
            f"{a} winning streak": streak_fact(book["a_winning_streak"]),
            f"{b} winning streak": streak_fact(book["b_winning_streak"]),
            f"{a} unbeaten streak": streak_fact(book["a_unbeaten_streak"]),
            f"{b} unbeaten streak": streak_fact(book["b_unbeaten_streak"]),
        },
        "by_decade": [{"decade": d["label"], **record_fact(d)} for d in decades if d["matches"]],
        "decades_with_no_matches": [d["label"] for d in decades if not d["matches"]],
        "by_venue": [{"venue": v["label"], **record_fact(v)} for v in data.venue_records(a, b, matches)],
        "penalty_shootouts": {
            "total": shootouts["total"],
            f"{a} shootout wins": shootouts["a_wins"],
            f"{b} shootout wins": shootouts["b_wins"],
        },
    }


# ---------------------------------------------------------------------------
# Writing a new story
# ---------------------------------------------------------------------------

def start_story(team_a, team_b, matches, lang, visitor):
    """Start writing a story that is not in the cache. The teams (and
    `matches`, seen from team_a's side) must be in alphabetical order.

    Makes the one call to OpenAI and returns (model name, source, pieces).
    `source` is the Wikipedia article used for the history ({"title", "url"})
    or None, and `pieces` yields the text bit by bit as the model writes it. Problems that
    happen before any text arrives (no key, rate limit, OpenAI refusing) are
    raised as ApiError with a friendly message.
    """
    key = _cache_key(team_a, team_b, matches, lang)
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise ApiError("The AI Story isn't set up yet: the server has no OpenAI key.", 503)
    model = os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_OPENAI_MODEL

    with _lock:
        if key in _in_progress:
            raise ApiError("This story is already being written. Try again in a few seconds.", 409)
        _check_rate_limit(visitor)
        _in_progress.add(key)

    facts = json.dumps(build_facts(team_a, team_b, matches), ensure_ascii=False)

    # The rivalry's Wikipedia article, if it has one (None if not, or if
    # Wikipedia can't be reached: the story is then written without it).
    article = wiki.find_rivalry_article(team_a, team_b)
    source = {"title": article["title"], "url": article["url"]} if article else None
    wikipedia = f'"{article["title"]}"\n{article["text"]}' if article else "none"

    # One line in the server log for every call that costs money.
    print(f"OpenAI call: new {STORY_LANGUAGES[lang]} story for {team_a} v {team_b} ({model})", flush=True)
    try:
        # max_retries=0: exactly one call, never an automatic second try.
        client = openai.OpenAI(api_key=api_key, timeout=STORY_TIMEOUT_SECONDS, max_retries=0)
        stream = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": STORY_PROMPT.format(language=STORY_LANGUAGES[lang])},
                {"role": "user", "content": f"FACTS:\n{facts}\n\nWIKIPEDIA:\n{wikipedia}"},
            ],
            max_completion_tokens=STORY_MAX_TOKENS,
            stream=True,
        )
    except openai.OpenAIError as err:
        with _lock:
            _in_progress.discard(key)
        raise _friendly_error(err, model)

    def pieces():
        written = []
        finished = False
        try:
            for chunk in stream:
                text = chunk.choices[0].delta.content if chunk.choices else None
                if text:
                    written.append(text)
                    yield text
            finished = True
        except openai.OpenAIError as err:
            raise _friendly_error(err, model)
        finally:
            # Runs when the story ends AND when the visitor leaves halfway.
            # Closing the stream tells OpenAI to stop writing.
            stream.close()
            with _lock:
                _in_progress.discard(key)
                if finished and written:  # only complete stories are saved
                    _cache[key] = {"story": "".join(written).strip(), "model": model, "source": source}
                    CACHE_FILE.parent.mkdir(exist_ok=True)
                    with open(CACHE_FILE, "w", encoding="utf-8") as f:
                        json.dump(_cache, f, ensure_ascii=False, indent=1)

    return model, source, pieces()


def _friendly_error(err, model):
    """Turn an OpenAI error into a message that is safe and useful to show."""
    if isinstance(err, openai.AuthenticationError):
        return ApiError("The AI Story can't start: the server's OpenAI key was rejected.", 502)
    if isinstance(err, openai.RateLimitError):
        # OpenAI uses the same error for "out of credit" and "too busy".
        if "insufficient_quota" in str(err):
            return ApiError("The AI Story has run out of OpenAI credit, so no new stories can be written right now.", 503)
        return ApiError("The AI writer is too busy right now. Please try again in a minute.", 503)
    if isinstance(err, openai.NotFoundError):
        return ApiError(f"The AI Story can't start: OpenAI doesn't have a model called \"{model}\".", 502)
    if isinstance(err, (openai.APITimeoutError, openai.APIConnectionError)):
        return ApiError("The AI writer didn't answer in time. Please try again.", 504)
    return ApiError("The AI writer had a problem. Please try again.", 502)

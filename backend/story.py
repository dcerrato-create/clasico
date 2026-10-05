"""
story.py - writes the "AI Story" paragraph with the OpenAI API.

Three things protect the OpenAI credits:
  1. Cache: each matchup + language is written once and saved to a file.
  2. Rate limit: a visitor can only ask for a few NEW stories per minute,
     and there is a daily cap for everyone combined.
  3. The API key lives only in .env (OPENAI_API_KEY) and never reaches the browser.

The model only receives the statistics we computed from the dataset, and the
prompt (in config.py) tells it to use nothing else.
"""

import json
import os
import threading
import time
from datetime import date
from pathlib import Path

import openai

from config import (
    DEFAULT_OPENAI_MODEL,
    STORY_LANGUAGES,
    STORY_LIMIT_PER_DAY,
    STORY_LIMIT_PER_VISITOR,
    STORY_LIMIT_WINDOW_SECONDS,
    STORY_PROMPT,
)
from errors import ApiError

CACHE_FILE = Path(__file__).parent / "cache" / "stories.json"

_lock = threading.Lock()   # one request at a time may touch the cache/counters
_recent_requests = {}      # visitor IP -> list of times they asked for a new story
_daily = {"day": date.today(), "count": 0}


# ---------------------------------------------------------------------------
# Cache (a JSON file: {"Argentina|Brazil|en|110|2025-03-25": "story text"})
# ---------------------------------------------------------------------------

def _load_cache():
    try:
        with open(CACHE_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


_cache = _load_cache()


def _save_cache():
    CACHE_FILE.parent.mkdir(exist_ok=True)
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(_cache, f, ensure_ascii=False, indent=1)


def _cache_key(summary, lang):
    # The match count and latest date are part of the key, so a story is
    # rewritten automatically when the dataset gets new matches.
    return "|".join([
        summary["team_a"], summary["team_b"], lang,
        str(summary["total_matches"]), summary["latest_match"]["date"],
    ])


# ---------------------------------------------------------------------------
# Rate limit
# ---------------------------------------------------------------------------

def _check_rate_limit(visitor):
    now = time.time()

    if _daily["day"] != date.today():
        _daily["day"] = date.today()
        _daily["count"] = 0
    if _daily["count"] >= STORY_LIMIT_PER_DAY:
        raise ApiError("The AI Story has reached its daily limit. Please come back tomorrow.", 429)

    recent = [t for t in _recent_requests.get(visitor, []) if now - t < STORY_LIMIT_WINDOW_SECONDS]
    if len(recent) >= STORY_LIMIT_PER_VISITOR:
        raise ApiError("You're asking for stories very quickly. Please wait a minute and try again.", 429)

    recent.append(now)
    _recent_requests[visitor] = recent
    _daily["count"] += 1


# ---------------------------------------------------------------------------
# The facts we send to the model
# ---------------------------------------------------------------------------

def build_facts(summary):
    """Rewrite the summary with the team names spelled out, so the model
    can't mix up 'team a' and 'team b'."""
    a, b = summary["team_a"], summary["team_b"]
    return {
        "teams": [a, b],
        "total_matches": summary["total_matches"],
        "record": {f"{a} wins": summary["a_wins"], "draws": summary["draws"], f"{b} wins": summary["b_wins"]},
        "goals": {a: summary["a_goals"], b: summary["b_goals"], "total": summary["total_goals"]},
        "first_match": summary["first_match"],
        "latest_match": summary["latest_match"],
        f"biggest {a} win": summary["biggest_a_win"],
        f"biggest {b} win": summary["biggest_b_win"],
        "highest_scoring_match": summary["highest_scoring"],
        "record_by_competition": [
            {
                "competition": c["label"],
                "matches": c["matches"],
                f"{a} wins": c["a_wins"],
                "draws": c["draws"],
                f"{b} wins": c["b_wins"],
            }
            for c in summary["by_category"]
        ],
        "penalty_shootouts (a shootout never changes the match result in the record above)": {
            "total": summary["shootouts"]["total"],
            f"{a} shootout wins": summary["shootouts"]["a_wins"],
            f"{b} shootout wins": summary["shootouts"]["b_wins"],
        },
        "matches_with_recorded_scorers": summary["matches_with_scorer_data"],
        "top_scorers_in_those_matches": summary["top_scorers"],
    }


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def get_story(summary, lang, visitor):
    """Return (story_text, was_cached). Raises ApiError with a readable message."""
    if lang not in STORY_LANGUAGES:
        raise ApiError("The story is only available in English (en) or Spanish (es).", 400)

    key = _cache_key(summary, lang)
    with _lock:
        if key in _cache:
            return _cache[key], True

        api_key = os.environ.get("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise ApiError("The AI Story isn't set up yet: the server has no OpenAI key.", 503)

        _check_rate_limit(visitor)

    model = os.environ.get("OPENAI_MODEL", "").strip() or DEFAULT_OPENAI_MODEL
    facts = json.dumps(build_facts(summary), ensure_ascii=False, indent=1)
    try:
        client = openai.OpenAI(api_key=api_key, timeout=25, max_retries=1)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": STORY_PROMPT.format(language=STORY_LANGUAGES[lang])},
                {"role": "user", "content": f"Statistics:\n{facts}"},
            ],
        )
        text = (response.choices[0].message.content or "").strip()
    except openai.AuthenticationError:
        raise ApiError("The AI Story couldn't start: the server's OpenAI key was rejected.", 502)
    except openai.RateLimitError:
        raise ApiError("The AI Story is out of OpenAI credit or too busy right now. Please try again later.", 503)
    except openai.NotFoundError:
        raise ApiError(f"The AI Story couldn't start: OpenAI doesn't know the model \"{model}\".", 502)
    except (openai.APIConnectionError, openai.APITimeoutError):
        raise ApiError("The AI writer took too long to answer. Please try again.", 504)
    except openai.OpenAIError:
        raise ApiError("The AI writer had a problem. Please try again.", 502)

    if not text:
        raise ApiError("The AI writer sent back an empty story. Please try again.", 502)

    with _lock:
        _cache[key] = text
        _save_cache()
    return text, False

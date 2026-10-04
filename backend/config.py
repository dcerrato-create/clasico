"""
config.py - settings you may want to edit yourself.

Everything that is "a choice" rather than "logic" lives here, so you can
change it without touching the rest of the backend.
"""

# ---------------------------------------------------------------------------
# TOURNAMENT FILTERS
# The filter chips in the app. Each match gets exactly one category.
# "match" is compared against the tournament name in results.csv.
# ---------------------------------------------------------------------------
TOURNAMENT_CATEGORIES = [
    # (category id,   label shown on the chip)
    ("world_cup",     "World Cup"),
    ("copa_america",  "Copa América"),
    ("gold_cup",      "Gold Cup"),
    ("qualifiers",    "Qualifiers"),
    ("friendlies",    "Friendlies"),
    ("other",         "Other"),
]

# Exact tournament names -> category. Anything with "qualification" in the
# name becomes "qualifiers"; anything not listed becomes "other".
TOURNAMENT_NAME_TO_CATEGORY = {
    "FIFA World Cup": "world_cup",
    "Copa América": "copa_america",
    "Gold Cup": "gold_cup",
    "Friendly": "friendlies",
}

# ---------------------------------------------------------------------------
# EXTRA SEARCH NAMES
# Nicknames people might type that are not in the dataset.
# ---------------------------------------------------------------------------
EXTRA_ALIASES = {
    "United States": ["USA", "US", "Estados Unidos"],
    "South Korea": ["Korea Republic"],
    "North Korea": ["Korea DPR"],
    "Ivory Coast": ["Côte d'Ivoire"],
    "Turkey": ["Türkiye"],
    "Netherlands": ["Holland"],
    "Czech Republic": ["Czechia"],
}

# ---------------------------------------------------------------------------
# AI STORY
# The instructions sent to the OpenAI model. {language} is replaced with
# "English" or "Spanish". The match statistics are sent right after this text.
# ---------------------------------------------------------------------------
STORY_PROMPT = """You are a football (soccer) writer for an app called Clásico.
Write ONE short paragraph (90 to 130 words) in {language} about the rivalry
between the two national teams described in the statistics below.

Rules:
- Use ONLY the facts in the statistics provided. Do not add anything from your
  own knowledge: no player names, coaches, stadiums, nicknames, wars, politics,
  trophies or events unless they appear in the statistics.
- Every number you mention must match the statistics exactly.
- Goalscorer data only covers some of the matches. If you mention scorers,
  say it is "in the matches with recorded scorers", not of all time.
- If something is not in the statistics, leave it out. Do not guess.
- Make it vivid and engaging, but stay factual. No headings, no bullet points,
  no emojis. Plain text only."""

STORY_LANGUAGES = {"en": "English", "es": "Spanish"}

# Default model if OPENAI_MODEL is not set in .env (small and cheap).
DEFAULT_OPENAI_MODEL = "gpt-4.1-mini"

# ---------------------------------------------------------------------------
# RATE LIMIT (protects your OpenAI credits)
# Only NEW stories count. Stories served from the cache are free.
# ---------------------------------------------------------------------------
STORY_LIMIT_PER_VISITOR = 6    # new stories one visitor may request...
STORY_LIMIT_WINDOW_SECONDS = 60  # ...within this many seconds
STORY_LIMIT_PER_DAY = 300      # new stories for everyone combined, per day

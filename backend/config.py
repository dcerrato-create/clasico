"""
config.py - settings you may want to edit yourself.

Everything that is "a choice" rather than "logic" lives here, so you can
change it without touching the rest of the backend.
"""

# ---------------------------------------------------------------------------
# TOURNAMENT FILTERS
# The filter chips are different for every rivalry: they are the tournaments
# those two teams actually met in. Only the ones listed here are shown for
# EVERY rivalry, even when the teams never met in them.
# Names must match the "tournament" column in results.csv.
# ---------------------------------------------------------------------------
ALWAYS_SHOWN_TOURNAMENTS = ["FIFA World Cup", "Friendly"]

# Nicer names for the chips. Anything not listed keeps its dataset name.
# "... qualification" automatically becomes "... qualifiers".
TOURNAMENT_LABELS = {
    "FIFA World Cup": "World Cup",
    "Friendly": "Friendlies",
    "UEFA Euro": "UEFA European Championship",
    "African Cup of Nations": "Africa Cup of Nations",
}

# Aim for at most this many tournament chips (not counting "All"). When a
# rivalry has more, tournaments the teams met in only ONCE are grouped under
# "Other". A tournament they met in more than once always keeps its own chip,
# even if that means going over this number.
MAX_TOURNAMENT_CHIPS = 8

# The most matches the "recent games" endpoint will return in one answer.
MAX_RECENT_MATCHES = 30

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
# "English" or "Spanish". The facts about the rivalry are sent right after
# this text, and the model is told to use nothing else.
# ---------------------------------------------------------------------------
STORY_PROMPT = """You are a sports writer for Clásico, an app about national football (soccer) team rivalries.
Write the story of the rivalry described in the FACTS below, in {language}.

Rules you must follow:
- Use ONLY the FACTS provided. Every number, score, date, city and competition
  you mention must match the FACTS. Never change, round or estimate a number.
- Never add anything from your own knowledge: no outside history, no player
  or coach names, no quotes, no trophies, no events off the pitch, and no
  nicknames for teams, countries or fans. Call each team by its name in the FACTS.
- If something is not in the FACTS, leave it out. Never guess.
- A match decided on penalties still counts as a draw in the record.
- Length: 4 to 6 sentences in one paragraph, about 90 to 130 words. You cannot
  fit every fact: choose the ones that tell the arc of the rivalry best.
- Tone: an engaging sports writer, not a list of numbers.
- Write everything naturally in {language}, as a native writer would, never as
  a word-for-word translation. That includes dates ("2 September 2000" in
  English, "2 de septiembre de 2000" in Spanish), competition names and
  phrases like "friendly match" or "matches in a row". Only team and city
  names stay exactly as they are in the FACTS.
- When writing in Spanish, use no English words at all: "amistoso" for a
  friendly match, "eliminatorias mundialistas" for World Cup qualifiers,
  "la década de 1960" for the 1960s, and the usual Spanish name of a
  competition when one exists (Copa del Mundo, Copa Oro, Eurocopa).
- Plain text only: no headings, no bullet points, no emojis."""

STORY_LANGUAGES = {"en": "English", "es": "Spanish"}

# Used only if OPENAI_MODEL is not set in .env.
DEFAULT_OPENAI_MODEL = "gpt-5.4"

# The most the model may write for one story (4 to 6 sentences need about 250).
STORY_MAX_TOKENS = 400

# Give up on OpenAI after this many seconds, so a stuck call can't hang.
STORY_TIMEOUT_SECONDS = 30

# ---------------------------------------------------------------------------
# RATE LIMIT (protects your OpenAI credits)
# Only NEW stories count. Stories served from the cache are free.
# ---------------------------------------------------------------------------
STORY_LIMIT_PER_VISITOR = 4           # new stories one visitor may start...
STORY_LIMIT_WINDOW_SECONDS = 60       # ...within this many seconds
STORY_LIMIT_PER_VISITOR_PER_DAY = 30  # new stories one visitor may start per day
STORY_LIMIT_PER_DAY = 300             # new stories for everyone combined, per day

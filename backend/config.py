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

# ---------------------------------------------------------------------------
# KEEPING THE DATA UP TO DATE
# The match results come from this public dataset. The server checks it when
# it starts and then every DATA_REFRESH_HOURS hours, and loads any update.
# ---------------------------------------------------------------------------
DATASET_URL = "https://raw.githubusercontent.com/martj42/international_results/master/"
DATA_REFRESH_HOURS = 6

# The most matches the "recent games" endpoint will return in one answer.
MAX_RECENT_MATCHES = 30

# ---------------------------------------------------------------------------
# UNUSUAL GAMES (the lists at the bottom of the home screen)
# ---------------------------------------------------------------------------
UNUSUAL_LIST_SIZE = 10   # entries in each list (the first 3 go on the podium)
CHAOS_MAX_MARGIN = 2     # a "chaos game" is high-scoring but decided by this many goals or fewer

# "Ghost countries": teams in the dataset whose country no longer exists.
# Names must match the dataset. (The Soviet Union and Serbia and Montenegro
# are not here because the dataset files their matches under Russia and Serbia.)
GHOST_COUNTRIES = [
    "Czechoslovakia",
    "Yugoslavia",
    "German DR",         # East Germany
    "Vietnam Republic",  # South Vietnam
    "North Vietnam",
    "Yemen DPR",         # South Yemen
    "Saarland",
    "Manchukuo",
]

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
# "English" or "Spanish". Two things are sent right after this text:
#   FACTS     - the statistics we computed (the numbers must come from here)
#   WIKIPEDIA - the start of the rivalry's Wikipedia article, when one exists
# The history of the rivalry comes from WIKIPEDIA and the model's own knowledge.
# ---------------------------------------------------------------------------
STORY_PROMPT = """You are a sports writer for Clásico, an app about national football (soccer) team rivalries.
Write the story of this rivalry in {language}.

You are given two things:
- FACTS: statistics computed from a database of match results.
- WIKIPEDIA: the beginning of the Wikipedia article about this rivalry, or "none".

What to write:
- Mostly the HISTORY and character of the rivalry: how it started, why it
  matters to both countries, its most famous matches and moments, and the
  context around them. Take this from WIKIPEDIA and from your own knowledge.
  The reader already sees the statistics elsewhere on the page, so this is
  the part they came for.
- Only one or two sentences of headline numbers from FACTS (for example the
  overall record), woven into the story.

Accuracy rules:
- Every statistic about the matches between these two teams (totals, wins,
  draws, goals, streaks) and the score or date of any match listed in FACTS
  must come from FACTS and match it exactly. If WIKIPEDIA or your memory
  gives a different number, use the one in FACTS.
- For the history, only state things that are well documented and that you
  are confident about. If you are unsure of a detail (a year, a score, a
  name), leave that detail out. Never invent matches, quotes or people.
- If WIKIPEDIA is "none" and you know little about this rivalry, say in one
  short sentence that it has little recorded history, and tell the story
  from FACTS alone.
- Some rivalries touch on war or politics. Mention that only when it is a
  well-known part of the rivalry, factually and respectfully, without taking sides.

Style:
- Length: 4 to 6 sentences in one paragraph, about 110 to 150 words.
- Tone: an engaging sports writer telling a story, not a list of numbers.
- Write everything naturally in {language}, as a native writer would, never as
  a word-for-word translation. That includes dates ("2 September 2000" in
  English, "2 de septiembre de 2000" in Spanish) and competition names.
- When writing in Spanish, use no English words at all: "amistoso" for a
  friendly match, "eliminatorias mundialistas" for World Cup qualifiers,
  "la década de 1960" for the 1960s, and the usual Spanish name of a
  competition when one exists (Copa del Mundo, Copa Oro, Eurocopa).
- Plain text only: no headings, no bullet points, no emojis."""

# Change this number whenever you edit STORY_PROMPT: saved stories written
# with the old instructions are then written again instead of being reused.
STORY_VERSION = 2

STORY_LANGUAGES = {"en": "English", "es": "Spanish"}

# Used only if OPENAI_MODEL is not set in .env.
DEFAULT_OPENAI_MODEL = "gpt-5.4"

# The most the model may write for one story (4 to 6 sentences need about 300).
STORY_MAX_TOKENS = 500

# How much of the Wikipedia article is sent to the model (in characters), and
# how long to wait for Wikipedia before writing the story without it.
WIKI_ARTICLE_MAX_CHARS = 6000
WIKI_TIMEOUT_SECONDS = 5

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

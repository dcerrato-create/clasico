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

# ---------------------------------------------------------------------------
# PLAYER PHOTOS (Top Scorers tab)
# Photos come from Wikipedia. A page is only accepted when it clearly says
# the person is a footballer from the right country, so we need to know how
# Wikipedia describes people from each country ("Brazilian", "Dutch"...).
# Countries not listed here are matched by their own name (e.g. "Uruguay"
# matches "Uruguayan").
# ---------------------------------------------------------------------------
NATIONALITY_WORDS = {
    "Argentina": ["Argentine", "Argentinian"],
    "Belgium": ["Belgian"],
    "Brazil": ["Brazilian"],
    "Canada": ["Canadian"],
    "Chile": ["Chilean"],
    "China": ["Chinese"],
    "Costa Rica": ["Costa Rican"],
    "Croatia": ["Croatian", "Croat"],
    "Czech Republic": ["Czech"],
    "Czechoslovakia": ["Czechoslovak", "Czech", "Slovak"],
    "Denmark": ["Danish", "Dane"],
    "Ecuador": ["Ecuadorian"],
    "Egypt": ["Egyptian"],
    "El Salvador": ["Salvadoran", "Salvadorian", "Salvadorean"],
    "England": ["English", "British"],
    "Finland": ["Finnish", "Finn"],
    "France": ["French"],
    "German DR": ["East German", "German"],
    "Germany": ["German"],
    "Greece": ["Greek"],
    "Honduras": ["Honduran"],
    "Hungary": ["Hungarian"],
    "Iceland": ["Icelandic"],
    "Ireland": ["Irish"],
    "Italy": ["Italian"],
    "Ivory Coast": ["Ivorian"],
    "Japan": ["Japanese"],
    "Mexico": ["Mexican"],
    "Morocco": ["Moroccan"],
    "Netherlands": ["Dutch"],
    "New Zealand": ["New Zealand", "New Zealander"],
    "Northern Ireland": ["Northern Irish", "Irish"],
    "Norway": ["Norwegian"],
    "Panama": ["Panamanian"],
    "Paraguay": ["Paraguayan"],
    "Peru": ["Peruvian"],
    "Poland": ["Polish", "Pole"],
    "Portugal": ["Portuguese"],
    "Republic of Ireland": ["Irish"],
    "Russia": ["Russian", "Soviet"],
    "Scotland": ["Scottish", "Scots"],
    "Serbia": ["Serbian", "Serb", "Yugoslav"],
    "South Korea": ["South Korean", "Korean"],
    "Spain": ["Spanish", "Spaniard"],
    "Sweden": ["Swedish", "Swede"],
    "Switzerland": ["Swiss"],
    "Turkey": ["Turkish", "Turk"],
    "United States": ["American", "United States"],
    "Wales": ["Welsh"],
    "Yugoslavia": ["Yugoslav", "Serbian", "Croatian", "Slovenian", "Bosnian", "Macedonian", "Montenegrin"],
}

# How long to wait for Wikipedia before giving up and showing a placeholder.
PHOTO_TIMEOUT_SECONDS = 5

# Wikipedia blocks programs that ask too fast, so we leave this many seconds
# between one search and the next.
PHOTO_SECONDS_BETWEEN_SEARCHES = 0.5

# The most players the scorers endpoint will ever return in one answer.
MAX_SCORERS = 25

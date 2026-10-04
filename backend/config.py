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

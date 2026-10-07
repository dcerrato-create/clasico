"""
unusual.py - the lists behind the "Unusual Games" section of the home screen.

Everything is computed from the match results, across EVERY pair of teams:
  one-time rivalries   - pairs that have met exactly once
  biggest beatdowns    - the widest winning margins
  longest waits        - the longest gap between two meetings of the same pair
  chaos games          - the most goals in a match that still ended close
  most-played          - the pairs with the most matches
  where it all began   - the oldest rivalries (by their first meeting)
  ghost countries      - teams of countries that no longer exist

The work is done once, the first time someone asks, and then kept in memory.
"""

import random
from collections import defaultdict
from datetime import date

import data
from config import CHAOS_MAX_MARGIN, GHOST_COUNTRIES, UNUSUAL_LIST_SIZE

_computed = None  # filled in by _compute() the first time it is needed


def _day(iso_date):
    """ "2001-04-11" -> "11 Apr 2001" """
    d = date.fromisoformat(iso_date)
    return f"{d.day} {d.strftime('%b %Y')}"


def _score(match):
    return f'{match["home_team"]} {match["home_score"]}–{match["away_score"]} {match["away_team"]}'


def _where(match):
    return f'{_day(match["date"])} · {data.tournament_label(match["tournament"])} · {match["city"]}'


def _ranked(entries):
    """Give each entry a rank. Entries with the same `sort_value` share one
    (1, 2, 2, 4...). `entries` must already be in order, best first."""
    for index, entry in enumerate(entries):
        same = index > 0 and entry["sort_value"] == entries[index - 1]["sort_value"]
        entry["rank"] = entries[index - 1]["rank"] if same else index + 1
    for entry in entries:
        del entry["sort_value"]
    return entries


def _entry(team_a, team_b, value, unit, title, detail, sort_value):
    """One row of a list. Clicking it opens the rivalry team_a vs team_b."""
    return {
        "team_a": data.team_info(team_a), "team_b": data.team_info(team_b),
        "value": value,    # the big number, e.g. "31"
        "unit": unit,      # what it counts, e.g. "goal margin"
        "title": title,    # e.g. "Australia 31–0 American Samoa"
        "detail": detail,  # e.g. "11 Apr 2001 · World Cup qualifiers · Coffs Harbour"
        "sort_value": sort_value,
    }


def _compute():
    matches = sorted(data.MATCHES, key=lambda m: m["date"])  # oldest first
    top = UNUSUAL_LIST_SIZE

    # Every pair of teams -> all their matches, oldest first.
    pairs = defaultdict(list)
    for m in matches:
        pairs[tuple(sorted([m["home_team"], m["away_team"]]))].append(m)

    def margin(m):
        return abs(m["home_score"] - m["away_score"])

    def goals(m):
        return m["home_score"] + m["away_score"]

    # --- Rivalries that happened exactly once ---
    one_time = [group[0] for group in pairs.values() if len(group) == 1]

    # --- Biggest beatdowns: widest margin (then more goals, then the older match) ---
    beatdowns = sorted(matches, key=lambda m: (-margin(m), -goals(m), m["date"]))[:top]

    # --- Chaos games: the most goals, but decided by CHAOS_MAX_MARGIN or less ---
    close = [m for m in matches if margin(m) <= CHAOS_MAX_MARGIN]
    chaos = sorted(close, key=lambda m: (-goals(m), margin(m), m["date"]))[:top]

    # --- Longest waits: the biggest gap between two meetings in a row ---
    waits = []
    for group in pairs.values():
        for earlier, later in zip(group, group[1:]):
            days = (date.fromisoformat(later["date"]) - date.fromisoformat(earlier["date"])).days
            waits.append((days, earlier, later))
    waits = sorted(waits, key=lambda wait: -wait[0])[:top]

    # --- Most-played rivalries ---
    most_played = sorted(pairs.values(), key=lambda group: (-len(group), group[0]["date"]))[:top]

    # --- Where it all began: the rivalries with the oldest first meeting ---
    oldest = sorted(pairs.values(), key=lambda group: group[0]["date"])[:top]

    # --- Ghost countries: teams of countries that no longer exist (config.py) ---
    ghosts = []
    for team in GHOST_COUNTRIES:
        played = [m for m in matches if team in (m["home_team"], m["away_team"])]
        if played:
            ghosts.append((team, played))
    ghosts.sort(key=lambda ghost: ghost[1][-1]["date"], reverse=True)  # most recently gone first

    return {
        "one_time": one_time,
        "lists": {
            "beatdowns": _ranked([
                _entry(m["home_team"], m["away_team"], str(margin(m)), "goal margin", _score(m), _where(m), margin(m))
                for m in beatdowns
            ]),
            "waits": _ranked([
                _entry(a["home_team"], a["away_team"], f"{days / 365.25:.1f}", "years apart",
                       f'{a["home_team"]} vs {a["away_team"]}',
                       f'{_day(a["date"])} → {_day(b["date"])}', days)
                for days, a, b in waits
            ]),
            "chaos": _ranked([
                _entry(m["home_team"], m["away_team"], str(goals(m)), "goals", _score(m), _where(m), goals(m))
                for m in chaos
            ]),
            "most_played": _ranked([
                _entry(group[0]["home_team"], group[0]["away_team"], str(len(group)), "matches",
                       f'{group[0]["home_team"]} vs {group[0]["away_team"]}',
                       f'{group[0]["date"][:4]}–{group[-1]["date"][:4]}', len(group))
                for group in most_played
            ]),
            "oldest": _ranked([
                _entry(group[0]["home_team"], group[0]["away_team"], group[0]["date"][:4], "first meeting",
                       _score(group[0]), _where(group[0]), group[0]["date"])
                for group in oldest
            ]),
            "ghosts": _ranked([
                _entry(team,
                       last["away_team"] if last["home_team"] == team else last["home_team"],
                       last["date"][:4], "last match", team,
                       f'Last match: {_score(last)}, {_day(last["date"])} · '
                       f'{len(played)} matches since {played[0]["date"][:4]}', last["date"])
                for team, played in ghosts
                for last in [played[-1]]
            ]),
        },
    }


def _get():
    global _computed
    if _computed is None:
        _computed = _compute()
    return _computed


def lists():
    """The six top lists, plus how many one-time rivalries there are."""
    computed = _get()
    return {"lists": computed["lists"], "one_time_count": len(computed["one_time"])}


def _one_time_row(match):
    return {
        "date": match["date"],
        "home_team": match["home_team"], "home_score": match["home_score"],
        "away_team": match["away_team"], "away_score": match["away_score"],
        "tournament": data.tournament_label(match["tournament"]),
        "city": match["city"],
    }


def one_time(random_count=None):
    """Rivalries that happened exactly once: a random handful, or all of
    them (newest first) when random_count is None."""
    matches = _get()["one_time"]
    if random_count is not None:
        chosen = random.sample(matches, min(random_count, len(matches)))
    else:
        chosen = sorted(matches, key=lambda m: m["date"], reverse=True)
    return {"total": len(matches), "matches": [_one_time_row(m) for m in chosen]}

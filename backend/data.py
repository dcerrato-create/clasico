"""
data.py - loads the CSV dataset into memory and answers questions about it.

The CSVs are small (about 50,000 matches), so we read them once when the
server starts and keep them in plain Python lists and dictionaries.
No database is needed.

Dataset: https://github.com/martj42/international_results
"""

import csv
import json
import unicodedata
from collections import Counter
from datetime import date
from pathlib import Path

from config import ALWAYS_SHOWN_TOURNAMENTS, EXTRA_ALIASES, MAX_TOURNAMENT_CHIPS, TOURNAMENT_LABELS

DATA_DIR = Path(__file__).parent / "data"


def _read_csv(filename):
    with open(DATA_DIR / filename, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _normalize(text):
    """Lowercase and strip accents, so 'curacao' matches 'Curaçao'."""
    decomposed = unicodedata.normalize("NFD", text.strip().lower())
    return "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")


def tournament_label(tournament):
    """The name shown on a filter chip, e.g.
    "FIFA World Cup qualification" -> "World Cup qualifiers"."""
    suffix = " qualification"
    if tournament.endswith(suffix):
        return tournament_label(tournament[: -len(suffix)]) + " qualifiers"
    return TOURNAMENT_LABELS.get(tournament, tournament)


# ---------------------------------------------------------------------------
# Load everything once, at import time
# ---------------------------------------------------------------------------

# Every played match. Rows with "NA" scores are fixtures that have not been
# played yet, so we skip them.
MATCHES = []
for row in _read_csv("results.csv"):
    if not (row["home_score"].isdigit() and row["away_score"].isdigit()):
        continue
    MATCHES.append({
        "date": row["date"],
        "home_team": row["home_team"],
        "away_team": row["away_team"],
        "home_score": int(row["home_score"]),
        "away_score": int(row["away_score"]),
        "tournament": row["tournament"],
        "city": row["city"],
        "country": row["country"],
        "neutral": row["neutral"] == "TRUE",
    })

# Goals and shootouts are looked up by (date, home team, away team).
GOALS = {}
for row in _read_csv("goalscorers.csv"):
    key = (row["date"], row["home_team"], row["away_team"])
    GOALS.setdefault(key, []).append({
        "team": row["team"],
        "scorer": row["scorer"],
        "minute": int(row["minute"]) if row["minute"].isdigit() else None,
        "own_goal": row["own_goal"] == "TRUE",
        "penalty": row["penalty"] == "TRUE",
    })

SHOOTOUTS = {}             # match key -> the team that won the shootout
SHOOTOUT_FIRST_SHOOTER = {}  # match key -> the team that took the first kick (often unknown)
for row in _read_csv("shootouts.csv"):
    key = (row["date"], row["home_team"], row["away_team"])
    SHOOTOUTS[key] = row["winner"]
    if row["first_shooter"]:
        SHOOTOUT_FIRST_SHOOTER[key] = row["first_shooter"]

with open(DATA_DIR / "flag_codes.json", encoding="utf-8") as f:
    FLAG_CODES = json.load(f)

# Each team's colors, main color first: {"Brazil": ["#009c3b", "#ffdf00", ...]}.
# Teams that are not in the file get an empty list (the app uses default colors).
with open(DATA_DIR / "team_colors.json", encoding="utf-8") as f:
    TEAM_COLORS = json.load(f)

TEAM_NAMES = sorted(
    {m["home_team"] for m in MATCHES} | {m["away_team"] for m in MATCHES}
)

# Other names a team can be found under: former names from the dataset
# (e.g. "Zaïre" -> DR Congo) plus the nicknames in config.py.
ALIASES = {name: [] for name in TEAM_NAMES}
for row in _read_csv("former_names.csv"):
    if row["current"] in ALIASES:
        ALIASES[row["current"]].append(row["former"])
for name, extra in EXTRA_ALIASES.items():
    if name in ALIASES:
        ALIASES[name].extend(extra)

# normalized text -> official team name. Official names win over aliases.
_LOOKUP = {}
for name, aliases in ALIASES.items():
    for alias in aliases:
        _LOOKUP[_normalize(alias)] = name
for name in TEAM_NAMES:
    _LOOKUP[_normalize(name)] = name


# ---------------------------------------------------------------------------
# Questions the API can ask
# ---------------------------------------------------------------------------

def resolve_team(text):
    """Return the official team name for what the user typed, or None."""
    return _LOOKUP.get(_normalize(text or ""))


def team_info(name):
    """What the frontend needs to draw a team: name, flag code and colors."""
    return {
        "name": name,
        "code": FLAG_CODES.get(name),         # None when we have no flag
        "colors": TEAM_COLORS.get(name, []),  # main color first
    }


def list_teams():
    """All teams for the picker, with the other names they can be found under."""
    return [{**team_info(name), "aliases": ALIASES[name]} for name in TEAM_NAMES]


def head_to_head(team_a, team_b):
    """Every match between the two teams, oldest first, seen from A's side."""
    pair = {team_a, team_b}
    matches = []
    for m in MATCHES:
        if {m["home_team"], m["away_team"]} != pair:
            continue
        a_is_home = m["home_team"] == team_a
        a_goals = m["home_score"] if a_is_home else m["away_score"]
        b_goals = m["away_score"] if a_is_home else m["home_score"]
        if a_goals > b_goals:
            winner = "a"
        elif b_goals > a_goals:
            winner = "b"
        else:
            winner = "draw"
        key = (m["date"], m["home_team"], m["away_team"])
        matches.append({
            **m,
            "a_goals": a_goals,
            "b_goals": b_goals,
            "winner": winner,
            "margin": abs(a_goals - b_goals),
            # A shootout never changes the result: the match keeps its real
            # score (usually a draw; sometimes a win in a two-legged tie) and
            # we report who won the shootout separately.
            "shootout_winner": SHOOTOUTS.get(key),
            "shootout_first_shooter": SHOOTOUT_FIRST_SHOOTER.get(key),
            "scorers": GOALS.get(key, []),
        })
    matches.sort(key=lambda m: m["date"])
    return matches


def assign_categories(matches):
    """Work out the filter chips for one rivalry and tag every match with one.

    The chips are the tournaments these two teams really played each other in,
    so every rivalry gets its own list. World Cup and Friendlies are always
    there (config.py), even with 0 matches.

    "Other" is only for one-off meetings: a tournament the teams met in more
    than once ALWAYS gets its own chip. Tournaments with a single match also
    get their own chip while there is room, and share "Other" when there isn't.

    Returns [{"id", "label", "matches"}, ...] in the order to show them, and
    sets match["category"] to the id of the chip that match belongs to.
    """
    counts = Counter(m["tournament"] for m in matches)

    # Every other tournament they met in, most matches first.
    others = sorted(
        (t for t in counts if t not in ALWAYS_SHOWN_TOURNAMENTS),
        key=lambda t: (-counts[t], t),
    )
    repeated = [t for t in others if counts[t] > 1]   # always get a chip
    one_offs = [t for t in others if counts[t] == 1]  # may go to "Other"

    room = max(MAX_TOURNAMENT_CHIPS - len(ALWAYS_SHOWN_TOURNAMENTS) - len(repeated), 0)
    shown, grouped = repeated + one_offs[:room], one_offs[room:]
    if len(grouped) == 1:
        # An "Other" chip holding one tournament is pointless: just name it.
        shown, grouped = others, []

    categories = [
        {"id": t, "label": tournament_label(t), "matches": counts.get(t, 0)}
        for t in ALWAYS_SHOWN_TOURNAMENTS + shown
    ]
    if grouped:
        categories.append({
            "id": "other",
            "label": "Other",
            "matches": sum(counts[t] for t in grouped),
            "includes": [tournament_label(t) for t in grouped],
        })

    for m in matches:
        m["category"] = "other" if m["tournament"] in grouped else m["tournament"]
    return categories


def decade_records(matches, all_matches):
    """Wins, draws and losses per decade, oldest decade first.

    `matches` are the ones to count (maybe filtered to one tournament).
    `all_matches` is the whole rivalry: it decides which decades are listed,
    so a decade with nothing to count still shows up, with zeros.
    """
    first = int(all_matches[0]["date"][:4]) // 10 * 10   # 1927 -> 1920
    last = int(all_matches[-1]["date"][:4]) // 10 * 10
    records = {
        decade: {"decade": decade, "label": f"{decade}s",
                 "matches": 0, "a_wins": 0, "draws": 0, "b_wins": 0}
        for decade in range(first, last + 10, 10)
    }
    for m in matches:
        record = records[int(m["date"][:4]) // 10 * 10]
        record["matches"] += 1
        record[{"a": "a_wins", "draw": "draws", "b": "b_wins"}[m["winner"]]] += 1
    return list(records.values())


def _short_match(match):
    """A match as the record book shows it."""
    return {
        "date": match["date"],
        "score": f'{match["home_team"]} {match["home_score"]}-{match["away_score"]} {match["away_team"]}',
        "tournament": match["tournament"],
        "city": match["city"],
        "country": match["country"],
        "goals": match["home_score"] + match["away_score"],
        "margin": match["margin"],
    }


def _longest_run(matches, counts):
    """The longest run of matches in a row for which counts(match) is true.
    If two runs are equally long, the more recent one is returned.
    Returns {"length", "start", "end"} (dates), or None if it never happened."""
    best = None
    run = []
    for m in matches:  # oldest first
        if counts(m):
            run.append(m)
            if best is None or len(run) >= best["length"]:
                best = {"length": len(run), "start": run[0]["date"], "end": run[-1]["date"]}
        else:
            run = []
    return best


def _percent(part, whole):
    """A whole-number percentage, or None when there is nothing to divide by
    (so the page can show a dash instead of a broken number)."""
    return round(100 * part / whole) if whole else None


def _record(matches):
    """Wins, draws and goals for a group of matches, with percentages."""
    total = len(matches)
    a_wins = sum(m["winner"] == "a" for m in matches)
    b_wins = sum(m["winner"] == "b" for m in matches)
    draws = total - a_wins - b_wins
    return {
        "matches": total,
        "a_wins": a_wins,
        "draws": draws,
        "b_wins": b_wins,
        "a_goals": sum(m["a_goals"] for m in matches),
        "b_goals": sum(m["b_goals"] for m in matches),
        "a_pct": _percent(a_wins, total),
        "draws_pct": _percent(draws, total),
        "b_pct": _percent(b_wins, total),
    }


def overview(matches, today):
    """The big picture: record with percentages, goals per game, clean
    sheets and the last meeting. `today` is a date, used for "days since"."""
    record = _record(matches)
    total = record["matches"]
    per_game = lambda goals: round(goals / total, 2) if total else None  # noqa: E731
    last = matches[-1] if matches else None
    return {
        **record,
        "goals_per_game": per_game(record["a_goals"] + record["b_goals"]),
        "a_goals_per_game": per_game(record["a_goals"]),
        "b_goals_per_game": per_game(record["b_goals"]),
        # A clean sheet for Team A = a match where Team B did not score.
        "a_clean_sheets": sum(m["b_goals"] == 0 for m in matches),
        "b_clean_sheets": sum(m["a_goals"] == 0 for m in matches),
        "last_meeting": _short_match(last) if last else None,
        "days_since_last_meeting": (today - date.fromisoformat(last["date"])).days if last else None,
    }


def shootout_stats(team_a, team_b, matches):
    """Penalty shootouts: how many, who won them, and whether shooting first helped."""
    shootouts = [m for m in matches if m["shootout_winner"]]
    total = len(shootouts)
    a_wins = sum(m["shootout_winner"] == team_a for m in shootouts)
    b_wins = sum(m["shootout_winner"] == team_b for m in shootouts)
    # The dataset only knows who shot first for some shootouts.
    with_first = [m for m in shootouts if m["shootout_first_shooter"]]
    return {
        "total": total,
        "a_wins": a_wins,
        "b_wins": b_wins,
        "a_pct": _percent(a_wins, total),
        "b_pct": _percent(b_wins, total),
        "first_shooter_known": len(with_first),
        "first_shooter_won": sum(m["shootout_first_shooter"] == m["shootout_winner"] for m in with_first),
        "list": [
            {**_short_match(m), "winner": m["shootout_winner"], "first_shooter": m["shootout_first_shooter"]}
            for m in shootouts
        ],
    }


def competitive_vs_friendly(matches):
    """The record in friendlies, and in everything else ("competitive")."""
    friendlies = [m for m in matches if m["tournament"] == "Friendly"]
    competitive = [m for m in matches if m["tournament"] != "Friendly"]
    return {
        "competitive": {"id": "competitive", **_record(competitive)},
        "friendly": {"id": "friendly", **_record(friendlies)},
    }


def _most_common_score(matches):
    """The scoreline that happened most often, counted either way round
    (a 2-1 win for either team is "2-1"). Ties go to the most recent one."""
    if not matches:
        return None
    counts = Counter()
    latest = {}
    for m in matches:  # oldest first, so `latest` ends up with the last date
        score = (max(m["a_goals"], m["b_goals"]), min(m["a_goals"], m["b_goals"]))
        counts[score] += 1
        latest[score] = m["date"]
    high, low = max(counts, key=lambda score: (counts[score], latest[score]))
    return {"score": f"{high}-{low}", "times": counts[(high, low)], "last_date": latest[(high, low)]}


def record_book(team_a, team_b, matches):
    """The records of a rivalry: biggest wins, highest score, longest streaks."""
    # "Biggest" = widest margin; if equal, more goals; if still equal, the latest.
    def biggest(wins):
        best = max(wins, key=lambda m: (m["margin"], m["a_goals"] + m["b_goals"], m["date"]), default=None)
        return _short_match(best) if best else None

    highest = max(matches, key=lambda m: (m["a_goals"] + m["b_goals"], m["date"]), default=None)
    return {
        "biggest_a_win": biggest([m for m in matches if m["winner"] == "a"]),
        "biggest_b_win": biggest([m for m in matches if m["winner"] == "b"]),
        "highest_scoring": _short_match(highest) if highest else None,
        # A winning streak is wins in a row; an unbeaten streak also allows draws.
        "a_winning_streak": _longest_run(matches, lambda m: m["winner"] == "a"),
        "b_winning_streak": _longest_run(matches, lambda m: m["winner"] == "b"),
        "a_unbeaten_streak": _longest_run(matches, lambda m: m["winner"] != "b"),
        "b_unbeaten_streak": _longest_run(matches, lambda m: m["winner"] != "a"),
        "most_common_score": _most_common_score(matches),
    }


def venue_records(team_a, team_b, matches):
    """The record split by where the match was played: at Team A's home,
    at Team B's home, or on neutral ground (the dataset marks neutral venues)."""
    groups = [
        ("home_a", f"{team_a} at home", lambda m: not m["neutral"] and m["home_team"] == team_a),
        ("home_b", f"{team_b} at home", lambda m: not m["neutral"] and m["home_team"] == team_b),
        ("neutral", "Neutral ground", lambda m: m["neutral"]),
    ]
    records = []
    for venue_id, label, belongs in groups:
        group = [m for m in matches if belongs(m)]
        records.append({"id": venue_id, "label": label, **_record(group)})
    return records


def _short(match):
    """A compact version of a match, used inside the summary."""
    if match is None:
        return None
    return {
        "date": match["date"],
        "score": f'{match["home_team"]} {match["home_score"]}-{match["away_score"]} {match["away_team"]}',
        "tournament": match["tournament"],
        "city": match["city"],
        "shootout_winner": match["shootout_winner"],
    }


def summarize(team_a, team_b, matches):
    """The headline numbers for a rivalry."""
    a_wins = [m for m in matches if m["winner"] == "a"]
    b_wins = [m for m in matches if m["winner"] == "b"]
    draws = [m for m in matches if m["winner"] == "draw"]
    a_goals = sum(m["a_goals"] for m in matches)
    b_goals = sum(m["b_goals"] for m in matches)

    # Record split by tournament, most matches first.
    by_category = []
    tournament_counts = Counter(m["tournament"] for m in matches)
    for tournament, count in tournament_counts.most_common():
        group = [m for m in matches if m["tournament"] == tournament]
        by_category.append({
            "id": tournament,
            "label": tournament_label(tournament),
            "matches": count,
            "a_wins": sum(m["winner"] == "a" for m in group),
            "draws": sum(m["winner"] == "draw" for m in group),
            "b_wins": sum(m["winner"] == "b" for m in group),
        })

    # Top scorers (own goals do not count for the player).
    goal_counts = Counter()
    for m in matches:
        for g in m["scorers"]:
            if not g["own_goal"] and g["scorer"] and g["scorer"] != "NA":
                goal_counts[(g["scorer"], g["team"])] += 1
    top_scorers = [
        {"scorer": scorer, "team": team, "goals": goals}
        for (scorer, team), goals in goal_counts.most_common(5)
    ]

    shootouts = [m for m in matches if m["shootout_winner"]]

    return {
        "team_a": team_a,
        "team_b": team_b,
        "total_matches": len(matches),
        "a_wins": len(a_wins),
        "draws": len(draws),
        "b_wins": len(b_wins),
        "a_goals": a_goals,
        "b_goals": b_goals,
        "total_goals": a_goals + b_goals,
        "first_match": _short(matches[0]) if matches else None,
        "latest_match": _short(matches[-1]) if matches else None,
        "biggest_a_win": _short(max(a_wins, key=lambda m: m["margin"], default=None)),
        "biggest_b_win": _short(max(b_wins, key=lambda m: m["margin"], default=None)),
        "highest_scoring": _short(
            max(matches, key=lambda m: m["a_goals"] + m["b_goals"], default=None)
        ),
        "by_category": by_category,
        "top_scorers": top_scorers,
        # The dataset only lists goalscorers for some matches (mostly
        # competitive ones), so the scorer numbers are partial.
        "matches_with_scorer_data": sum(1 for m in matches if m["scorers"]),
        "shootouts": {
            "total": len(shootouts),
            "a_wins": sum(m["shootout_winner"] == team_a for m in shootouts),
            "b_wins": sum(m["shootout_winner"] == team_b for m in shootouts),
        },
    }

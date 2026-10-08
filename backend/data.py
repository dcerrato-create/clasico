"""
data.py - loads the CSV dataset into memory and answers questions about it.

The CSVs are small (about 50,000 matches), so we read them when the server
starts (and again whenever refresh.py downloads a newer version) and keep
them in plain Python lists and dictionaries. No database is needed.

While loading, the matches are also grouped by pair of teams and by team.
A question about one rivalry then only looks at that rivalry's matches
instead of going through all 50,000 again.

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

# The four files that make up the dataset.
DATASET_FILES = ["results.csv", "goalscorers.csv", "shootouts.csv", "former_names.csv"]


# ---------------------------------------------------------------------------
# Small helpers used all over the backend
# ---------------------------------------------------------------------------

def _read_csv(folder, filename):
    with open(folder / filename, newline="", encoding="utf-8") as f:
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


def format_date(iso_date, month="%b"):
    """ "2001-04-11" -> "11 Apr 2001" (or "11 April 2001" with month="%B")."""
    d = date.fromisoformat(iso_date)
    return f"{d.day} {d.strftime(month)} {d.year}"


def score_line(match):
    """ "Honduras 2–1 El Salvador": the result as played, home team first."""
    return f'{match["home_team"]} {match["home_score"]}–{match["away_score"]} {match["away_team"]}'


# ---------------------------------------------------------------------------
# Things that never change while the server runs
# ---------------------------------------------------------------------------

with open(DATA_DIR / "flag_codes.json", encoding="utf-8") as f:
    FLAG_CODES = json.load(f)

# Flags we keep ourselves, in docs/flags/, because flagcdn.com doesn't have them
# (countries that no longer exist) or has an out-of-date one (Honduras):
# {"Yugoslavia": "flags/yugoslavia.svg", ...}. These win over the flagcdn code.
with open(DATA_DIR / "flag_files.json", encoding="utf-8") as f:
    FLAG_FILES = json.load(f)

# Each team's colors, main color first: {"Brazil": ["#009c3b", "#ffdf00", ...]}.
# Teams that are not in the file get an empty list (the app uses default colors).
with open(DATA_DIR / "team_colors.json", encoding="utf-8") as f:
    TEAM_COLORS = json.load(f)


def team_info(name):
    """What the frontend needs to draw a team: name, flag code and colors."""
    return {
        "name": name,
        "code": FLAG_CODES.get(name),         # flagcdn.com country code, or None
        "flag_file": FLAG_FILES.get(name),    # our own flag image instead, or None
        "colors": TEAM_COLORS.get(name, []),  # main color first
    }


# ---------------------------------------------------------------------------
# The dataset. It is loaded when the server starts, and loaded AGAIN whenever
# refresh.py downloads a newer version, so these are filled in by a function.
# ---------------------------------------------------------------------------

MATCHES = []          # every played match, as a dictionary, oldest first
MATCHES_BY_PAIR = {}  # frozenset of two team names -> the matches between them, oldest first
MATCHES_BY_TEAM = {}  # team name -> every match that team played, oldest first
TEAM_LIST = []        # every team as the picker needs it, in alphabetical order
_LOOKUP = {}          # normalized text -> official team name


def load_dataset(folder=DATA_DIR):
    """Read the four CSV files in `folder` and replace everything above.

    Everything is built first and only swapped in at the very end, so a
    request that arrives halfway through still sees complete (old) data.
    Raises an error, and changes nothing, if a file is missing or broken.
    """
    global MATCHES, MATCHES_BY_PAIR, MATCHES_BY_TEAM, TEAM_LIST, _LOOKUP

    # Goals and shootouts, looked up by (date, home team, away team).
    goals = {}
    for row in _read_csv(folder, "goalscorers.csv"):
        key = (row["date"], row["home_team"], row["away_team"])
        goals.setdefault(key, []).append({
            "team": row["team"],
            "scorer": row["scorer"],
            "minute": int(row["minute"]) if row["minute"].isdigit() else None,
            "own_goal": row["own_goal"] == "TRUE",
            "penalty": row["penalty"] == "TRUE",
        })
    shootout_winners = {}
    first_shooters = {}
    for row in _read_csv(folder, "shootouts.csv"):
        key = (row["date"], row["home_team"], row["away_team"])
        shootout_winners[key] = row["winner"]
        if row["first_shooter"]:
            first_shooters[key] = row["first_shooter"]

    # Every played match, with its goals and shootout attached. Rows with
    # "NA" scores are fixtures that have not been played yet, so we skip them.
    matches = []
    for row in _read_csv(folder, "results.csv"):
        if not (row["home_score"].isdigit() and row["away_score"].isdigit()):
            continue
        key = (row["date"], row["home_team"], row["away_team"])
        home_score, away_score = int(row["home_score"]), int(row["away_score"])
        matches.append({
            "date": row["date"],
            "home_team": row["home_team"],
            "away_team": row["away_team"],
            "home_score": home_score,
            "away_score": away_score,
            "tournament": row["tournament"],
            "city": row["city"],
            "country": row["country"],
            "neutral": row["neutral"] == "TRUE",
            "margin": abs(home_score - away_score),
            "scorers": goals.get(key, []),
            # A shootout never changes the result: the match keeps its real
            # score (usually a draw; sometimes a win in a two-legged tie) and
            # we record who won the shootout separately.
            "shootout_winner": shootout_winners.get(key),
            "shootout_first_shooter": first_shooters.get(key),  # often unknown
        })
    matches.sort(key=lambda m: m["date"])  # oldest first (matches on the same day keep the file's order)

    # Group the matches once, so later questions don't scan the whole list.
    by_pair = {}
    by_team = {}
    for m in matches:
        by_pair.setdefault(frozenset((m["home_team"], m["away_team"])), []).append(m)
        by_team.setdefault(m["home_team"], []).append(m)
        by_team.setdefault(m["away_team"], []).append(m)

    # Other names a team can be found under: former names from the dataset
    # (e.g. "Zaïre" -> DR Congo) plus the nicknames in config.py.
    team_names = sorted(by_team)
    aliases = {name: [] for name in team_names}
    for row in _read_csv(folder, "former_names.csv"):
        if row["current"] in aliases:
            aliases[row["current"]].append(row["former"])
    for name, extra in EXTRA_ALIASES.items():
        if name in aliases:
            aliases[name].extend(extra)

    # normalized text -> official team name. Official names win over aliases.
    lookup = {}
    for name, names in aliases.items():
        for alias in names:
            lookup[_normalize(alias)] = name
    for name in team_names:
        lookup[_normalize(name)] = name

    team_list = [{**team_info(name), "aliases": aliases[name]} for name in team_names]

    # All built without errors: swap the new data in.
    MATCHES, MATCHES_BY_PAIR, MATCHES_BY_TEAM = matches, by_pair, by_team
    TEAM_LIST, _LOOKUP = team_list, lookup


def latest_match_date():
    """The date of the newest match we have, e.g. "2026-08-26"."""
    return MATCHES[-1]["date"]


# ---------------------------------------------------------------------------
# Questions the API can ask
# ---------------------------------------------------------------------------

def resolve_team(text):
    """Return the official team name for what the user typed, or None."""
    return _LOOKUP.get(_normalize(text or ""))


def recent_matches(team, limit):
    """The latest matches one team played, newest first, seen from its side."""
    played = sorted(MATCHES_BY_TEAM.get(team, []), key=lambda m: m["date"], reverse=True)

    matches = []
    for m in played[:limit]:
        is_home = m["home_team"] == team
        goals_for = m["home_score"] if is_home else m["away_score"]
        goals_against = m["away_score"] if is_home else m["home_score"]
        matches.append({
            "date": m["date"],
            "opponent": team_info(m["away_team"] if is_home else m["home_team"]),
            "goals_for": goals_for,
            "goals_against": goals_against,
            "result": "win" if goals_for > goals_against else "loss" if goals_for < goals_against else "draw",
            # where it was played, from this team's point of view
            "venue": "neutral" if m["neutral"] else "home" if is_home else "away",
            "tournament": tournament_label(m["tournament"]),
            "city": m["city"],
            "shootout_winner": m["shootout_winner"],
        })
    return matches


def head_to_head(team_a, team_b):
    """Every match between the two teams, oldest first, seen from A's side.

    Each match is a fresh copy with "a_goals", "b_goals" and "winner"
    ("a", "b" or "draw") added, so the shared data is never changed.
    """
    matches = []
    for m in MATCHES_BY_PAIR.get(frozenset((team_a, team_b)), []):
        a_is_home = m["home_team"] == team_a
        a_goals = m["home_score"] if a_is_home else m["away_score"]
        b_goals = m["away_score"] if a_is_home else m["home_score"]
        winner = "a" if a_goals > b_goals else "b" if b_goals > a_goals else "draw"
        matches.append({**m, "a_goals": a_goals, "b_goals": b_goals, "winner": winner})
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


# ---------------------------------------------------------------------------
# Counting results. Every record on the site (headline, decades, venues,
# competitive vs friendly) is counted by the two functions below.
# ---------------------------------------------------------------------------

def _results(matches):
    """How many matches there were and how they ended."""
    a_wins = sum(m["winner"] == "a" for m in matches)
    b_wins = sum(m["winner"] == "b" for m in matches)
    return {"matches": len(matches), "a_wins": a_wins, "draws": len(matches) - a_wins - b_wins, "b_wins": b_wins}


def _percent(part, whole):
    """A whole-number percentage, or None when there is nothing to divide by
    (so the page can show a dash instead of a broken number)."""
    return round(100 * part / whole) if whole else None


def _record(matches):
    """Results, goals and percentages for a group of matches."""
    results = _results(matches)
    total = results["matches"]
    return {
        **results,
        "a_goals": sum(m["a_goals"] for m in matches),
        "b_goals": sum(m["b_goals"] for m in matches),
        "a_pct": _percent(results["a_wins"], total),
        "draws_pct": _percent(results["draws"], total),
        "b_pct": _percent(results["b_wins"], total),
    }


def _short_match(match):
    """A match as the statistics cards show it (None stays None)."""
    if match is None:
        return None
    return {
        "date": match["date"],
        "score": score_line(match),
        "tournament": match["tournament"],
        "city": match["city"],
        "goals": match["home_score"] + match["away_score"],
    }


# ---------------------------------------------------------------------------
# The statistics
# ---------------------------------------------------------------------------

def summarize(team_a, team_b, matches):
    """The headline numbers for a rivalry."""
    record = _record(matches)
    shootouts = shootout_stats(team_a, team_b, matches)
    return {
        "total_matches": record["matches"],
        "a_wins": record["a_wins"],
        "draws": record["draws"],
        "b_wins": record["b_wins"],
        "a_goals": record["a_goals"],
        "b_goals": record["b_goals"],
        "total_goals": record["a_goals"] + record["b_goals"],
        "first_date": matches[0]["date"] if matches else None,
        "latest_date": matches[-1]["date"] if matches else None,
        "shootouts": {key: shootouts[key] for key in ("total", "a_wins", "b_wins")},
    }


def decade_records(matches, all_matches):
    """Wins, draws and losses per decade, oldest decade first.

    `matches` are the ones to count (maybe filtered to one tournament).
    `all_matches` is the whole rivalry: it decides which decades are listed,
    so a decade with nothing to count still shows up, with zeros.
    """
    first = int(all_matches[0]["date"][:4]) // 10 * 10   # 1927 -> 1920
    last = int(all_matches[-1]["date"][:4]) // 10 * 10
    by_decade = {decade: [] for decade in range(first, last + 10, 10)}
    for m in matches:
        by_decade[int(m["date"][:4]) // 10 * 10].append(m)
    return [
        {"decade": decade, "label": f"{decade}s", **_results(group)}
        for decade, group in by_decade.items()
    ]


def overview(matches, today):
    """The big picture: record with percentages, goals per game, clean
    sheets and the last meeting. `today` is a date, used for "days since"."""
    record = _record(matches)
    total = record["matches"]
    last = matches[-1] if matches else None

    def per_game(goals):
        return round(goals / total, 2) if total else None

    return {
        **record,
        "goals_per_game": per_game(record["a_goals"] + record["b_goals"]),
        "a_goals_per_game": per_game(record["a_goals"]),
        "b_goals_per_game": per_game(record["b_goals"]),
        # A clean sheet for Team A = a match where Team B did not score.
        "a_clean_sheets": sum(m["b_goals"] == 0 for m in matches),
        "b_clean_sheets": sum(m["a_goals"] == 0 for m in matches),
        "last_meeting": _short_match(last),
        "days_since_last_meeting": (today - date.fromisoformat(last["date"])).days if last else None,
    }


def biggest_win(matches, side):
    """The widest win for side "a" or "b"; if equal, the one with more goals;
    if still equal, the latest. None if that side never won."""
    wins = [m for m in matches if m["winner"] == side]
    return max(wins, key=lambda m: (m["margin"], m["a_goals"] + m["b_goals"], m["date"]), default=None)


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


def _most_common_score(matches):
    """The scoreline that happened most often, counted either way round
    (a 2–1 win for either team is "2–1"). Ties go to the most recent one."""
    if not matches:
        return None
    counts = Counter()
    latest = {}
    for m in matches:  # oldest first, so `latest` ends up with the last date
        score = (max(m["a_goals"], m["b_goals"]), min(m["a_goals"], m["b_goals"]))
        counts[score] += 1
        latest[score] = m["date"]
    high, low = max(counts, key=lambda score: (counts[score], latest[score]))
    return {"score": f"{high}–{low}", "times": counts[(high, low)], "last_date": latest[(high, low)]}


def record_book(matches):
    """The records of a rivalry: biggest wins, highest score, longest streaks."""
    highest = max(matches, key=lambda m: (m["a_goals"] + m["b_goals"], m["date"]), default=None)
    return {
        "biggest_a_win": _short_match(biggest_win(matches, "a")),
        "biggest_b_win": _short_match(biggest_win(matches, "b")),
        "highest_scoring": _short_match(highest),
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
    return [
        {"id": venue_id, "label": label, **_record([m for m in matches if belongs(m)])}
        for venue_id, label, belongs in groups
    ]


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
        "list": [{**_short_match(m), "winner": m["shootout_winner"]} for m in shootouts],
    }


def competitive_vs_friendly(matches):
    """The record in friendlies, and in everything else ("competitive")."""
    friendlies = [m for m in matches if m["tournament"] == "Friendly"]
    competitive = [m for m in matches if m["tournament"] != "Friendly"]
    return {"competitive": _record(competitive), "friendly": _record(friendlies)}


# Start with the copy of the dataset that ships with the app. refresh.py
# replaces it with a newer download when there is one.
load_dataset()

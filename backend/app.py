"""
app.py - the Flask server. It only defines the web addresses (routes);
the real work happens in data.py (statistics) and story.py (AI Story).

Run locally:  python app.py   (listens on http://127.0.0.1:5001)
"""

import os
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# Read secrets and settings from the .env file in the project root.
# This must happen before anything reads os.environ.
load_dotenv(Path(__file__).parent.parent / ".env")

import data  # noqa: E402  (imported after load_dotenv on purpose)
import photos  # noqa: E402
import story  # noqa: E402
from config import MAX_SCORERS  # noqa: E402
from errors import ApiError  # noqa: E402

app = Flask(__name__)
app.json.ensure_ascii = False  # keep "Copa América" readable in responses

# CORS lets the frontend (a different address) call this backend.
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
CORS(app, origins=[o.strip() for o in allowed_origins.split(",")])


# ---------------------------------------------------------------------------
# Errors: every problem is returned as JSON with a readable message
# ---------------------------------------------------------------------------

@app.errorhandler(ApiError)
def handle_api_error(err):
    return jsonify({"error": err.message}), err.status


@app.errorhandler(HTTPException)
def handle_http_error(err):
    messages = {
        404: "That address doesn't exist on this server.",
        405: "That address doesn't accept this kind of request.",
    }
    return jsonify({"error": messages.get(err.code, err.description)}), err.code


@app.errorhandler(Exception)
def handle_unexpected_error(err):
    app.logger.exception("Unexpected error")
    return jsonify({"error": "Something went wrong on the server. Please try again."}), 500


def get_team_pair(team_a_text, team_b_text):
    """Check the two team names and return their official names."""
    team_a_text = (team_a_text or "").strip()
    team_b_text = (team_b_text or "").strip()
    if not team_a_text or not team_b_text:
        raise ApiError("Please pick two teams.", 400)

    team_a = data.resolve_team(team_a_text)
    team_b = data.resolve_team(team_b_text)
    if team_a is None:
        raise ApiError(f"We couldn't find a team called \"{team_a_text}\".", 404)
    if team_b is None:
        raise ApiError(f"We couldn't find a team called \"{team_b_text}\".", 404)
    if team_a == team_b:
        raise ApiError("Pick two different teams. A team can't play itself.", 400)
    return team_a, team_b


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    """Quick check that the server is up."""
    return jsonify({"status": "ok", "matches_loaded": len(data.MATCHES)})


@app.get("/api/teams")
def teams():
    """All teams for the picker."""
    return jsonify({"teams": data.list_teams()})


@app.get("/api/rivalry")
def rivalry():
    """Headline stats and every match between two teams.

    Example: /api/rivalry?team_a=Honduras&team_b=El Salvador
    If the teams never played, total_matches is 0 and matches is empty.
    """
    team_a, team_b = get_team_pair(request.args.get("team_a"), request.args.get("team_b"))
    matches = data.head_to_head(team_a, team_b)
    # The filter chips for THIS rivalry (also tags each match with its chip).
    categories = data.assign_categories(matches)
    return jsonify({
        "team_a": data.team_info(team_a),
        "team_b": data.team_info(team_b),
        "summary": data.summarize(team_a, team_b, matches),
        "categories": categories,
        "matches": matches,
    })


def get_filtered_matches():
    """Shared by the Era Chart and Top Scorers endpoints: read team_a, team_b
    and tournament from the address and return the matches to count.

    "tournament" is the id of one of this rivalry's filter chips. Leave it
    out (or send "all") to count every match.
    Returns (team_a, team_b, all matches, counted matches, tournament info).
    """
    team_a, team_b = get_team_pair(request.args.get("team_a"), request.args.get("team_b"))
    matches = data.head_to_head(team_a, team_b)
    if not matches:
        raise ApiError(f"{team_a} and {team_b} have never played each other.", 404)

    # The filter must be one of the chips this rivalry really has.
    categories = data.assign_categories(matches)
    labels = {"all": "All matches", **{c["id"]: c["label"] for c in categories}}
    tournament = (request.args.get("tournament") or "all").strip()
    if tournament not in labels:
        raise ApiError(f"{team_a} and {team_b} have no matches filed under \"{tournament}\".", 400)

    counted = matches if tournament == "all" else [m for m in matches if m["category"] == tournament]
    return team_a, team_b, matches, counted, {"id": tournament, "label": labels[tournament]}


@app.get("/api/eras")
def eras():
    """The record decade by decade, for the Era Chart.

    Example: /api/eras?team_a=Honduras&team_b=El Salvador&tournament=Gold Cup
    """
    team_a, team_b, matches, counted, tournament = get_filtered_matches()
    return jsonify({
        "team_a": data.team_info(team_a),
        "team_b": data.team_info(team_b),
        "tournament": tournament,
        "matches": len(counted),
        "decades": data.decade_records(counted, matches),
    })


def get_scorer_limit():
    """Read "limit" (how many players) from the address, with a readable error."""
    try:
        limit = int(request.args.get("limit", 10))
    except ValueError:
        raise ApiError("\"limit\" must be a number, like 10.", 400)
    if not 1 <= limit <= MAX_SCORERS:
        raise ApiError(f"\"limit\" must be between 1 and {MAX_SCORERS}.", 400)
    return limit


@app.get("/api/scorers")
def scorers():
    """The top scorers of a rivalry, for the Top Scorers tab.

    Example: /api/scorers?team_a=Honduras&team_b=El Salvador&limit=10
    Also returns the numbers for the "scorer data missing" note. Photos are
    NOT included: the page asks for them separately (/api/photos), so a slow
    Wikipedia never delays this list.
    """
    team_a, team_b, matches, counted, tournament = get_filtered_matches()
    players, tied_not_shown = data.top_scorers(counted, get_scorer_limit())
    with_goals = [m for m in counted if m["home_score"] + m["away_score"] > 0]
    return jsonify({
        "team_a": data.team_info(team_a),
        "team_b": data.team_info(team_b),
        "tournament": tournament,
        "scorers": players,
        "tied_not_shown": tied_not_shown,
        "total_matches": len(counted),
        "matches_with_goals": len(with_goals),
        # Matches where goals were scored but the dataset doesn't say by whom.
        "matches_missing_scorers": sum(1 for m in with_goals if not m["scorers"]),
    })


def player_for_photo(name, team):
    """What photos.py needs to know about a player. The years are from ALL
    their international goals, to check a Wikipedia page is the right person."""
    first_year, last_year = data.SCORER_YEARS[(name, team)]
    return {"name": name, "team": team, "first_year": first_year, "last_year": last_year}


@app.get("/api/photos")
def photos_for_scorers():
    """Photos for the same players /api/scorers returns, in one quick step.

    Example: /api/photos?team_a=Honduras&team_b=El Salvador&limit=10
    Each player gets a "status": "found", "none" (no photo exists),
    "search" (ask /api/photo to search harder) or "unavailable" (Wikipedia
    couldn't be reached). This never fails because of Wikipedia.
    """
    team_a, team_b, matches, counted, tournament = get_filtered_matches()
    players, _ = data.top_scorers(counted, get_scorer_limit())
    return jsonify({
        "photos": photos.quick_lookup([player_for_photo(p["name"], p["team"]) for p in players]),
    })


@app.get("/api/photo")
def photo():
    """Search Wikipedia for ONE player's photo (the slower, careful way).

    Example: /api/photo?name=Adriano&team=Brazil
    If Wikipedia is slow or down this still answers normally, with
    "photo": null, so the page can show its placeholder.
    """
    name = (request.args.get("name") or "").strip()
    team_text = (request.args.get("team") or "").strip()
    if not name or not team_text:
        raise ApiError("Please send both a player \"name\" and a \"team\".", 400)
    team = data.resolve_team(team_text)
    if team is None:
        raise ApiError(f"We couldn't find a team called \"{team_text}\".", 404)
    # Only look up players who are really in our data, so this address
    # can't be used to search Wikipedia for anything else.
    if (name, team) not in data.SCORER_YEARS:
        raise ApiError(f"We have no goals recorded for \"{name}\" playing for {team}.", 404)

    result = photos.search_lookup(player_for_photo(name, team))
    return jsonify({"name": name, "team": team, **result})


@app.post("/api/story")
def ai_story():
    """The AI Story paragraph for a matchup.

    Send JSON like {"team_a": "Honduras", "team_b": "El Salvador", "lang": "en"}.
    The statistics are computed here on the server, so the browser can't
    make the model write about made-up numbers.
    """
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        body = {}
    team_a, team_b = get_team_pair(body.get("team_a"), body.get("team_b"))
    # Alphabetical order, so "Brazil vs Argentina" reuses the cached
    # "Argentina vs Brazil" story.
    team_a, team_b = sorted([team_a, team_b])

    matches = data.head_to_head(team_a, team_b)
    if not matches:
        raise ApiError(f"{team_a} and {team_b} have never played each other, so there is no story to tell.", 404)

    # Behind a host like Render the visitor's address arrives in this header.
    visitor = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    lang = str(body.get("lang", "en")).lower()
    text, cached = story.get_story(data.summarize(team_a, team_b, matches), lang, visitor)
    return jsonify({"story": text, "lang": lang, "cached": cached})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)

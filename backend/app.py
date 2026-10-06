"""
app.py - the Flask server. It only defines the web addresses (routes);
the real work happens in data.py (statistics) and story.py (AI Story).

Run locally:  python app.py   (listens on http://127.0.0.1:5001)
"""

import os
from datetime import date
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from werkzeug.exceptions import HTTPException

# Read secrets and settings from the .env file in the project root.
# This must happen before anything reads os.environ.
load_dotenv(Path(__file__).parent.parent / ".env")

import data  # noqa: E402  (imported after load_dotenv on purpose)
import story  # noqa: E402
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
    """Shared by the Era Chart and More Statistics endpoints: read team_a, team_b
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


@app.get("/api/stats")
def stats():
    """The record book and the home/away split, for the More Statistics tab.

    Example: /api/stats?team_a=Honduras&team_b=El Salvador&tournament=Gold Cup
    """
    team_a, team_b, matches, counted, tournament = get_filtered_matches()
    return jsonify({
        "team_a": data.team_info(team_a),
        "team_b": data.team_info(team_b),
        "tournament": tournament,
        "matches": len(counted),
        "overview": data.overview(counted, today=date.today()),
        "record_book": data.record_book(team_a, team_b, counted),
        "venues": data.venue_records(team_a, team_b, counted),
        "shootouts": data.shootout_stats(team_a, team_b, counted),
        "competitive_vs_friendly": data.competitive_vs_friendly(counted),
    })


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

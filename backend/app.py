"""
app.py - the Flask server. It only defines the web addresses (routes);
the real work happens in data.py.

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
from config import TOURNAMENT_CATEGORIES  # noqa: E402

app = Flask(__name__)
app.json.ensure_ascii = False  # keep "Copa América" readable in responses

# CORS lets the frontend (a different address) call this backend.
allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*")
CORS(app, origins=[o.strip() for o in allowed_origins.split(",")])


# ---------------------------------------------------------------------------
# Errors: every problem is returned as JSON with a readable message
# ---------------------------------------------------------------------------

class ApiError(Exception):
    """Raise this anywhere to send {"error": message} with a status code."""

    def __init__(self, message, status=400):
        super().__init__(message)
        self.message = message
        self.status = status


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
    """All teams for the picker, plus the tournament filter chips."""
    return jsonify({
        "teams": data.list_teams(),
        "categories": [{"id": cid, "label": label} for cid, label in TOURNAMENT_CATEGORIES],
    })


@app.get("/api/rivalry")
def rivalry():
    """Headline stats and every match between two teams.

    Example: /api/rivalry?team_a=Honduras&team_b=El Salvador
    If the teams never played, total_matches is 0 and matches is empty.
    """
    team_a, team_b = get_team_pair(request.args.get("team_a"), request.args.get("team_b"))
    matches = data.head_to_head(team_a, team_b)
    return jsonify({
        "team_a": {"name": team_a, "code": data.FLAG_CODES.get(team_a)},
        "team_b": {"name": team_b, "code": data.FLAG_CODES.get(team_b)},
        "summary": data.summarize(team_a, team_b, matches),
        "matches": matches,
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)

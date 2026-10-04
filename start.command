#!/bin/bash
# Double-click this file to run Clásico on your own computer.
# It starts the backend (port 5001) and a tiny web server for the
# frontend (port 8000), then opens the app in your browser.
# Close this window (or press Control+C) to stop everything.

cd "$(dirname "$0")"

# First run only: create the Python environment and install the packages.
if [ ! -x backend/.venv/bin/python ]; then
  echo "Setting up for the first time (this takes a minute)..."
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install --quiet -r backend/requirements.txt
fi

# Stop anything left over from a previous run.
lsof -ti tcp:5001 | xargs kill 2>/dev/null
lsof -ti tcp:8000 | xargs kill 2>/dev/null

# Stop both servers when this window closes.
trap 'kill $BACKEND_PID $FRONTEND_PID 2>/dev/null' EXIT

(cd backend && exec .venv/bin/python app.py) &
BACKEND_PID=$!
backend/.venv/bin/python -m http.server 8000 --bind 127.0.0.1 --directory docs >/dev/null 2>&1 &
FRONTEND_PID=$!

sleep 2
open "http://127.0.0.1:8000/index.html"

echo ""
echo "Clásico is running at http://127.0.0.1:8000/index.html"
echo "Leave this window open while you use the app. Close it to stop."
wait

"""
refresh.py - keeps the match data up to date.

Our results come from a public dataset on GitHub that its author updates
every so often. This file checks that dataset shortly after the server
starts and then every few hours. When it has changed, we download the new
files, make sure they are sound, and load them, with no restart needed.

Safety:
  - The copy that ships with the app (backend/data/) is never touched, and
    it is what the server starts with. Downloads go to backend/cache/dataset/.
  - A download that is incomplete, broken, in a different format or
    suspiciously smaller than what we have is thrown away, and the app
    keeps the data it already had.
  - If GitHub can't be reached, nothing changes; we try again next time.

Built for a small host (like Render's free plan):
  - Nothing here runs before the server can answer. All the work happens in
    a background thread, and the first check waits a little so the request
    that woke the server up is answered first.
  - Saved downloads disappear when such a host restarts. That is fine: the
    server starts from the shipped copy and downloads again.
  - If the server runs as several processes ("workers"), only ONE of them
    downloads. The others notice the new copy on disk and load it.
"""

import csv
import fcntl
import json
import os
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

import data
import unusual
from config import (
    DATA_FIRST_CHECK_DELAY_SECONDS,
    DATA_REFRESH_HOURS,
    DATA_SHARE_CHECK_SECONDS,
    DATASET_URL,
)

CACHE_DIR = Path(__file__).parent / "cache"
DOWNLOAD_DIR = CACHE_DIR / "dataset"      # the newest copy we downloaded
INCOMING_DIR = CACHE_DIR / "dataset_new"  # a download being checked
LOCK_FILE = CACHE_DIR / "refresh.lock"    # whoever holds this file's lock does the downloading
ETAGS_FILE = "etags.json"  # GitHub's "version stamp" for each file we downloaded

# The columns each file must have. If the dataset's format ever changes,
# the download is rejected instead of breaking the app.
REQUIRED_COLUMNS = {
    "results.csv": {"date", "home_team", "away_team", "home_score", "away_score", "tournament", "city", "country", "neutral"},
    "goalscorers.csv": {"date", "home_team", "away_team", "team", "scorer", "minute", "own_goal", "penalty"},
    "shootouts.csv": {"date", "home_team", "away_team", "winner", "first_shooter"},
    "former_names.csv": {"current", "former"},
}

_lock = threading.Lock()  # only one check at a time inside this process
_lock_handle = None       # kept open for as long as this process is the downloader
_loaded_stamp = None      # which saved copy this process has in memory
status = {"last_checked": None, "last_updated": None, "result": "not checked yet", "role": "starting"}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _saved_etags():
    try:
        with open(DOWNLOAD_DIR / ETAGS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _saved_copy_stamp():
    """Something that changes whenever a new copy is saved (None if there is none)."""
    try:
        return (DOWNLOAD_DIR / ETAGS_FILE).stat().st_mtime_ns
    except FileNotFoundError:
        return None


def _check_format(folder):
    """Make sure all four files are there with the columns we rely on, and
    return how many played matches results.csv has. Raises ValueError if not."""
    for name, needed in REQUIRED_COLUMNS.items():
        with open(folder / name, newline="", encoding="utf-8") as f:
            columns = set(next(csv.reader(f), []))
        if not needed <= columns:
            raise ValueError(f"{name} is missing columns: {sorted(needed - columns)}")
    with open(folder / "results.csv", newline="", encoding="utf-8") as f:
        return sum(1 for row in csv.DictReader(f) if row["home_score"].isdigit() and row["away_score"].isdigit())


def load_saved_copy():
    """Load the newest copy saved on disk, if it is sound and not older than
    what we have. Used at startup, and by workers that don't download
    themselves. Returns True if it loaded something new."""
    global _loaded_stamp
    stamp = _saved_copy_stamp()
    if stamp is None or stamp == _loaded_stamp:
        return False
    try:
        if _check_format(DOWNLOAD_DIR) >= len(data.MATCHES) * 0.98:
            data.load_dataset(DOWNLOAD_DIR)
            unusual.reset()
            _loaded_stamp = stamp
            return True
    except Exception:  # damaged or half-written: ignore it and keep what we have
        pass
    return False


def check_for_update():
    """Ask GitHub whether the dataset changed; if so, download and load it.
    Returns a short sentence saying what happened. Never raises an error."""
    with _lock:
        status["last_checked"] = _now()
        try:
            result = _check()
        except Exception as err:  # network, disk, or a file in an unexpected format
            shutil.rmtree(INCOMING_DIR, ignore_errors=True)
            result = f"could not update ({type(err).__name__}: {str(err)[:80]}); keeping the data we have"
        status["result"] = result
        return result


def _check():
    global _loaded_stamp
    headers = {"User-Agent": "ClasicoApp/1.0 (student project)"}
    etags = _saved_etags()

    # 1. Has anything changed? Sending the stamp of the version we have lets
    #    GitHub answer "304 Not Modified" without sending the file again.
    changed = False
    for name in data.DATASET_FILES:
        ask = {**headers, "If-None-Match": etags[name]} if name in etags else headers
        response = httpx.get(DATASET_URL + name, headers=ask, timeout=30, follow_redirects=True)
        if response.status_code != 304:
            response.raise_for_status()
            changed = True
    if not changed:
        return "the dataset has not changed"

    # 2. Download all four files together, so they always match each other.
    shutil.rmtree(INCOMING_DIR, ignore_errors=True)
    INCOMING_DIR.mkdir(parents=True)
    new_etags = {}
    for name in data.DATASET_FILES:
        response = httpx.get(DATASET_URL + name, headers=headers, timeout=60, follow_redirects=True)
        response.raise_for_status()
        (INCOMING_DIR / name).write_bytes(response.content)
        if response.headers.get("ETag"):
            new_etags[name] = response.headers["ETag"]

    # 3. Is it sound? Right columns, and not far fewer matches than we have
    #    (the dataset only ever grows, so fewer means a bad download).
    before = len(data.MATCHES)
    after = _check_format(INCOMING_DIR)
    if after < before * 0.98:
        shutil.rmtree(INCOMING_DIR, ignore_errors=True)
        return f"the download looked wrong ({after} matches, we have {before}); keeping the data we have"

    # 4. Load it. load_dataset() changes nothing if any file turns out broken.
    old_latest = data.latest_match_date()
    data.load_dataset(INCOMING_DIR)

    # 5. Keep it as our newest copy (other workers will pick it up from
    #    there), and forget lists computed from the old data.
    with open(INCOMING_DIR / ETAGS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_etags, f)
    shutil.rmtree(DOWNLOAD_DIR, ignore_errors=True)
    INCOMING_DIR.rename(DOWNLOAD_DIR)
    _loaded_stamp = _saved_copy_stamp()
    unusual.reset()

    if after == before and data.latest_match_date() == old_latest:
        return "downloaded the current dataset; it has the same matches we had"
    status["last_updated"] = _now()
    return f"updated: {after - before} new matches, newest is now {data.latest_match_date()}"


def _try_to_become_downloader():
    """Only one process may download. Whoever manages to lock LOCK_FILE is
    it; the lock is released automatically if that process stops."""
    global _lock_handle
    if _lock_handle is not None:
        return True
    CACHE_DIR.mkdir(exist_ok=True)
    handle = open(LOCK_FILE, "a")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:  # another process already holds it
        handle.close()
        return False
    _lock_handle = handle  # keep the file open: closing it would give the lock up
    return True


def _background_loop():
    # Wait a little first, so the request that woke the server is served
    # before we start downloading and parsing.
    time.sleep(DATA_FIRST_CHECK_DELAY_SECONDS)
    next_download_check = 0
    while True:
        try:
            # Start from the newest copy already saved on disk, if there is one.
            load_saved_copy()
            if _try_to_become_downloader():
                status["role"] = "downloader"
                if time.time() >= next_download_check:
                    print(f"Dataset check (process {os.getpid()}):", check_for_update(), flush=True)
                    next_download_check = time.time() + DATA_REFRESH_HOURS * 3600
            else:
                # Another worker downloads. We just load what it saves.
                status["role"] = "follower"
                status["result"] = f"another worker downloads; this one has data up to {data.latest_match_date()}"
        except Exception as err:  # e.g. the cache folder can't be written: say so and keep trying
            status["result"] = f"the update check could not run ({type(err).__name__}: {str(err)[:120]}); keeping the data we have"
            print("Dataset check:", status["result"], flush=True)
        time.sleep(DATA_SHARE_CHECK_SECONDS)


def start():
    """Called once when the server starts. Returns immediately: everything
    else happens in a background thread."""
    threading.Thread(target=_background_loop, daemon=True).start()

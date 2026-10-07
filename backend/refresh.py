"""
refresh.py - keeps the match data up to date.

Our results come from a public dataset on GitHub that its author updates
every so often. This file checks that dataset when the server starts and
then every few hours. When it has changed, we download the new files, make
sure they are sound, and load them, with no restart needed.

Safety:
  - The copy that ships with the app (backend/data/) is never touched.
    Downloads go to backend/cache/dataset/.
  - A download that is incomplete, broken or suspiciously smaller than what
    we have is thrown away, and the app keeps the data it already had.
  - If GitHub can't be reached, nothing changes; we try again next time.
"""

import csv
import json
import shutil
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

import data
import unusual
from config import DATA_REFRESH_HOURS, DATASET_URL

DOWNLOAD_DIR = Path(__file__).parent / "cache" / "dataset"      # the newest copy we downloaded
INCOMING_DIR = Path(__file__).parent / "cache" / "dataset_new"  # a download being checked
ETAGS_FILE = "etags.json"  # GitHub's "version stamp" for each file we downloaded

_lock = threading.Lock()  # only one check at a time
status = {"last_checked": None, "last_updated": None, "result": "not checked yet"}


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _saved_etags():
    try:
        with open(DOWNLOAD_DIR / ETAGS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _count_played(folder):
    """How many played matches results.csv has (also proves it can be read)."""
    with open(folder / "results.csv", newline="", encoding="utf-8") as f:
        return sum(1 for row in csv.DictReader(f) if row["home_score"].isdigit() and row["away_score"].isdigit())


def load_newest_saved_copy():
    """When the server starts: use the newest copy we downloaded earlier, if
    there is one and it loads. Otherwise keep the copy that ships with the app."""
    if all((DOWNLOAD_DIR / name).exists() for name in data.DATASET_FILES):
        try:
            if _count_played(DOWNLOAD_DIR) >= len(data.MATCHES):
                data.load_dataset(DOWNLOAD_DIR)
                unusual.reset()
        except Exception:  # a damaged download: ignore it, the shipped copy is already loaded
            pass


def check_for_update():
    """Ask GitHub whether the dataset changed; if so, download and load it.
    Returns a short sentence saying what happened. Never raises an error."""
    with _lock:
        status["last_checked"] = _now()
        try:
            result = _check()
        except (httpx.HTTPError, OSError, ValueError, KeyError, csv.Error) as err:
            result = f"could not update ({type(err).__name__}); keeping the data we have"
        status["result"] = result
        return result


def _check():
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

    # 3. Is it sound? The dataset only ever grows, so far fewer matches than
    #    we already have means something went wrong with the download.
    before = len(data.MATCHES)
    after = _count_played(INCOMING_DIR)
    if after < before * 0.98:
        shutil.rmtree(INCOMING_DIR, ignore_errors=True)
        return f"the download looked wrong ({after} matches, we have {before}); keeping the data we have"

    # 4. Load it. load_dataset() changes nothing if any file turns out broken.
    old_latest = data.latest_match_date()
    data.load_dataset(INCOMING_DIR)

    # 5. Keep it as our newest copy, and forget lists computed from the old data.
    with open(INCOMING_DIR / ETAGS_FILE, "w", encoding="utf-8") as f:
        json.dump(new_etags, f)
    shutil.rmtree(DOWNLOAD_DIR, ignore_errors=True)
    INCOMING_DIR.rename(DOWNLOAD_DIR)
    data.LOADED_FROM = DOWNLOAD_DIR
    unusual.reset()

    if after == before and data.latest_match_date() == old_latest:
        return "downloaded the current dataset; it has the same matches we had"
    status["last_updated"] = _now()
    return f"updated: {after - before} new matches, newest is now {data.latest_match_date()}"


def start():
    """Called once when the server starts: load the newest saved copy, then
    keep checking for updates in the background, forever."""
    load_newest_saved_copy()

    def keep_checking():
        while True:
            print("Dataset check:", check_for_update(), flush=True)
            time.sleep(DATA_REFRESH_HOURS * 3600)

    threading.Thread(target=keep_checking, daemon=True).start()

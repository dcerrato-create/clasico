"""
gunicorn.conf.py - how the backend runs on a host (gunicorn reads this file
automatically when it is started from the backend folder: gunicorn app:app).

One process with several threads, on purpose:
  - Memory: each process holds its own copy of the dataset (about 100 MB),
    and a small free host only has 512 MB.
  - The AI Story rate limit and the "this story is already being written"
    check live in memory, so they only work if every request is handled by
    the same process.
  - Threads let the server answer other visitors while one AI Story streams.
"""

workers = 1
threads = 8
timeout = 120  # seconds; an AI Story can take a while to stream

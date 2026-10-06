// api.js - the only file that talks to the backend.
// Every failure becomes an ApiError with a message that is safe to show.

class ApiError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message);
    this.status = status;   // HTTP status from the backend (0 if none)
    this.offline = offline; // true when the backend could not be reached
  }
}

const OFFLINE_MESSAGE =
  "Can't reach the Clásico server right now. Make sure the backend is running, then try again.";

async function apiRequest(path, options = {}) {
  // Give up after 30 seconds instead of waiting forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  let response;
  try {
    response = await fetch(BACKEND_URL + path, { ...options, signal: controller.signal });
  } catch (err) {
    // fetch only throws when there is no answer at all (server down, no wifi).
    throw new ApiError(OFFLINE_MESSAGE, { offline: true });
  } finally {
    clearTimeout(timer);
  }

  let body = null;
  try {
    body = await response.json();
  } catch (err) {
    // Not JSON: fall through to the generic message below.
  }

  if (!response.ok) {
    const message = (body && body.error) || "The server had a problem. Please try again.";
    throw new ApiError(message, { status: response.status });
  }
  if (body === null) {
    throw new ApiError("The server sent an answer we couldn't read. Please try again.");
  }
  return body;
}

function apiGet(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  return apiRequest(query ? `${path}?${query}` : path);
}

function apiPost(path, data) {
  return apiRequest(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

// For answers that arrive bit by bit (the AI Story). The backend sends one
// small JSON object per line; onEvent(object) is called for each line as it
// arrives. `signal` comes from an AbortController, so the caller can cancel.
// If the backend answers with ordinary JSON instead, that object is returned.
async function apiStream(path, data, signal, onEvent) {
  let response;
  try {
    response = await fetch(BACKEND_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw err; // we cancelled it ourselves
    throw new ApiError(OFFLINE_MESSAGE, { offline: true });
  }

  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch (err) {
      // Not JSON: use the generic message below.
    }
    const message = (body && body.error) || "The server had a problem. Please try again.";
    throw new ApiError(message, { status: response.status });
  }

  const type = response.headers.get("Content-Type") || "";
  if (!type.includes("ndjson")) return response.json();

  // Read the stream chunk by chunk and hand over every complete line.
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let unfinished = ""; // the end of a chunk can stop in the middle of a line
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    unfinished += decoder.decode(value, { stream: true });
    const lines = unfinished.split("\n");
    unfinished = lines.pop();
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line));
    }
  }
  return null;
}

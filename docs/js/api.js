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

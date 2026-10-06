// main.js - starts the app and connects the pieces together.

// Everything the page currently knows.
const state = {
  teams: [],       // [{ name, code, colors, aliases }] from /api/teams
  rivalry: null,   // the last /api/rivalry answer
  requestId: 0,    // lets us ignore answers to old requests
};

const dom = {
  form: document.getElementById("picker-form"),
  goButton: document.getElementById("go-button"),
  skipToggle: document.getElementById("skip-toggle"),
  skipAnimation: document.getElementById("skip-animation"),
  message: document.getElementById("message"),
  banner: document.getElementById("server-banner"),
  bannerText: document.getElementById("server-banner-text"),
  bannerRetry: document.getElementById("server-retry"),
  featured: document.getElementById("featured"),
  fierce: document.getElementById("fierce"),
  result: document.getElementById("result"),
};

let pickerA;
let pickerB;

// Copy the COLORS from config.js into CSS variables, so the stylesheet
// and the chart both use the same colors.
function applyColors() {
  const names = {
    background: "--bg", navy: "--navy", surface: "--surface", text: "--text",
    muted: "--muted", accent: "--accent", draw: "--draw",
  };
  for (const [key, cssName] of Object.entries(names)) {
    if (COLORS[key]) document.documentElement.style.setProperty(cssName, COLORS[key]);
  }
  document.documentElement.style.setProperty("--era-faded", ERA_CHART.fadedSide);
}

function showMessage(text) {
  dom.message.textContent = text;
  dom.message.hidden = false;
}

function clearMessage() {
  dom.message.hidden = true;
}

// Load the team list. If the backend is down, show the banner instead.
async function loadTeams() {
  dom.bannerRetry.disabled = true;
  try {
    const data = await apiGet("/api/teams");
    // Keep the same array object: the pickers hold a reference to it.
    state.teams.length = 0;
    state.teams.push(...data.teams);
    dom.banner.hidden = true;
  } catch (err) {
    dom.bannerText.textContent = err.message;
    dom.banner.hidden = false;
  }
  dom.bannerRetry.disabled = false;
  renderFeatured(dom.featured, FEATURED_CLASICOS, state.teams, pickRivalry);
  renderFeatured(dom.fierce, FIERCE_RIVALRIES, state.teams, pickRivalry);
  return state.teams.length > 0;
}

// Put two teams in the pickers and show their rivalry.
function pickRivalry(teamA, teamB) {
  pickerA.setValue(teamA);
  pickerB.setValue(teamB);
  showRivalry();
}

// Remember the matchup in the address bar so the page can be shared.
function updateAddress(teamA, teamB) {
  try {
    const query = new URLSearchParams({ a: teamA, b: teamB });
    history.replaceState(null, "", `?${query}`);
  } catch (err) {
    // Some browsers block this for local files. It's only a nicety.
  }
}

async function showRivalry() {
  const teamA = pickerA.getValue();
  const teamB = pickerB.getValue();
  clearMessage();

  // Catch the obvious mistakes before bothering the server.
  if (!teamA || !teamB) {
    showMessage("Pick two teams to see their rivalry.");
    return;
  }
  if (normalizeText(teamA) === normalizeText(teamB)) {
    showMessage("Pick two different teams. A team can't play itself.");
    return;
  }

  const requestId = ++state.requestId;
  dom.goButton.disabled = true;
  dom.goButton.textContent = "Loading…";
  try {
    // The team list may be missing if the backend was down when the page opened.
    if (state.teams.length === 0) await loadTeams();
    const data = await apiGet("/api/rivalry", { team_a: teamA, team_b: teamB });
    if (requestId !== state.requestId) return; // a newer request replaced this one

    state.rivalry = data;
    // The backend may correct the names (e.g. "usa" -> "United States").
    pickerA.setValue(data.team_a.name);
    pickerB.setValue(data.team_b.name);
    updateAddress(data.team_a.name, data.team_b.name);
    renderRivalry(data);
  } catch (err) {
    if (requestId !== state.requestId) return;
    dom.result.hidden = true;
    showMessage(err.message);
  } finally {
    if (requestId === state.requestId) {
      dom.goButton.disabled = false;
      dom.goButton.textContent = "Show the rivalry";
    }
  }
}

// Draw everything for one rivalry.
function renderRivalry(data) {
  dom.result.hidden = false;
  dom.result.replaceChildren();

  // Each team wears its own color everywhere on the page (see colors.js).
  const teamColors = pickTeamColors(data.team_a, data.team_b);
  document.documentElement.style.setProperty("--team-a", teamColors.a);
  document.documentElement.style.setProperty("--team-b", teamColors.b);

  // "Skip animation" swaps the full-screen clash for a quick one in the card.
  const quick = dom.skipAnimation.checked;
  renderReveal(dom.result, data, teamColors, quick); // clash + flags + headline
  // The first rivalry always gets the full clash; after it, offer the checkbox.
  dom.skipToggle.hidden = false;
  if (data.summary.total_matches > 0) {
    renderStory(dom.result, data);
    renderExplore(dom.result, data, teamColors);
  }
  // Jump there right away: the clash covers the screen while this happens,
  // and the big flags need to know where the small ones ended up.
  dom.result.scrollIntoView({ behavior: "instant", block: "start" });
}

async function init() {
  applyColors();
  pickerA = createTeamPicker(document.getElementById("combo-a"), state.teams);
  pickerB = createTeamPicker(document.getElementById("combo-b"), state.teams);

  dom.form.addEventListener("submit", (event) => {
    event.preventDefault();
    showRivalry();
  });
  dom.bannerRetry.addEventListener("click", loadTeams);

  await loadTeams();

  // "Recent Games per Country": clicking one of a team's games opens that rivalry.
  createRecentSection(state.teams, pickRivalry);

  // Open a shared link like index.html?a=Argentina&b=Brazil
  const params = new URLSearchParams(location.search);
  if (params.get("a") && params.get("b")) {
    pickRivalry(params.get("a"), params.get("b"));
  }
}

init();

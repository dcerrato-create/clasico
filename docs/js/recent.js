// recent.js - "Recent Games per Country", at the bottom of the home screen.
//
// The rest of the app is about TWO teams. This section starts from one:
// pick a country, see its latest games, and click a game to open the rivalry
// with that opponent. So it is another way into a clásico, not a separate page.

// Sets up the section. `teams` is the team list from main.js and
// onPickRivalry(teamA, teamB) opens a rivalry (the same function the
// featured cards use). Returns { reset } for the Home button.
function createRecentSection(teams, onPickRivalry) {
  const form = document.getElementById("recent-form");
  const results = document.getElementById("recent-results");
  let requestId = 0; // lets us ignore answers that arrive too late

  // One game, as a button that opens the rivalry with that opponent.
  function buildRow(team, match, teamColor, index) {
    const row = makeEl("button", "recent-row");
    row.type = "button";
    row.style.animationDelay = `${reducedMotion ? 0 : index * 60}ms`;
    row.title = `Open ${team.name} vs ${match.opponent.name}`;

    // W, D or L. A win wears the team's own color.
    const letter = { win: "W", draw: "D", loss: "L" }[match.result];
    const badge = makeEl("span", `recent-result ${match.result}`, letter);
    if (match.result === "win") badge.style.background = teamColor;
    badge.setAttribute("aria-label", match.result);

    const score = makeEl("span", "recent-score", `${match.goals_for}–${match.goals_against}`);

    // "vs" at home or on neutral ground, "at" when playing away.
    const opponent = makeEl("span", "recent-opponent");
    opponent.append(makeEl("span", "recent-vs", match.venue === "away" ? "at" : "vs"),
      createFlag(match.opponent), match.opponent.name);

    let details = `${formatDate(match.date)} · ${match.tournament} · ${match.city}`;
    if (match.shootout_winner) details += ` · ${match.shootout_winner} won on penalties`;

    const info = makeEl("span", "recent-info");
    info.append(opponent, makeEl("span", "recent-details", details));
    row.append(badge, score, info, makeEl("span", "recent-go", "See the rivalry →"));
    row.addEventListener("click", () => onPickRivalry(team.name, match.opponent.name));
    return row;
  }

  // Ask the backend for one team's latest games and list them.
  async function show(teamName) {
    const thisRequest = ++requestId;
    if (!teamName) {
      results.replaceChildren(makeEl("p", "recent-status", "Type a country's name first."));
      return;
    }
    results.replaceChildren(makeEl("p", "recent-status", "Loading the latest games…"));

    try {
      const answer = await apiGet("/api/recent", { team: teamName, limit: RECENT.gamesShown });
      if (thisRequest !== requestId) return; // a newer request replaced this one
      picker.setValue(answer.team.name); // the backend may correct "usa" to "United States"

      // The team's own color, used for the W badges (see colors.js).
      const teamColor = makeVisible((answer.team.colors && answer.team.colors[0]) || COLORS.fallbackTeamA);

      const heading = makeEl("p", "recent-heading");
      heading.append(createFlag(answer.team), `${answer.team.name}: last ${answer.matches.length} ` +
        `${answer.matches.length === 1 ? "game" : "games"}`);
      const list = makeEl("div", "recent-list");
      answer.matches.forEach((match, index) => list.append(buildRow(answer.team, match, teamColor, index)));
      results.replaceChildren(heading, list);
    } catch (err) {
      if (thisRequest !== requestId) return;
      // Error state: the reason, plus a way to try again when the server is the problem.
      const message = makeEl("p", "recent-status recent-error", `${err.message} `);
      if (err.offline) {
        const retry = makeEl("button", "secondary", "Try again");
        retry.type = "button";
        retry.addEventListener("click", () => show(teamName));
        message.append(retry);
      }
      results.replaceChildren(message);
    }
  }

  // The same searchable dropdown as the main picker. Choosing a team from
  // the list shows its games right away; pressing Enter does the same.
  const picker = createTeamPicker(document.getElementById("combo-recent"), teams, (team) => show(team.name));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    show(picker.getValue());
  });

  // Back to how the section looks when the page opens (used by the Home button).
  function reset() {
    requestId++; // ignore any answer that is still on its way
    picker.setValue(RECENT.defaultTeam);
    results.replaceChildren();
    if (RECENT.defaultTeam) show(RECENT.defaultTeam);
  }

  reset();
  return { reset };
}

// helpers.js - small tools shared by the other files.

// True when the visitor's device asks for less motion; animations are then skipped.
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Wait this many milliseconds (not at all with reduced motion).
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, reducedMotion ? 0 : ms));
}

// Make an element with a class and (optional) text.
function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

// Make a button that runs onClick when it is pressed.
function makeButton(className, text, onClick) {
  const button = makeEl("button", className, text);
  button.type = "button"; // a plain button: it never submits the team picker form
  button.addEventListener("click", onClick);
  return button;
}

// A small round dot in the given color (legends, lists, match details).
function makeDot(color) {
  const dot = makeEl("span", "dot");
  dot.style.background = color;
  return dot;
}

// The three-part bar: Team A, draws, Team B, each as wide as its share.
// `record` holds a_wins, draws and b_wins; a part with nothing is left out.
// drawColor is optional (the stylesheet's gray is used without it).
function makeRecordBar(record, className, drawColor) {
  const bar = makeEl("div", `record-bar ${className}`);
  bar.setAttribute("aria-hidden", "true");
  for (const [kind, count] of [["a", record.a_wins], ["d", record.draws], ["b", record.b_wins]]) {
    if (count === 0) continue;
    const segment = makeEl("span", `segment ${kind}`);
    segment.style.flexGrow = count;
    if (kind === "d" && drawColor) segment.style.background = drawColor;
    bar.append(segment);
  }
  return bar;
}

// An error message as a paragraph, with a "Try again" button after it when
// onRetry is given.
function makeErrorLine(className, message, onRetry) {
  const line = makeEl("p", className, `${message} `);
  if (onRetry) line.append(makeButton("secondary", "Try again", onRetry));
  return line;
}

// The team with this name from the backend's list. If it isn't there (the
// list didn't load, or a name in config.js is misspelled) we still return
// something that can be drawn: the name, with no flag.
function findTeam(teams, name) {
  return teams.find((team) => team.name === name) || { name, code: null };
}

// Lowercase and remove accents so "curacao" finds "Curaçao".
function normalizeText(text) {
  return text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// "1969-06-08" -> "8 Jun 1969"
function formatDate(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[month - 1]} ${year}`;
}

// "Honduras 2–1 El Salvador", in the order the match was played (home first)
function scoreLine(match) {
  return `${match.home_team} ${match.home_score}–${match.away_score} ${match.away_team}`;
}

// The Era Chart and More Statistics tabs load their data the same way. This
// builds their show(tournamentId, tournamentLabel) function, which:
//   - writes what is being shown into `subtitle`,
//   - asks the backend at `path` once per tournament and remembers the answer,
//   - puts "loading" and "try again" messages inside `target`,
//   - and calls draw(answer) when the answer is in (onError() if it failed).
function makeTournamentLoader({ path, teamA, teamB, subtitle, target, loadingText, draw, onError }) {
  const answers = new Map(); // tournament id -> backend answer, so we ask once
  let requestId = 0;         // lets us ignore answers that arrive too late

  return async function show(tournamentId, tournamentLabel) {
    const thisRequest = ++requestId;
    subtitle.textContent = tournamentId === "all"
      ? `All matches between ${teamA} and ${teamB}`
      : `${tournamentLabel} only`;

    try {
      if (!answers.has(tournamentId)) {
        target.replaceChildren(makeEl("p", "era-status", loadingText));
        const answer = await apiGet(path, { team_a: teamA, team_b: teamB, tournament: tournamentId });
        answers.set(tournamentId, answer);
      }
      if (thisRequest !== requestId) return; // a newer request replaced this one
      draw(answers.get(tournamentId));
    } catch (err) {
      if (thisRequest !== requestId) return;
      // Error state: the reason plus a button to try again.
      target.replaceChildren(
        makeErrorLine("era-status era-error", err.message, () => show(tournamentId, tournamentLabel)));
      if (onError) onError();
    }
  };
}

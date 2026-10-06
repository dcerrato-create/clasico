// stats.js - the More Statistics tab.
//
// Two sections, both computed by the backend (/api/stats) from match results,
// so they are complete for every rivalry:
//   1. Record Book   - biggest win for each side, highest-scoring match,
//                      longest winning and unbeaten streaks
//   2. Home and Away - the record at each team's home and on neutral ground

// "5 Jun 1993 – 12 Oct 1997", or one date when the streak was a single match
function streakDates(streak) {
  return streak.start === streak.end
    ? formatDate(streak.start)
    : `${formatDate(streak.start)} – ${formatDate(streak.end)}`;
}

// Builds the tab inside `panel`. Returns { show } - call show() whenever the
// tab opens or the tournament filter changes.
function createStatsTab(panel, data, colors) {
  const teamA = data.team_a.name;
  const teamB = data.team_b.name;

  const answers = new Map(); // tournament id -> backend answer, so we ask once
  let requestId = 0;         // lets us ignore answers that arrive too late

  const title = makeEl("h3", "era-title", "More Statistics");
  const subtitle = makeEl("p", "era-subtitle");
  const body = makeEl("div", "stats-body");
  panel.append(title, subtitle, body);

  // One card. `color` is the stripe down its left side (a team's color, or
  // gray when the record belongs to neither team). Cards rise in one by one.
  let cardCount = 0;
  function makeCard(heading, color) {
    const card = makeEl("div", "stat-card");
    card.style.borderLeftColor = color;
    card.style.animationDelay = `${reducedMotion ? 0 : cardCount++ * 90}ms`;
    card.append(makeEl("p", "stat-heading", heading));
    return card;
  }

  // A record that is one match: "Honduras 5-0 El Salvador" plus when and where.
  function matchCard(heading, match, color, nothingText) {
    const card = makeCard(heading, color);
    if (!match) {
      card.append(makeEl("p", "stat-none", nothingText));
      return card;
    }
    card.append(
      makeEl("p", "stat-value", match.score.replace(/(\d+)-(\d+)/, "$1–$2")), // nicer dash in the score
      makeEl("p", "stat-note", `${formatDate(match.date)} · ${match.tournament} · ${match.city}`)
    );
    return card;
  }

  // A record that is a streak: "6 matches in a row" plus the dates it covered.
  function streakCard(heading, streak, color, word) {
    const card = makeCard(heading, color);
    if (!streak) {
      card.append(makeEl("p", "stat-none", "Never happened"));
      return card;
    }
    const value = makeEl("p", "stat-value");
    value.append(makeEl("strong", "stat-number", String(streak.length)),
      streak.length === 1 ? ` ${word.one}` : ` ${word.many} in a row`);
    card.append(value, makeEl("p", "stat-note", streakDates(streak)));
    return card;
  }

  // One venue: its record as a bar and as colored text, plus the goals.
  function venueCard(venue) {
    const color = venue.id === "home_a" ? colors.a : venue.id === "home_b" ? colors.b : colors.draw;
    const card = makeCard(venue.label, color);
    if (venue.matches === 0) {
      card.append(makeEl("p", "stat-none", "No matches"));
      return card;
    }

    // The same three-part bar as the headline: Team A, draws, Team B.
    const bar = makeEl("div", "record-bar venue-bar");
    bar.setAttribute("aria-hidden", "true");
    for (const [kind, count] of [["a", venue.a_wins], ["d", venue.draws], ["b", venue.b_wins]]) {
      if (count === 0) continue;
      const segment = makeEl("span", `segment ${kind}`);
      segment.style.flexGrow = count;
      bar.append(segment);
    }

    card.append(
      makeEl("p", "stat-note", venue.matches === 1 ? "1 match" : `${venue.matches} matches`),
      bar,
      buildRecordLine("", venue, teamA, teamB, colors),
      makeEl("p", "stat-note", `Goals: ${teamA} ${venue.a_goals} – ${venue.b_goals} ${teamB}`)
    );
    return card;
  }

  function draw(answer) {
    cardCount = 0;
    body.replaceChildren();
    const book = answer.record_book;

    const records = makeEl("div", "stat-grid");
    records.append(
      matchCard(`Biggest ${teamA} win`, book.biggest_a_win, colors.a, `${teamA} has never won`),
      matchCard(`Biggest ${teamB} win`, book.biggest_b_win, colors.b, `${teamB} has never won`),
      streakCard(`${teamA}: longest winning streak`, book.a_winning_streak, colors.a, { one: "win", many: "wins" }),
      streakCard(`${teamB}: longest winning streak`, book.b_winning_streak, colors.b, { one: "win", many: "wins" }),
      streakCard(`${teamA}: longest unbeaten streak`, book.a_unbeaten_streak, colors.a, { one: "match unbeaten", many: "matches unbeaten" }),
      streakCard(`${teamB}: longest unbeaten streak`, book.b_unbeaten_streak, colors.b, { one: "match unbeaten", many: "matches unbeaten" })
    );

    // The highest-scoring match belongs to both teams, so it spans the row.
    const highest = matchCard("Highest-scoring match", book.highest_scoring, colors.draw, "No matches");
    highest.classList.add("wide");
    if (book.highest_scoring) {
      const goals = book.highest_scoring.goals;
      highest.querySelector(".stat-value").append(makeEl("span", "stat-extra", ` · ${goals} ${goals === 1 ? "goal" : "goals"}`));
    }
    records.prepend(highest);

    const venues = makeEl("div", "stat-grid venues");
    for (const venue of answer.venues) venues.append(venueCard(venue));

    body.append(
      makeEl("h4", "stat-section", "Record Book"), records,
      makeEl("h4", "stat-section", "Home and Away"),
      makeEl("p", "stat-section-note", "Where the matches were played. Matches at a third country's ground count as neutral."),
      venues
    );
  }

  // Ask the backend for the statistics (once per tournament) and draw them.
  async function show(tournamentId, tournamentLabel) {
    const thisRequest = ++requestId;
    subtitle.textContent = tournamentId === "all"
      ? `All matches between ${teamA} and ${teamB}`
      : `${tournamentLabel} only`;

    try {
      if (!answers.has(tournamentId)) {
        body.replaceChildren(makeEl("p", "era-status", "Loading the statistics…"));
        const answer = await apiGet("/api/stats", { team_a: teamA, team_b: teamB, tournament: tournamentId });
        answers.set(tournamentId, answer);
      }
      if (thisRequest !== requestId) return; // a newer request replaced this one
      draw(answers.get(tournamentId));
    } catch (err) {
      if (thisRequest !== requestId) return;
      // Error state: the reason plus a button to try again.
      const retry = makeEl("button", "secondary", "Try again");
      retry.type = "button";
      retry.addEventListener("click", () => show(tournamentId, tournamentLabel));
      const message = makeEl("p", "era-status era-error", `${err.message} `);
      message.append(retry);
      body.replaceChildren(message);
    }
  }

  return { show };
}

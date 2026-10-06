// stats.js - the More Statistics tab.
//
// Everything here is computed by the backend (/api/stats) from match results,
// so it is complete for every rivalry. The subsections, in the order set by
// STATS.order in config.js:
//   overview     - record with percentages, goals per game, clean sheets,
//                  last meeting
//   record_book  - biggest wins, highest-scoring match, streaks, most common score
//   venues       - the record at each team's home and on neutral ground
//   shootouts    - penalty shootouts
//   competitive  - competitive matches compared with friendlies

// "5 Jun 1993 – 12 Oct 1997", or one date when the streak was a single match
function streakDates(streak) {
  return streak.start === streak.end
    ? formatDate(streak.start)
    : `${formatDate(streak.start)} – ${formatDate(streak.end)}`;
}

// "Honduras 5-0 El Salvador" -> "Honduras 5–0 El Salvador" (nicer dash in the score)
function niceScore(score) {
  return score.replace(/(\d+)-(\d+)/, "$1–$2");
}

// A percentage that shows the count behind it when hovered or tapped,
// for example "49%" -> "39 of 80". When there is nothing to divide by the
// backend sends null, and we show a dash instead of a broken number.
function makePercent(percent, count, total) {
  if (percent === null || percent === undefined) return makeEl("span", "pct none", "–");
  const el = makeEl("span", "pct", `${percent}%`);
  el.tabIndex = 0; // lets a tap (or the keyboard) focus it, which shows the count
  el.dataset.tip = `${count} of ${total}`;
  el.setAttribute("aria-label", `${percent}% (${count} of ${total})`);
  return el;
}

// Builds the tab inside `panel`. Returns { show } - call show() whenever the
// tab opens or the tournament filter changes.
function createStatsTab(panel, data, teamColors) {
  const teamA = data.team_a.name;
  const teamB = data.team_b.name;
  const colors = { a: teamColors.a, b: teamColors.b, draw: STATS.drawColor };

  const answers = new Map(); // tournament id -> backend answer, so we ask once
  let requestId = 0;         // lets us ignore answers that arrive too late

  const title = makeEl("h3", "era-title", "More Statistics");
  const subtitle = makeEl("p", "era-subtitle");
  const body = makeEl("div", "stats-body");
  panel.append(title, subtitle, body);

  // ---------------------------------------------------------------------
  // Building blocks
  // ---------------------------------------------------------------------

  // One card. `color` is the stripe down its left side (a team's color, or
  // gray when the record belongs to neither team). Cards rise in one by one.
  let cardCount = 0;
  function makeCard(heading, color) {
    const card = makeEl("div", "stat-card");
    card.style.borderLeftColor = color;
    card.style.animationDelay = `${reducedMotion ? 0 : cardCount++ * STATS.cardStagger}ms`;
    card.append(makeEl("p", "stat-heading", heading));
    return card;
  }

  // A record that is one match: "Honduras 5–0 El Salvador" plus when and where.
  function matchCard(heading, match, color, nothingText) {
    const card = makeCard(heading, color);
    if (!match) {
      card.append(makeEl("p", "stat-none", nothingText));
      return card;
    }
    card.append(
      makeEl("p", "stat-value", niceScore(match.score)),
      makeEl("p", "stat-note", `${formatDate(match.date)} · ${match.tournament} · ${match.city}`)
    );
    return card;
  }

  // A record that is a streak: "6 wins in a row" plus the dates it covered.
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

  // The three-part bar: Team A, draws, Team B, sized by their counts.
  // With grow = true it sweeps in from the left when the card appears.
  function makeBar(record, grow) {
    const bar = makeEl("div", `record-bar venue-bar${grow ? " grow" : ""}`);
    bar.setAttribute("aria-hidden", "true");
    bar.style.animationDuration = `${STATS.barGrowTime}ms`;
    for (const [kind, count] of [["a", record.a_wins], ["d", record.draws], ["b", record.b_wins]]) {
      if (count === 0) continue;
      const segment = makeEl("span", `segment ${kind}`);
      segment.style.flexGrow = count;
      if (kind === "d") segment.style.background = colors.draw;
      bar.append(segment);
    }
    return bar;
  }

  // "Honduras 49% · Draws 29% · El Salvador 22%". Each percentage shows its
  // count ("39 of 80") on hover or tap.
  function percentLine(record) {
    const line = makeEl("p", "pct-line");
    const parts = [
      [teamA, record.a_pct, record.a_wins],
      ["Draws", record.draws_pct, record.draws],
      [teamB, record.b_pct, record.b_wins],
    ];
    parts.forEach(([name, percent, count], index) => {
      if (index > 0) line.append(makeEl("span", "pct-dot", " · "));
      const part = makeEl("span", "pct-part", `${name} `);
      part.append(makePercent(percent, count, record.matches));
      line.append(part);
    });
    return line;
  }

  // A record as a card: match count, bar, "Team 15 – Draws 9 – Team 1",
  // the percentages, and (for venues) the goals.
  function recordCard(heading, record, color, { showGoals = false } = {}) {
    const card = makeCard(heading, color);
    if (record.matches === 0) {
      card.append(makeEl("p", "stat-none", "No matches"));
      return card;
    }
    card.append(
      makeEl("p", "stat-note", record.matches === 1 ? "1 match" : `${record.matches} matches`),
      makeBar(record, false),
      buildRecordLine("", record, teamA, teamB, colors),
      percentLine(record)
    );
    if (showGoals) {
      card.append(makeEl("p", "stat-note", `Goals: ${teamA} ${record.a_goals} – ${record.b_goals} ${teamB}`));
    }
    return card;
  }

  // ---------------------------------------------------------------------
  // The subsections. Each returns the elements to put under its heading.
  // ---------------------------------------------------------------------

  const sections = {
    overview(answer) {
      const o = answer.overview;
      const grid = makeEl("div", "stat-grid");

      // Overall record: the record, its percentages and the animated bar.
      const record = makeCard("Overall record", STATS.neutralColor);
      record.classList.add("wide");
      record.append(
        makeEl("p", "stat-note", o.matches === 1 ? "1 match" : `${o.matches} matches`),
        makeBar(o, true),
        buildRecordLine("", o, teamA, teamB, colors),
        percentLine(o)
      );

      const goals = makeCard("Goals per game", STATS.neutralColor);
      const goalsValue = makeEl("p", "stat-value");
      goalsValue.append(makeEl("strong", "stat-number", o.goals_per_game.toFixed(2)), " on average");
      goals.append(goalsValue, makeEl("p", "stat-note",
        `${teamA} ${o.a_goals_per_game.toFixed(2)} · ${teamB} ${o.b_goals_per_game.toFixed(2)} per game ` +
        `(${o.a_goals + o.b_goals} goals in ${o.matches} ${o.matches === 1 ? "match" : "matches"})`));

      const clean = makeCard("Clean sheets", STATS.neutralColor);
      clean.append(
        makeEl("p", "stat-value", `${teamA} ${o.a_clean_sheets} · ${teamB} ${o.b_clean_sheets}`),
        makeEl("p", "stat-note", "Matches where the other team did not score")
      );

      const last = matchCard("Last meeting", o.last_meeting, STATS.neutralColor, "No matches");
      last.classList.add("wide");
      const days = o.days_since_last_meeting;
      last.append(makeEl("p", "stat-note",
        days === 0 ? "They met today" : `${days.toLocaleString("en-US")} ${days === 1 ? "day" : "days"} since they last met`));

      grid.append(record, goals, clean, last);
      return [grid];
    },

    record_book(answer) {
      const book = answer.record_book;
      const grid = makeEl("div", "stat-grid");
      grid.append(
        matchCard(`Biggest ${teamA} win`, book.biggest_a_win, colors.a, `${teamA} has never won`),
        matchCard(`Biggest ${teamB} win`, book.biggest_b_win, colors.b, `${teamB} has never won`),
        streakCard(`${teamA}: longest winning streak`, book.a_winning_streak, colors.a, { one: "win", many: "wins" }),
        streakCard(`${teamB}: longest winning streak`, book.b_winning_streak, colors.b, { one: "win", many: "wins" }),
        streakCard(`${teamA}: longest unbeaten streak`, book.a_unbeaten_streak, colors.a, { one: "match unbeaten", many: "matches unbeaten" }),
        streakCard(`${teamB}: longest unbeaten streak`, book.b_unbeaten_streak, colors.b, { one: "match unbeaten", many: "matches unbeaten" })
      );

      // The highest-scoring match belongs to both teams, so it spans the row.
      const highest = matchCard("Highest-scoring match", book.highest_scoring, STATS.neutralColor, "No matches");
      highest.classList.add("wide");
      if (book.highest_scoring) {
        const goals = book.highest_scoring.goals;
        highest.querySelector(".stat-value").append(makeEl("span", "stat-extra", ` · ${goals} ${goals === 1 ? "goal" : "goals"}`));
      }
      grid.prepend(highest);

      // The scoreline that happened most often, whichever team won it.
      const common = makeCard("Most common scoreline", STATS.neutralColor);
      common.classList.add("wide");
      const score = book.most_common_score;
      const value = makeEl("p", "stat-value");
      value.append(makeEl("strong", "stat-number", niceScore(score.score)),
        ` happened ${score.times === 1 ? "once" : `${score.times} times`}`);
      common.append(value, makeEl("p", "stat-note", `Counted for either team. Most recently on ${formatDate(score.last_date)}.`));
      grid.append(common);
      return [grid];
    },

    venues(answer) {
      const grid = makeEl("div", "stat-grid venues");
      for (const venue of answer.venues) {
        const color = venue.id === "home_a" ? colors.a : venue.id === "home_b" ? colors.b : STATS.neutralColor;
        grid.append(recordCard(venue.label, venue, color, { showGoals: true }));
      }
      return [
        makeEl("p", "stat-section-note", "Where the matches were played. Matches at a third country's ground count as neutral."),
        grid,
      ];
    },

    shootouts(answer) {
      const s = answer.shootouts;
      if (s.total === 0) {
        const none = makeCard("Penalty shootouts", STATS.neutralColor);
        none.append(makeEl("p", "stat-none", answer.tournament.id === "all"
          ? "No penalty shootouts in this rivalry"
          : "No penalty shootouts in these matches"));
        return [none];
      }

      const grid = makeEl("div", "stat-grid venues");
      const total = makeCard("Total shootouts", STATS.neutralColor);
      const totalValue = makeEl("p", "stat-value");
      totalValue.append(makeEl("strong", "stat-number", String(s.total)), s.total === 1 ? " shootout" : " shootouts");
      total.append(totalValue);
      if (s.first_shooter_known > 0) {
        total.append(makeEl("p", "stat-note", `The team that shot first won ${s.first_shooter_won} of ${s.first_shooter_known}`));
      }

      // Always the count WITH the percentage ("1 of 1 · 100%"), so a tiny
      // sample can't pass for a big one.
      for (const [name, wins, percent, color] of [[teamA, s.a_wins, s.a_pct, colors.a], [teamB, s.b_wins, s.b_pct, colors.b]]) {
        const card = makeCard(`${name} shootout wins`, color);
        const value = makeEl("p", "stat-value");
        value.append(makeEl("strong", "stat-number", `${wins} of ${s.total}`), " · ", makePercent(percent, wins, s.total));
        card.append(value);
        grid.append(card);
      }
      grid.prepend(total);

      // Every shootout, oldest first.
      const list = makeEl("div", "shootout-list");
      for (const shootout of s.list) {
        const row = makeEl("p", "shootout-row");
        const dot = makeEl("span", "dot");
        dot.style.background = shootout.winner === teamA ? colors.a : shootout.winner === teamB ? colors.b : colors.draw;
        row.append(dot,
          makeEl("strong", "", `${shootout.winner} won`),
          ` · ${formatDate(shootout.date)} · ${shootout.tournament} · after ${niceScore(shootout.score)}`);
        list.append(row);
      }
      return [grid, list, makeEl("p", "stat-section-note after", STATS.shootoutNote)];
    },

    competitive(answer) {
      const split = answer.competitive_vs_friendly;
      const grid = makeEl("div", "stat-grid");
      grid.append(
        recordCard("Competitive matches", split.competitive, STATS.neutralColor),
        recordCard("Friendlies", split.friendly, STATS.neutralColor)
      );
      return [
        makeEl("p", "stat-section-note", "Competitive means every match that was not a friendly: tournaments and their qualifiers."),
        grid,
      ];
    },
  };

  function draw(answer) {
    cardCount = 0;
    body.replaceChildren();

    // A filter with nothing in it: say so once, instead of ten empty cards.
    if (answer.matches === 0) {
      const empty = makeEl("div", "stat-card stats-empty");
      empty.append(makeEl("p", "stat-none", `${teamA} and ${teamB} have no ${answer.tournament.label} matches to show statistics for.`));
      body.append(empty);
      return;
    }

    for (const id of STATS.order) {
      if (!sections[id]) continue; // a typo in config.js: skip it rather than crash
      body.append(makeEl("h4", "stat-section", STATS.labels[id] || id), ...sections[id](answer));
    }
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

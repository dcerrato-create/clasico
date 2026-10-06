// timeline.js - the Explore card: tabs, tournament filter chips and the
// Match Timeline chart (drawn with Chart.js, loaded from a CDN in index.html).
// The Era Chart tab lives in era.js and the Top Scorers tab in scorers.js;
// this file switches between the three and keeps what they share: the
// tournament chip, the decade filter and the highlighted player.

let timelineChart = null; // the current Chart.js chart, so we can remove it later

// "1969-06-08" -> 1969.43 (so matches spread out inside their year)
function decimalYear(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return year + ((month - 1) * 30.4 + day) / 365;
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

function placeLine(match) {
  const place = match.city === match.country ? match.city : `${match.city}, ${match.country}`;
  return match.neutral ? `${place} (neutral venue)` : place;
}

// "Carlos Pavón 23', 67' (pen)" for one team in one match
function scorersText(match, team) {
  const byPlayer = new Map();
  for (const goal of match.scorers) {
    if (goal.team !== team) continue;
    let note = goal.minute === null ? "" : `${goal.minute}'`;
    if (goal.penalty) note += " (pen)";
    if (goal.own_goal) note += " (own goal)";
    const name = goal.scorer && goal.scorer !== "NA" ? goal.scorer : "Unknown";
    if (!byPlayer.has(name)) byPlayer.set(name, []);
    byPlayer.get(name).push(note.trim());
  }
  return [...byPlayer].map(([name, notes]) => `${name} ${notes.filter(Boolean).join(", ")}`.trim());
}

// Fills the panel under the chart with everything about one match.
// A small colored dot for one match. A match that went to penalties gets a
// ring in the color of the team that won the shootout (ringColor).
function makeMatchDot(match, colors, ringColor) {
  const dot = makeEl("span", "dot");
  dot.style.background = colors[match.winner];
  if (ringColor) {
    dot.classList.add("pens");
    dot.style.borderColor = ringColor;
  }
  return dot;
}

function showMatchDetail(panel, match, colors, ringColor) {
  panel.replaceChildren();
  panel.classList.remove("empty");

  const title = makeEl("p", "detail-score");
  title.append(makeMatchDot(match, colors, ringColor), scoreLine(match));
  panel.append(title);

  if (match.shootout_winner) {
    // Nearly always the match was a draw. Rarely (a two-legged tie) one team
    // won this match and a shootout still followed.
    const text = match.winner === "draw"
      ? `Draw · ${match.shootout_winner} won on penalties`
      : `${match.shootout_winner} won the penalty shootout that followed`;
    panel.append(makeEl("p", "detail-pens", text));
  }
  panel.append(makeEl("p", "detail-line", `${formatDate(match.date)} · ${match.tournament} · ${placeLine(match)}`));

  const scorers = makeEl("div", "detail-scorers");
  if (match.home_score + match.away_score === 0) {
    scorers.append(makeEl("p", "detail-muted", "No goals in this match."));
  } else if (match.scorers.length === 0) {
    scorers.append(makeEl("p", "detail-muted", "Goalscorers are not recorded for this match."));
  } else {
    for (const team of [match.home_team, match.away_team]) {
      const column = makeEl("div");
      column.append(makeEl("p", "detail-team", team));
      const names = scorersText(match, team);
      if (names.length === 0) column.append(makeEl("p", "detail-muted", "—"));
      for (const line of names) column.append(makeEl("p", "detail-goal", `⚽ ${line}`));
      scorers.append(column);
    }
  }
  panel.append(scorers);
}

// Turns the matches into the three groups of dots Chart.js draws.
// ringColorOf(match) gives the shootout winner's color, or null.
// isFaded(match) is true for matches to push into the background (used when
// one player's matches are highlighted).
function buildDatasets(matches, data, colors, ringColorOf, isFaded) {
  const smallScreen = window.innerWidth < 600;
  const baseRadius = smallScreen ? 4 : 6;
  const growth = smallScreen ? 1.5 : 2; // extra radius per goal of margin
  // Each result has its own row: A's wins on top, draws in the middle, B's wins below.
  const rows = { a: 2, draw: 1, b: 0 };
  const groups = {
    a: { label: `${data.team_a.name} win`, points: [] },
    draw: { label: "Draw", points: [] },
    b: { label: `${data.team_b.name} win`, points: [] },
  };
  // A small up/down nudge so matches close in time don't hide each other.
  const nudges = [0, 0.2, -0.2, 0.1, -0.1, 0.3, -0.3];

  for (const match of matches) {
    const group = groups[match.winner];
    group.points.push({
      x: decimalYear(match.date),
      y: rows[match.winner] + nudges[group.points.length % nudges.length],
      r: baseRadius + Math.min(match.margin, 6) * growth, // bigger margin, bigger dot
      ring: ringColorOf(match), // only set for matches that went to penalties
      faded: isFaded(match),
      match,
    });
  }

  return ["a", "draw", "b"].map((key) => ({
    label: groups[key].label,
    data: groups[key].points,
    // Normal dots are slightly see-through; faded ones are almost invisible.
    backgroundColor: groups[key].points.map((point) => colors[key] + (point.faded ? "24" : "d9")),
    // Normally a thin dark ring separates overlapping dots. A match that went
    // to penalties gets a thick ring in the shootout winner's color instead.
    borderColor: groups[key].points.map((point) => (point.faded ? "transparent" : point.ring || COLORS.surface)),
    borderWidth: groups[key].points.map((point) => (point.ring ? 3 : 1.5)),
    hoverBorderColor: COLORS.text,
    hoverBorderWidth: 2,
  }));
}

function renderExplore(container, data, teamColors) {
  // The filter chips for this rivalry, chosen by the backend: World Cup and
  // Friendlies always, plus the tournaments these two teams really met in.
  const categories = data.categories;
  const colors = teamColors; // { a, b, draw } - each team's own color
  const allMatches = data.matches;
  let activeFilter = "all";    // which tournament chip is on
  let activeDecade = null;     // e.g. 2000 when the Era Chart sent us here
  let activePlayer = null;     // a scorer whose matches are highlighted
  let activeTab = "timeline";  // "timeline", "era" or "scorers"

  const card = makeEl("section", "card explore");
  card.setAttribute("aria-label", "Explore the matches");

  // --- Tabs ---
  const tabs = makeEl("div", "tabs");
  const tabButtons = {
    timeline: makeEl("button", "tab", "Match Timeline"),
    era: makeEl("button", "tab", "Era Chart"),
    scorers: makeEl("button", "tab", "Top Scorers"),
  };
  for (const [name, button] of Object.entries(tabButtons)) {
    button.type = "button";
    button.addEventListener("click", () => showTab(name));
    tabs.append(button);
  }

  // Each tab has its own panel; only one is visible at a time.
  const panels = {
    timeline: makeEl("div", "tab-panel"),
    era: makeEl("div", "tab-panel"),
    scorers: makeEl("div", "tab-panel"),
  };
  const timelinePanel = panels.timeline;

  // --- Filter chips: "All" plus one per tournament ---
  const chips = makeEl("div", "chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Filter by tournament");
  const chipList = [{ id: "all", label: "All" }, ...categories];
  for (const category of chipList) {
    const count = category.id === "all"
      ? allMatches.length
      : allMatches.filter((m) => m.category === category.id).length;
    const chip = makeEl("button", "chip", `${category.label} `);
    chip.type = "button";
    chip.dataset.filter = category.id;
    chip.append(makeEl("span", "chip-count", String(count)));
    chip.disabled = count === 0; // nothing to show for this tournament
    if (category.includes) chip.title = category.includes.join(", "); // what "Other" holds
    chip.addEventListener("click", () => {
      activeFilter = category.id;
      update();
    });
    chips.append(chip);
  }

  // Shown only while the timeline is narrowed to one decade.
  const decadeFilter = makeEl("div", "decade-filter");
  const decadeText = makeEl("span", "decade-text");
  const decadeReset = makeEl("button", "secondary", "✕ Show all years");
  decadeReset.type = "button";
  decadeReset.addEventListener("click", () => {
    activeDecade = null;
    update();
  });
  decadeFilter.append(decadeText, decadeReset);

  // Shown only while one player's matches are highlighted.
  const playerFilter = makeEl("div", "decade-filter");
  const playerText = makeEl("span", "decade-text");
  const playerReset = makeEl("button", "secondary", "✕ Show all matches");
  playerReset.type = "button";
  playerReset.addEventListener("click", () => {
    activePlayer = null;
    update();
  });
  playerFilter.append(playerText, playerReset);

  // Did the highlighted player score in this match? (Own goals don't count.)
  const playerScoredIn = (match) => match.scorers.some((goal) =>
    goal.scorer === activePlayer.name && goal.team === activePlayer.team && !goal.own_goal);

  const filterSummary = makeEl("p", "filter-summary");

  // --- Legend (what the colors and sizes mean) ---
  const legend = makeEl("div", "legend");
  for (const [key, label] of [["a", `${data.team_a.name} win`], ["draw", "Draw"], ["b", `${data.team_b.name} win`]]) {
    const item = makeEl("span", "legend-item");
    const dot = makeEl("span", "dot");
    dot.style.background = colors[key];
    item.append(dot, label);
    legend.append(item);
  }
  // The shootout winner's color, for matches that went to penalties.
  const ringColorOf = (match) =>
    match.shootout_winner === data.team_a.name ? colors.a :
    match.shootout_winner === data.team_b.name ? colors.b : null;

  if (allMatches.some((m) => m.shootout_winner)) {
    const item = makeEl("span", "legend-item");
    const dot = makeEl("span", "dot pens");
    dot.style.background = colors.draw;
    dot.style.borderColor = COLORS.text;
    item.append(dot, "Went to penalties (ring color = shootout winner)");
    legend.append(item);
  }
  legend.append(makeEl("span", "legend-note", "Bigger dot = bigger goal margin"));

  const chartWrap = makeEl("div", "chart-wrap");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  chartWrap.append(canvas);

  const detail = makeEl("div", "match-detail empty", "Hover or tap a dot to see the match.");

  // --- The same matches as a table (also the fallback if the chart can't load) ---
  const tableBox = makeEl("details", "match-table");
  tableBox.append(makeEl("summary", "", "View matches as a table"));
  const tableScroll = makeEl("div", "table-scroll");
  const table = makeEl("table");
  tableScroll.append(table);
  tableBox.append(tableScroll);

  timelinePanel.append(decadeFilter, playerFilter, filterSummary, legend, chartWrap, detail, tableBox);
  card.append(tabs, chips, panels.timeline, panels.era, panels.scorers);
  container.append(card);

  // The Era Chart. Clicking one of its decades brings us back to the
  // timeline, showing only that decade.
  const eraChart = createEraChart(panels.era, data, colors, (decade) => {
    activeDecade = decade;
    showTab("timeline");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // Top Scorers. Clicking a player brings us back to the timeline with the
  // matches that player scored in highlighted.
  const scorersTab = createScorersTab(panels.scorers, data, (player) => {
    activePlayer = player;
    activeDecade = null; // show every year, so none of their matches is hidden
    showTab("timeline");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function showTab(name) {
    activeTab = name;
    for (const [tabName, panel] of Object.entries(panels)) panel.hidden = tabName !== name;
    for (const [tabName, button] of Object.entries(tabButtons)) {
      button.classList.toggle("active", tabName === name);
    }
    update();
  }

  // --- Create the chart ---
  if (timelineChart) {
    timelineChart.destroy();
    timelineChart = null;
  }
  const firstYear = Number(allMatches[0].date.slice(0, 4));
  const lastYear = Number(allMatches[allMatches.length - 1].date.slice(0, 4));

  if (typeof Chart === "undefined") {
    // The chart library didn't load (offline?). The table still works.
    chartWrap.replaceWith(makeEl("p", "chart-missing", "The chart couldn't load, so here are the matches as a table."));
    legend.hidden = true;
    detail.hidden = true;
    tableBox.open = true;
  } else {
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.color = COLORS.muted;
    timelineChart = new Chart(canvas, {
      type: "bubble",
      data: { datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        layout: { padding: { top: 6, right: 6 } },
        scales: {
          // The time axis keeps the same range for every filter,
          // so dots don't jump around when a chip is clicked.
          x: {
            min: firstYear - 1,
            max: lastYear + 2,
            ticks: { precision: 0, callback: (value) => String(value), maxRotation: 0 },
            grid: { color: "rgba(255, 255, 255, 0.06)" },
          },
          y: {
            min: -0.6,
            max: 2.6,
            ticks: { display: false, stepSize: 1 },
            grid: { color: "rgba(255, 255, 255, 0.06)" },
            border: { display: false },
          },
        },
        plugins: {
          legend: { display: false }, // we draw our own legend above
          tooltip: {
            displayColors: false,
            padding: 10,
            callbacks: {
              title: (items) => scoreLine(items[0].raw.match),
              label: (item) => {
                const match = item.raw.match;
                const lines = [`${formatDate(match.date)} · ${match.tournament}`, placeLine(match)];
                if (match.shootout_winner) lines.unshift(`${match.shootout_winner} won on penalties`);
                return lines;
              },
            },
          },
        },
        // Hovering (mouse) or tapping (touch) a dot fills the panel below.
        onHover: (event, elements) => {
          canvas.style.cursor = elements.length ? "pointer" : "default";
          if (elements.length) showFromElement(elements[0]);
        },
        onClick: (event, elements) => {
          if (elements.length) showFromElement(elements[0]);
        },
      },
    });
  }

  function showFromElement(element) {
    const point = timelineChart.data.datasets[element.datasetIndex].data[element.index];
    showMatchDetail(detail, point.match, colors, point.ring);
  }

  // --- Redraw everything that depends on the active filters ---
  function update() {
    for (const chip of chips.children) {
      chip.setAttribute("aria-pressed", String(chip.dataset.filter === activeFilter));
    }
    const filterLabel = chipList.find((c) => c.id === activeFilter).label;

    // The other two tabs draw themselves; they only need the tournament.
    if (activeTab === "era") {
      eraChart.show(activeFilter, filterLabel);
      return;
    }
    if (activeTab === "scorers") {
      scorersTab.show(activeFilter, filterLabel);
      return;
    }

    // Keep the matches that pass BOTH filters: tournament chip and decade.
    const matches = allMatches.filter((m) => {
      const year = Number(m.date.slice(0, 4));
      const tournamentOk = activeFilter === "all" || m.category === activeFilter;
      const decadeOk = activeDecade === null || (year >= activeDecade && year < activeDecade + 10);
      return tournamentOk && decadeOk;
    });

    decadeFilter.hidden = activeDecade === null;
    decadeText.textContent = `Showing only the ${activeDecade}s`;

    // Highlighting a player keeps every dot on the chart but fades the
    // matches they didn't score in.
    const highlighted = activePlayer ? matches.filter(playerScoredIn) : matches;
    playerFilter.hidden = activePlayer === null;
    if (activePlayer) {
      playerText.textContent = highlighted.length === 1
        ? `Highlighting the 1 match ${activePlayer.name} scored in`
        : `Highlighting the ${highlighted.length} matches ${activePlayer.name} scored in`;
    }

    const aWins = matches.filter((m) => m.winner === "a").length;
    const bWins = matches.filter((m) => m.winner === "b").length;
    const draws = matches.length - aWins - bWins;
    const what = activeFilter === "all" ? "all" : filterLabel;
    const onPenalties = matches.filter((m) => m.shootout_winner).length;
    const when = activeDecade === null ? "" : ` from the ${activeDecade}s`;
    filterSummary.textContent =
      `Showing ${what} ${matches.length === 1 ? "match" : `${matches.length} matches`}${when}: ` +
      `${data.team_a.name} ${aWins} · ${draws} ${draws === 1 ? "draw" : "draws"} · ${bWins} ${data.team_b.name}` +
      `${onPenalties ? ` · ${onPenalties} went to penalties` : ""}`;

    if (timelineChart) {
      // Zoom the time axis in on the decade, or back out to the whole rivalry.
      const xAxis = timelineChart.options.scales.x;
      xAxis.min = activeDecade === null ? firstYear - 1 : activeDecade - 1;
      xAxis.max = activeDecade === null ? lastYear + 2 : activeDecade + 10;
      const isFaded = (match) => activePlayer !== null && !playerScoredIn(match);
      timelineChart.data.datasets = buildDatasets(matches, data, colors, ringColorOf, isFaded);
      timelineChart.update();
      canvas.setAttribute("aria-label",
        `Timeline of ${matches.length} matches between ${data.team_a.name} and ${data.team_b.name}, ` +
        `${firstYear} to ${lastYear}. Use the table below for the full list.`);
      detail.className = "match-detail empty";
      detail.textContent = "Hover or tap a dot to see the match.";
    }

    // Table, newest match first
    table.replaceChildren();
    const headRow = makeEl("tr");
    for (const heading of ["Date", "Match", "Tournament", "City"]) headRow.append(makeEl("th", "", heading));
    table.append(headRow);
    // (when a player is highlighted, the table lists only their matches)
    for (const match of [...highlighted].reverse()) {
      const row = makeEl("tr");
      const scoreCell = makeEl("td");
      scoreCell.append(makeMatchDot(match, colors, ringColorOf(match)), scoreLine(match));
      if (match.shootout_winner) {
        scoreCell.append(makeEl("span", "table-pens", ` (${match.shootout_winner} won on penalties)`));
      }
      row.append(makeEl("td", "nowrap", formatDate(match.date)), scoreCell,
        makeEl("td", "", match.tournament), makeEl("td", "", match.city));
      table.append(row);
    }
  }

  showTab("timeline");
}

// timeline.js - the Explore card: tabs, tournament filter chips and the
// Match Timeline chart (drawn with Chart.js, loaded from a CDN in index.html).
// The Era Chart tab lives in era.js and the More Statistics tab in stats.js;
// this file switches between the three and keeps the filters they share
// (the tournament chip, and the decade filter for the timeline).

let timelineChart = null; // the current Chart.js chart, so we can remove it later

// Throw away the current chart (used when a new rivalry is drawn, and by the Home button).
function removeTimelineChart() {
  if (timelineChart) {
    timelineChart.destroy();
    timelineChart = null;
  }
}

// "1969-06-08" -> 1969.43 (so matches spread out inside their year)
function decimalYear(dateText) {
  const [year, month, day] = dateText.split("-").map(Number);
  return year + ((month - 1) * 30.4 + day) / 365;
}

// "San Salvador, El Salvador", with a note when neither team was at home
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

// A small colored dot for one match. A match that went to penalties gets a
// ring in the color of the team that won the shootout (ringColor).
function makeMatchDot(match, colors, ringColor) {
  const dot = makeDot(colors[match.winner]);
  if (ringColor) {
    dot.classList.add("pens");
    dot.style.borderColor = ringColor;
  }
  return dot;
}

// Fills the panel under the chart with everything about one match.
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
      for (const line of names) column.append(makeEl("p", "", `⚽ ${line}`));
      scorers.append(column);
    }
  }
  panel.append(scorers);
}

// Turns the matches into the three groups of dots Chart.js draws.
// ringColorOf(match) gives the shootout winner's color, or null.
function buildDatasets(matches, colors, ringColorOf) {
  const smallScreen = window.innerWidth < 600;
  const baseRadius = smallScreen ? 4 : 6;
  const growth = smallScreen ? 1.5 : 2; // extra radius per goal of margin
  // Each result has its own row: A's wins on top, draws in the middle, B's wins below.
  const rows = { a: 2, draw: 1, b: 0 };
  const points = { a: [], draw: [], b: [] };
  // A small up/down nudge so matches close in time don't hide each other.
  const nudges = [0, 0.2, -0.2, 0.1, -0.1, 0.3, -0.3];

  for (const match of matches) {
    const group = points[match.winner];
    group.push({
      x: decimalYear(match.date),
      y: rows[match.winner] + nudges[group.length % nudges.length],
      r: baseRadius + Math.min(match.margin, 6) * growth, // bigger margin, bigger dot
      ring: ringColorOf(match), // only set for matches that went to penalties
      match,
    });
  }

  return ["a", "draw", "b"].map((key) => ({
    data: points[key],
    backgroundColor: colors[key] + "d9", // slightly see-through
    // Normally a thin dark ring separates overlapping dots. A match that went
    // to penalties gets a thick ring in the shootout winner's color instead.
    borderColor: points[key].map((point) => point.ring || COLORS.surface),
    borderWidth: points[key].map((point) => (point.ring ? 3 : 1.5)),
    hoverBorderColor: COLORS.text,
    hoverBorderWidth: 2,
  }));
}

// colors = { a, b, draw }: each team's own color (see colors.js).
function renderExplore(container, data, colors) {
  const allMatches = data.matches;
  let activeFilter = "all";    // which tournament chip is on
  let activeDecade = null;     // e.g. 2000 when the Era Chart sent us here
  let activeTab = "timeline";  // "timeline", "era" or "stats"

  const card = makeEl("section", "card explore");
  card.setAttribute("aria-label", "Explore the matches");

  // --- Tabs ---
  const tabs = makeEl("div", "tabs");
  const tabButtons = {};
  // Each tab has its own panel; only one is visible at a time.
  const panels = {};
  for (const [name, label] of [["timeline", "Match Timeline"], ["era", "Era Chart"], ["stats", "More Statistics"]]) {
    tabButtons[name] = makeButton("tab", label, () => showTab(name));
    tabs.append(tabButtons[name]);
    panels[name] = makeEl("div");
  }

  // --- Filter chips: "All" plus one per tournament ---
  const chips = makeEl("div", "chips");
  chips.setAttribute("role", "group");
  chips.setAttribute("aria-label", "Filter by tournament");
  // The backend chose the chips for this rivalry and counted their matches:
  // World Cup and Friendlies always, plus the tournaments these two really met in.
  const chipList = [{ id: "all", label: "All", matches: allMatches.length }, ...data.categories];
  for (const category of chipList) {
    const chip = makeButton("chip", `${category.label} `, () => {
      activeFilter = category.id;
      update();
    });
    chip.dataset.filter = category.id;
    chip.append(makeEl("span", "chip-count", String(category.matches)));
    chip.disabled = category.matches === 0; // nothing to show for this tournament
    if (category.includes) chip.title = category.includes.join(", "); // what "Other" holds
    chips.append(chip);
  }

  // Shown only while the timeline is narrowed to one decade.
  const decadeFilter = makeEl("div", "decade-filter");
  const decadeText = makeEl("span", "decade-text");
  decadeFilter.append(decadeText, makeButton("secondary", "✕ Show all years", () => {
    activeDecade = null;
    update();
  }));

  const filterSummary = makeEl("p", "filter-summary");

  // --- Legend (what the colors and sizes mean) ---
  const legend = makeEl("div", "legend");
  for (const [key, label] of [["a", `${data.team_a.name} win`], ["draw", "Draw"], ["b", `${data.team_b.name} win`]]) {
    const item = makeEl("span", "legend-item");
    item.append(makeDot(colors[key]), label);
    legend.append(item);
  }
  // The shootout winner's color, for matches that went to penalties.
  const ringColorOf = (match) =>
    match.shootout_winner === data.team_a.name ? colors.a :
    match.shootout_winner === data.team_b.name ? colors.b : null;

  if (allMatches.some((m) => m.shootout_winner)) {
    const item = makeEl("span", "legend-item");
    const dot = makeDot(colors.draw);
    dot.classList.add("pens");
    dot.style.borderColor = COLORS.text;
    item.append(dot, "Went to penalties (ring color = shootout winner)");
    legend.append(item);
  }
  legend.append(makeEl("span", "", "Bigger dot = bigger goal margin"));

  const chartWrap = makeEl("div", "chart-wrap");
  const canvas = makeEl("canvas");
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

  panels.timeline.append(decadeFilter, filterSummary, legend, chartWrap, detail, tableBox);
  card.append(tabs, chips, panels.timeline, panels.era, panels.stats);
  container.append(card);

  // The Era Chart. Clicking one of its decades brings us back to the
  // timeline, showing only that decade.
  const eraChart = createEraChart(panels.era, data, colors, (decade) => {
    activeDecade = decade;
    showTab("timeline");
    card.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // More Statistics: the record book and the home/away split.
  const statsTab = createStatsTab(panels.stats, data, colors);

  function showTab(name) {
    activeTab = name;
    for (const [tabName, panel] of Object.entries(panels)) panel.hidden = tabName !== name;
    for (const [tabName, button] of Object.entries(tabButtons)) {
      button.classList.toggle("active", tabName === name);
    }
    update();
  }

  // --- Create the chart ---
  removeTimelineChart();
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
    if (activeTab === "stats") {
      statsTab.show(activeFilter, filterLabel);
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
      timelineChart.data.datasets = buildDatasets(matches, colors, ringColorOf);
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
    for (const match of [...matches].reverse()) {
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

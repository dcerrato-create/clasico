// era.js - the Era Chart tab: "Who owned each decade?"
//
// One row per decade. Team A's wins grow to the LEFT, Team B's wins grow to
// the RIGHT, and draws sit in gray in the middle, so the longer side shows
// who owned that decade. The numbers come from the backend (/api/eras).

// "2000s: Honduras 11 – Draws 2 – El Salvador 2"
// The word always comes before its number, so it can't be read as a score.
function eraRecordText(record, teamA, teamB) {
  if (record.matches === 0) return `${record.label}: No matches`;
  return `${record.label}: ${teamA} ${record.a_wins} – Draws ${record.draws} – ${teamB} ${record.b_wins}`;
}

// Builds the tab inside `panel`. onPickDecade(decade) is called when a decade
// is clicked. Returns { show } - call show() whenever the tab opens or the
// tournament filter changes.
function createEraChart(panel, data, teamColors, onPickDecade) {
  const teamA = data.team_a.name;
  const teamB = data.team_b.name;
  const colors = {
    a: ERA_CHART.teamAColor || teamColors.a,
    b: ERA_CHART.teamBColor || teamColors.b,
    draw: ERA_CHART.drawColor,
  };

  const answers = new Map(); // tournament id -> backend answer, so we ask once
  let requestId = 0;         // lets us ignore answers that arrive too late
  let selectedDecade = null; // the decade whose record is showing below
  let lastPointer = "mouse"; // "mouse" or "touch": how the last press was made

  // --- The fixed parts of the tab ---
  const title = makeEl("h3", "era-title", "Who owned each decade?");
  const subtitle = makeEl("p", "era-subtitle");

  const legend = makeEl("div", "legend era-legend");
  for (const [key, label] of [["a", `◀ ${teamA} wins`], ["draw", "Draws"], ["b", `${teamB} wins ▶`]]) {
    const item = makeEl("span", "legend-item");
    const dot = makeEl("span", "dot");
    dot.style.background = colors[key];
    item.append(dot, label);
    legend.append(item);
  }

  const rows = makeEl("div", "era-rows");
  const detail = makeEl("div", "match-detail era-detail empty");
  panel.append(title, subtitle, legend, rows, detail);

  function resetDetail() {
    selectedDecade = null;
    detail.className = "match-detail era-detail empty";
    detail.textContent = "Hover or tap a decade to see its record. Click it to see its matches.";
  }

  // Show one decade's exact record under the chart.
  function selectDecade(record, row) {
    selectedDecade = record.decade;
    for (const other of rows.children) other.classList.toggle("selected", other === row);

    detail.className = "match-detail era-detail";
    const button = makeEl("button", "secondary", `See the ${record.label} on the Match Timeline →`);
    button.type = "button";
    button.addEventListener("click", () => onPickDecade(record.decade));
    // The record, with each part in its own color: Team A, draws (gray), Team B.
    const line = makeEl("p", "era-record");
    line.append(`${record.label}: `);
    const parts = [
      [colors.a, `${teamA} ${record.a_wins}`],
      [colors.draw, `Draws ${record.draws}`],
      [colors.b, `${teamB} ${record.b_wins}`],
    ];
    parts.forEach(([color, text], index) => {
      if (index > 0) line.append(makeEl("span", "era-record-dash", " – "));
      const part = makeEl("span", "era-record-part", text);
      part.style.color = makeVisible(color, 0.22); // bright enough to read as text
      line.append(part);
    });
    detail.replaceChildren(line, button);
  }

  // One bar piece. It starts at width 0 and grows to `share` (0 to 1) of
  // its side; `delay` makes the decades grow one after another.
  function makeBar(kind, share, delay) {
    const bar = makeEl("span", `era-bar ${kind}`);
    bar.style.background = colors[kind];
    bar.style.transitionDuration = `${ERA_CHART.growTime}ms`;
    bar.style.transitionDelay = `${delay}ms`;
    bar.dataset.width = `${share * 100}%`;
    return bar;
  }

  function drawRows(decades) {
    rows.replaceChildren();
    resetDetail();

    // The longest half-bar in the whole chart fills its side completely.
    // Each side holds that team's wins plus half of the draws.
    const longest = Math.max(1, ...decades.map((d) => Math.max(d.a_wins, d.b_wins) + d.draws / 2));

    // The backend sends the oldest decade first; we show the newest on top.
    [...decades].reverse().forEach((record, index) => {
      const delay = reducedMotion ? 0 : index * ERA_CHART.stagger;
      const row = makeEl("button", "era-row");
      row.type = "button";
      row.setAttribute("aria-label", eraRecordText(record, teamA, teamB));
      row.append(makeEl("span", "era-label", record.label));

      const track = makeEl("span", "era-track");
      if (record.matches === 0) {
        // A decade inside the rivalry's years with nothing to count.
        row.disabled = true;
        track.append(makeEl("span", "era-empty", "No matches"));
        row.append(track);
        rows.append(row);
        return;
      }

      // Who owned it? The side with fewer wins is drawn fainter.
      const owner = record.a_wins > record.b_wins ? "a" : record.b_wins > record.a_wins ? "b" : "none";
      row.classList.add(`owner-${owner}`);

      const left = makeEl("span", "era-side left");
      const leftBars = makeEl("span", "era-bars");
      leftBars.append(
        makeBar("a", record.a_wins / longest, delay),
        makeBar("draw", record.draws / 2 / longest, delay)
      );
      left.append(makeEl("span", "era-num", String(record.a_wins)), leftBars);

      const right = makeEl("span", "era-side right");
      const rightBars = makeEl("span", "era-bars");
      rightBars.append(
        makeBar("draw", record.draws / 2 / longest, delay),
        makeBar("b", record.b_wins / longest, delay)
      );
      right.append(rightBars, makeEl("span", "era-num", String(record.b_wins)));

      track.append(left, right);
      if (record.draws > 0) track.append(makeEl("span", "era-draw-num", String(record.draws)));
      row.append(track);

      // A small pop-up over the row, so it is obvious the decade can be clicked.
      // CSS shows it while the mouse is over the row, or after a tap (".era-tip").
      const tip = makeEl("span", "era-tip", `Click to see the ${record.label} on the Match Timeline`);
      tip.setAttribute("aria-hidden", "true");
      row.append(tip);

      // Mouse: hovering shows the record and a click opens the timeline.
      // Touch: the first tap shows the record, the second opens the timeline.
      row.addEventListener("pointerdown", (event) => (lastPointer = event.pointerType));
      row.addEventListener("pointerenter", (event) => {
        if (event.pointerType === "mouse") selectDecade(record, row);
      });
      row.addEventListener("click", () => {
        if (lastPointer === "touch" && selectedDecade !== record.decade) {
          // On a phone there is no hover, so the first tap shows the pop-up.
          tip.textContent = `Tap again to see the ${record.label} on the Match Timeline`;
          for (const other of rows.children) other.classList.toggle("tapped", other === row);
          selectDecade(record, row);
        } else {
          onPickDecade(record.decade);
        }
      });
      rows.append(row);
    });

    // Let the browser draw the bars at width 0 first, then grow them.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      for (const bar of rows.querySelectorAll(".era-bar")) bar.style.width = bar.dataset.width;
      rows.classList.add("grown"); // fades the numbers in
    }));
    rows.classList.remove("grown");
  }

  // Ask the backend for the decades (once per tournament) and draw them.
  async function show(tournamentId, tournamentLabel) {
    const thisRequest = ++requestId;
    subtitle.textContent = tournamentId === "all"
      ? `All matches between ${teamA} and ${teamB}`
      : `${tournamentLabel} only`;

    try {
      if (!answers.has(tournamentId)) {
        rows.replaceChildren(makeEl("p", "era-status", "Loading the decades…"));
        const answer = await apiGet("/api/eras", { team_a: teamA, team_b: teamB, tournament: tournamentId });
        answers.set(tournamentId, answer);
      }
      if (thisRequest !== requestId) return; // a newer request replaced this one
      drawRows(answers.get(tournamentId).decades);
    } catch (err) {
      if (thisRequest !== requestId) return;
      // Error state: the reason plus a button to try again.
      const retry = makeEl("button", "secondary", "Try again");
      retry.type = "button";
      retry.addEventListener("click", () => show(tournamentId, tournamentLabel));
      const message = makeEl("p", "era-status era-error", `${err.message} `);
      message.append(retry);
      rows.replaceChildren(message);
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
  }

  return { show };
}

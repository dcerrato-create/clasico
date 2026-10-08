// unusual.js - the "Unusual Games" section at the bottom of the home screen.
//
// Seven lists of oddities from the whole dataset (see UNUSUAL in config.js
// for their order and names). One is shown at a time, chosen with the chips:
//   - One-Time Rivalries: 5 at random, plus a searchable list of all of them
//   - six rankings: the top 3 as gold, silver and bronze cards, then the rest
// Clicking any entry opens that rivalry, like a featured card does.
// The lists are computed by the backend (/api/unusual and /api/one-time).

function createUnusualSection(teams, onPickRivalry) {
  const section = document.getElementById("unusual-section");
  const chips = document.getElementById("unusual-chips");
  const intro = document.getElementById("unusual-intro");
  const body = document.getElementById("unusual-body");

  let active = UNUSUAL.order[0]; // which list is showing
  let answer = null;             // the six rankings, once loaded from the backend
  let allOneTime = null;         // every one-time rivalry, once loaded
  let started = false;           // have we loaded anything yet?
  let drawId = 0;                // lets slow answers know they are out of date

  // --- The chips that switch between the lists ---
  for (const id of UNUSUAL.order) {
    const chip = makeButton("chip", UNUSUAL.labels[id] || id, () => {
      active = id;
      draw();
    });
    chip.dataset.list = id;
    chips.append(chip);
  }

  // Press the active list's chip and show its description.
  function markActive() {
    for (const chip of chips.children) {
      chip.setAttribute("aria-pressed", String(chip.dataset.list === active));
    }
    intro.textContent = UNUSUAL.descriptions[active] || "";
  }

  // ---------------------------------------------------------------------
  // The six rankings: podium for the top 3, rows for the rest
  // ---------------------------------------------------------------------

  // One entry, as a big podium card or a row. Both are buttons.
  function buildEntry(entry, kind, index) {
    const card = makeButton(`unusual-entry ${kind}`, "", () => onPickRivalry(entry.team_a.name, entry.team_b.name));
    card.style.animationDelay = `${reducedMotion ? 0 : index * UNUSUAL.stagger}ms`;
    card.title = `Open ${entry.team_a.name} vs ${entry.team_b.name}`;

    if (kind === "podium-card") {
      // Gold for rank 1, silver for 2, bronze for 3. Tied entries share a rank.
      const medal = { 1: "gold", 2: "silver", 3: "bronze" }[entry.rank] || "bronze";
      card.style.setProperty("--medal", UNUSUAL[medal]);
    }

    const flags = makeEl("span", "unusual-flags");
    flags.append(createFlag(entry.team_a), createFlag(entry.team_b));

    const value = makeEl("span", "unusual-value");
    value.append(makeEl("strong", "", entry.value), ` ${entry.unit}`);

    const info = makeEl("span", "unusual-info");
    info.append(makeEl("span", "unusual-title", entry.title), makeEl("span", "unusual-detail", entry.detail));

    card.append(makeEl("span", "unusual-rank", String(entry.rank)), flags, value, info);
    return card;
  }

  function drawRanking(entries) {
    if (entries.length === 0) {
      body.replaceChildren(makeEl("p", "recent-status", "Nothing to show here."));
      return;
    }
    const podium = makeEl("div", "podium");
    entries.slice(0, 3).forEach((entry, index) => podium.append(buildEntry(entry, "podium-card", index)));
    const list = makeEl("div", "unusual-list");
    entries.slice(3).forEach((entry, index) => list.append(buildEntry(entry, "list-row", index + 3)));
    body.replaceChildren(podium, list);
    // The small print for this list, if config.js has one (e.g. the ghost
    // flags note). It goes at the top, right under the description.
    const note = UNUSUAL.notes && UNUSUAL.notes[active];
    if (note) body.prepend(makeEl("p", "unusual-note", note));
  }

  // ---------------------------------------------------------------------
  // One-Time Rivalries: 5 at random + the searchable list of all of them
  // ---------------------------------------------------------------------

  // One match between two teams that never met again. (This list only has
  // the teams' names, so their flags are looked up in the team list.)
  function buildMatchRow(match, index) {
    const row = makeButton("unusual-entry list-row match-row", "", () => onPickRivalry(match.home_team, match.away_team));
    row.style.animationDelay = `${reducedMotion ? 0 : Math.min(index, 8) * 40}ms`;
    row.title = `Open ${match.home_team} vs ${match.away_team}`;

    const flags = makeEl("span", "unusual-flags");
    flags.append(createFlag(findTeam(teams, match.home_team)), createFlag(findTeam(teams, match.away_team)));

    const info = makeEl("span", "unusual-info");
    info.append(
      makeEl("span", "unusual-title", scoreLine(match)),
      makeEl("span", "unusual-detail", `${formatDate(match.date)} · ${match.tournament} · ${match.city}`)
    );
    row.append(flags, info);
    return row;
  }

  function drawOneTime() {
    const thisDraw = drawId;
    const total = answer.one_time_count.toLocaleString("en-US");

    // --- 5 at random ---
    const randomButton = makeButton("primary unusual-random", `🎲 Show ${UNUSUAL.randomCount} random`, loadRandom);
    const randomList = makeEl("div", "unusual-list");

    async function loadRandom() {
      randomButton.disabled = true;
      try {
        const result = await apiGet("/api/one-time", { random: UNUSUAL.randomCount });
        if (thisDraw !== drawId) return;
        randomList.replaceChildren(...result.matches.map(buildMatchRow));
      } catch (err) {
        if (thisDraw !== drawId) return;
        randomList.replaceChildren(makeEl("p", "recent-status recent-error", err.message));
      }
      randomButton.disabled = false;
    }

    // --- All of them, with a search box ---
    const search = makeEl("input", "unusual-search");
    search.type = "search";
    search.placeholder = "Search a team…";
    search.setAttribute("aria-label", "Search the one-time rivalries by team");
    const count = makeEl("p", "unusual-count");
    const fullList = makeEl("div", "unusual-list");
    const more = makeButton("secondary", "Show more", () => {
      shown += UNUSUAL.listPageSize;
      drawFullList();
    });
    // "Show less" takes away the rows the last "Show more" added.
    const less = makeButton("secondary", "Show less", () => {
      shown = Math.max(UNUSUAL.listPageSize, shown - UNUSUAL.listPageSize);
      drawFullList();
      // Keep the buttons in view: the list just got shorter above them.
      moreLess.scrollIntoView({ behavior: "instant", block: "nearest" });
    });
    const moreLess = makeEl("div", "unusual-more");
    moreLess.append(more, less);
    let shown = UNUSUAL.listPageSize; // how many rows are on screen

    function drawFullList() {
      const query = normalizeText(search.value);
      const matches = query
        ? allOneTime.filter((m) => normalizeText(m.home_team).includes(query) || normalizeText(m.away_team).includes(query))
        : allOneTime;
      const visible = matches.slice(0, shown);
      fullList.replaceChildren(...visible.map(buildMatchRow));
      count.textContent = matches.length === 0
        ? "No one-time rivalry matches that search."
        : `Showing ${visible.length.toLocaleString("en-US")} of ${matches.length.toLocaleString("en-US")}, newest first`;
      more.hidden = visible.length >= matches.length;
      less.hidden = visible.length <= UNUSUAL.listPageSize; // nothing extra to take away
    }
    search.addEventListener("input", () => {
      shown = UNUSUAL.listPageSize; // a new search starts from the top
      drawFullList();
    });

    async function loadFullList() {
      count.textContent = "Loading the full list…";
      more.hidden = true;
      less.hidden = true;
      try {
        if (!allOneTime) allOneTime = (await apiGet("/api/one-time")).matches;
        if (thisDraw !== drawId) return;
        drawFullList();
      } catch (err) {
        if (thisDraw !== drawId) return;
        count.textContent = `${err.message} `;
        count.append(makeButton("secondary", "Try again", loadFullList));
      }
    }

    body.replaceChildren(
      makeEl("h3", "unusual-heading", "Five at random"), randomButton, randomList,
      makeEl("h3", "unusual-heading", `All ${total} one-time rivalries`), search, count, fullList, moreLess
    );
    loadRandom();
    loadFullList();
  }

  // ---------------------------------------------------------------------

  // Show the active list (loading the rankings first if we don't have them).
  async function draw() {
    const thisDraw = ++drawId;
    started = true;
    markActive();

    if (!answer) {
      body.replaceChildren(makeEl("p", "recent-status", "Loading…"));
      try {
        answer = await apiGet("/api/unusual");
      } catch (err) {
        if (thisDraw === drawId) body.replaceChildren(makeErrorLine("recent-status recent-error", err.message, draw));
        return;
      }
      if (thisDraw !== drawId) return;
    }

    if (active === "one_time") drawOneTime();
    else drawRanking(answer.lists[active] || []);
  }

  // Back to the first list (used by the Home button).
  function reset() {
    active = UNUSUAL.order[0];
    if (started) draw();
  }

  // Don't load anything until the visitor scrolls near the section: it is
  // at the bottom of the page and many visits never get there.
  markActive();
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        observer.disconnect();
        draw();
      }
    }, { rootMargin: "300px" });
    observer.observe(section);
  } else {
    draw();
  }

  return { reset };
}

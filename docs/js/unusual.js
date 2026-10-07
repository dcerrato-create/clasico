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

  // A team as the flag helper wants it. The rankings include the flag code;
  // the one-time list only has names, so look the team up.
  const teamNamed = (name) => teams.find((t) => t.name === name) || { name, code: null };

  // --- The chips that switch between the lists ---
  for (const id of UNUSUAL.order) {
    const chip = makeEl("button", "chip", UNUSUAL.labels[id] || id);
    chip.type = "button";
    chip.dataset.list = id;
    chip.addEventListener("click", () => {
      active = id;
      draw();
    });
    chips.append(chip);
  }

  function showError(err, retry) {
    const message = makeEl("p", "recent-status recent-error", `${err.message} `);
    const button = makeEl("button", "secondary", "Try again");
    button.type = "button";
    button.addEventListener("click", retry);
    message.append(button);
    body.replaceChildren(message);
  }

  // ---------------------------------------------------------------------
  // The six rankings: podium for the top 3, rows for the rest
  // ---------------------------------------------------------------------

  // One entry, as a big podium card or a row. Both are buttons.
  function buildEntry(entry, kind, index) {
    const card = makeEl("button", `unusual-entry ${kind}`);
    card.type = "button";
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
    card.addEventListener("click", () => onPickRivalry(entry.team_a.name, entry.team_b.name));
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

  // One match between two teams that never met again.
  function buildMatchRow(match, index) {
    const row = makeEl("button", "unusual-entry list-row match-row");
    row.type = "button";
    row.style.animationDelay = `${reducedMotion ? 0 : Math.min(index, 8) * 40}ms`;
    row.title = `Open ${match.home_team} vs ${match.away_team}`;

    const flags = makeEl("span", "unusual-flags");
    flags.append(createFlag(teamNamed(match.home_team)), createFlag(teamNamed(match.away_team)));

    const info = makeEl("span", "unusual-info");
    info.append(
      makeEl("span", "unusual-title", `${match.home_team} ${match.home_score}–${match.away_score} ${match.away_team}`),
      makeEl("span", "unusual-detail", `${formatDate(match.date)} · ${match.tournament} · ${match.city}`)
    );
    row.append(flags, info);
    row.addEventListener("click", () => onPickRivalry(match.home_team, match.away_team));
    return row;
  }

  function drawOneTime() {
    const thisDraw = drawId;
    const total = answer.one_time_count.toLocaleString("en-US");

    // --- 5 at random ---
    const randomButton = makeEl("button", "primary unusual-random", `🎲 Show ${UNUSUAL.randomCount} random`);
    randomButton.type = "button";
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
    randomButton.addEventListener("click", loadRandom);

    // --- All of them, with a search box ---
    const search = document.createElement("input");
    search.type = "search";
    search.className = "unusual-search";
    search.placeholder = "Search a team…";
    search.setAttribute("aria-label", "Search the one-time rivalries by team");
    const count = makeEl("p", "unusual-count");
    const fullList = makeEl("div", "unusual-list");
    const more = makeEl("button", "secondary unusual-more", "Show more");
    more.type = "button";
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
    }
    search.addEventListener("input", () => {
      shown = UNUSUAL.listPageSize; // a new search starts from the top
      drawFullList();
    });
    more.addEventListener("click", () => {
      shown += UNUSUAL.listPageSize;
      drawFullList();
    });

    async function loadFullList() {
      count.textContent = "Loading the full list…";
      more.hidden = true;
      try {
        if (!allOneTime) allOneTime = (await apiGet("/api/one-time")).matches;
        if (thisDraw !== drawId) return;
        drawFullList();
      } catch (err) {
        if (thisDraw !== drawId) return;
        count.textContent = `${err.message} `;
        const retry = makeEl("button", "secondary", "Try again");
        retry.type = "button";
        retry.addEventListener("click", loadFullList);
        count.append(retry);
      }
    }

    body.replaceChildren(
      makeEl("h3", "unusual-heading", "Five at random"), randomButton, randomList,
      makeEl("h3", "unusual-heading", `All ${total} one-time rivalries`), search, count, fullList, more
    );
    loadRandom();
    loadFullList();
  }

  // ---------------------------------------------------------------------

  // Show the active list (loading the rankings first if we don't have them).
  async function draw() {
    const thisDraw = ++drawId;
    started = true;
    for (const chip of chips.children) {
      chip.setAttribute("aria-pressed", String(chip.dataset.list === active));
    }
    intro.textContent = UNUSUAL.descriptions[active] || "";

    if (!answer) {
      body.replaceChildren(makeEl("p", "recent-status", "Loading…"));
      try {
        answer = await apiGet("/api/unusual");
      } catch (err) {
        if (thisDraw === drawId) showError(err, draw);
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
  for (const chip of chips.children) chip.setAttribute("aria-pressed", String(chip.dataset.list === active));
  intro.textContent = UNUSUAL.descriptions[active] || "";
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

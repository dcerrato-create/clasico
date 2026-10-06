// scorers.js - the Top Scorers tab: "Rivalry Legends".
//
// A podium for the top 3 scorers and a ranked list for the rest. The list
// comes from the backend (/api/scorers). Photos are fetched afterwards, in
// two steps, so the tab never waits for Wikipedia:
//   1. /api/photos - one quick request for every player on screen
//   2. /api/photo  - a slower search, only for players step 1 couldn't find

// "1997–2005", or just "2000" when it was a single year
function activeSpan(player) {
  return player.first_year === player.last_year
    ? String(player.first_year)
    : `${player.first_year}–${player.last_year}`;
}

// The gray box shown until (or instead of) a real photo.
// While we are still looking it only shows the icon ("loading"); the words
// "Photo not available" appear once we know there is no photo.
function photoPlaceholder() {
  const box = makeEl("span", "player-photo placeholder loading");
  box.append(makeEl("span", "placeholder-icon", "👤"), makeEl("span", "placeholder-text", "Photo not available"));
  return box;
}

// Builds the tab inside `panel`. onPickPlayer(player) is called when a player
// is clicked. Returns { show } - call show() whenever the tab opens or the
// tournament filter changes.
function createScorersTab(panel, data, onPickPlayer) {
  const teamA = data.team_a;
  const teamB = data.team_b;
  const teamByName = { [teamA.name]: teamA, [teamB.name]: teamB };

  const answers = new Map(); // tournament id -> backend answer, so we ask once
  const photos = new Map();  // "name|team" -> photo address (or null), for this visit
  let requestId = 0;         // lets us ignore answers that arrive too late

  // --- The fixed parts of the tab ---
  const title = makeEl("h3", "era-title", "Rivalry Legends");
  const subtitle = makeEl("p", "era-subtitle");
  const disclaimer = makeEl("p", "scorers-disclaimer", SCORERS.disclaimer);
  const missing = makeEl("p", "scorers-missing"); // "Scorer data missing for 12 of 110 matches."
  const body = makeEl("div", "scorers-body");
  const credit = makeEl("p", "scorers-credit", SCORERS.photoCredit);
  panel.append(title, subtitle, disclaimer, missing, body, credit);

  // One player, as a big podium card or a small list row. Both are buttons.
  function buildPlayer(player, kind, index) {
    const card = makeEl("button", `player ${kind}`);
    card.type = "button";
    card.style.animationDelay = `${reducedMotion ? 0 : index * SCORERS.stagger}ms`;
    card.title = `See the matches ${player.name} scored in`;

    if (kind === "podium-card") {
      // Gold for rank 1, silver for 2, bronze for 3. Tied players share a rank,
      // so two players can both be gold.
      const medal = { 1: "gold", 2: "silver", 3: "bronze" }[player.rank] || "bronze";
      card.classList.add(medal);
      card.style.setProperty("--medal", SCORERS[medal]);
    }

    const photoSlot = makeEl("span", "player-photo-slot");
    photoSlot.dataset.player = `${player.name}|${player.team}`;
    photoSlot.dataset.alt = `Photo of ${player.name}`;
    photoSlot.append(photoPlaceholder());

    const name = makeEl("span", "player-name");
    name.append(createFlag(teamByName[player.team] || { name: player.team, code: null }), player.name);

    const goals = makeEl("span", "player-goals");
    goals.append(makeEl("strong", "", String(player.goals)), player.goals === 1 ? " goal" : " goals");

    const penalties = player.penalties === 1 ? "1 penalty" : `${player.penalties} penalties`;
    const facts = makeEl("span", "player-facts", `${penalties} · ${activeSpan(player)}`);

    const info = makeEl("span", "player-info");
    info.append(name, goals, facts);
    card.append(makeEl("span", "player-rank", String(player.rank)), photoSlot, info);
    card.addEventListener("click", () => onPickPlayer(player));
    return card;
  }

  // Put a photo (or leave the placeholder) in every slot for this player.
  function showPhoto(key, address) {
    photos.set(key, address);
    if (!address) return;
    for (const slot of body.querySelectorAll(".player-photo-slot")) {
      if (slot.dataset.player !== key) continue;
      const img = document.createElement("img");
      img.className = "player-photo";
      img.alt = slot.dataset.alt;
      img.referrerPolicy = "no-referrer";
      // Only swap the placeholder out once the picture has really loaded.
      img.addEventListener("load", () => slot.replaceChildren(img));
      img.src = address;
    }
  }

  // Fetch the photos for the players on screen, then mark every placeholder
  // that is still there as final ("Photo not available").
  async function loadPhotos(tournamentId, players, thisRequest) {
    await fetchPhotos(tournamentId, players, thisRequest);
    if (thisRequest !== requestId) return;
    for (const box of body.querySelectorAll(".placeholder.loading")) box.classList.remove("loading");
  }

  // Any failure in here just leaves the placeholders in place: the tab
  // itself never breaks because of a photo.
  async function fetchPhotos(tournamentId, players, thisRequest) {
    // Photos we already have from another filter show immediately.
    for (const player of players) {
      const key = `${player.name}|${player.team}`;
      if (photos.has(key)) showPhoto(key, photos.get(key));
    }
    if (players.every((p) => photos.has(`${p.name}|${p.team}`))) return;

    let results;
    try {
      const answer = await apiGet("/api/photos", {
        team_a: teamA.name, team_b: teamB.name, tournament: tournamentId, limit: SCORERS.playersShown,
      });
      results = answer.photos;
    } catch (err) {
      return; // backend or Wikipedia trouble: keep the placeholders
    }

    const needSearch = [];
    for (const result of results) {
      const key = `${result.name}|${result.team}`;
      if (result.status === "search") needSearch.push(result);
      else if (result.status !== "unavailable") showPhoto(key, result.photo);
    }

    // The slower search, one player at a time so Wikipedia isn't flooded.
    for (const player of needSearch) {
      if (thisRequest !== requestId) return; // the visitor moved on
      try {
        const result = await apiGet("/api/photo", { name: player.name, team: player.team });
        if (result.status !== "unavailable") showPhoto(`${player.name}|${player.team}`, result.photo);
      } catch (err) {
        // keep the placeholder
      }
    }
  }

  function draw(answer, tournamentId, thisRequest) {
    body.replaceChildren();
    missing.hidden = answer.matches_missing_scorers === 0;
    missing.textContent =
      `Scorer data missing for ${answer.matches_missing_scorers} of ${answer.total_matches} ` +
      `${answer.total_matches === 1 ? "match" : "matches"}.`;

    const players = answer.scorers;
    if (players.length === 0) {
      // Nothing recorded for this rivalry (or this filter): say so kindly.
      const empty = makeEl("div", "scorers-empty");
      empty.append(
        makeEl("p", "scorers-empty-title", "No goalscorers on record here"),
        makeEl("p", "", answer.matches_with_goals === 0
          ? "No goals were scored in these matches."
          : "The dataset doesn't list who scored in these matches. Try another tournament filter or \"All\".")
      );
      body.append(empty);
      credit.hidden = true;
      return;
    }
    credit.hidden = false;

    const podium = makeEl("div", "podium");
    players.slice(0, 3).forEach((player, index) => podium.append(buildPlayer(player, "podium-card", index)));
    body.append(podium);

    if (players.length > 3) {
      const list = makeEl("div", "scorers-list");
      players.slice(3).forEach((player, index) => list.append(buildPlayer(player, "list-row", index + 3)));
      body.append(list);
    }

    if (answer.tied_not_shown > 0) {
      const last = players[players.length - 1];
      body.append(makeEl("p", "scorers-more",
        `${answer.tied_not_shown} more ${answer.tied_not_shown === 1 ? "player is" : "players are"} ` +
        `tied on ${last.goals} ${last.goals === 1 ? "goal" : "goals"}.`));
    }

    loadPhotos(tournamentId, players, thisRequest);
  }

  // Ask the backend for the scorers (once per tournament) and draw them.
  async function show(tournamentId, tournamentLabel) {
    const thisRequest = ++requestId;
    subtitle.textContent = tournamentId === "all"
      ? `Top scorers in ${teamA.name} vs ${teamB.name}`
      : `Top scorers in ${tournamentLabel} matches`;

    try {
      if (!answers.has(tournamentId)) {
        body.replaceChildren(makeEl("p", "era-status", "Loading the scorers…"));
        missing.hidden = true;
        const answer = await apiGet("/api/scorers", {
          team_a: teamA.name, team_b: teamB.name, tournament: tournamentId, limit: SCORERS.playersShown,
        });
        answers.set(tournamentId, answer);
      }
      if (thisRequest !== requestId) return; // a newer request replaced this one
      draw(answers.get(tournamentId), tournamentId, thisRequest);
    } catch (err) {
      if (thisRequest !== requestId) return;
      // Error state: the reason plus a button to try again.
      const retry = makeEl("button", "secondary", "Try again");
      retry.type = "button";
      retry.addEventListener("click", () => show(tournamentId, tournamentLabel));
      const message = makeEl("p", "era-status era-error", `${err.message} `);
      message.append(retry);
      body.replaceChildren(message);
      missing.hidden = true;
      credit.hidden = true;
    }
  }

  return { show };
}

// picker.js - the searchable team dropdown and the featured rivalry cards.

// Lowercase and remove accents so "curacao" finds "Curaçao".
function normalizeText(text) {
  return text.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Teams whose name or former name matches what was typed.
// Names that START with the text come first.
function searchTeams(teams, text) {
  const query = normalizeText(text);
  if (!query) return teams.map((team) => ({ team, alias: null }));

  const startsWith = [];
  const contains = [];
  for (const team of teams) {
    const name = normalizeText(team.name);
    if (name.startsWith(query)) {
      startsWith.push({ team, alias: null });
    } else if (name.includes(query)) {
      contains.push({ team, alias: null });
    } else {
      const alias = team.aliases.find((a) => normalizeText(a).includes(query));
      if (alias) contains.push({ team, alias });
    }
  }
  return startsWith.concat(contains);
}

// Turns one .combo element into a working searchable dropdown.
// Returns { getValue, setValue } so main.js can read and set the team.
function createTeamPicker(root, teams) {
  const input = root.querySelector("input");
  const list = root.querySelector(".combo-list");
  const flagSlot = root.querySelector(".combo-flag");
  let results = [];
  let activeIndex = -1; // which option the keyboard is on

  function showFlagFor(name) {
    const team = teams.find((t) => t.name === name);
    flagSlot.replaceChildren(team ? createFlag(team) : "");
  }

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    activeIndex = -1;
  }

  function choose(team) {
    input.value = team.name;
    showFlagFor(team.name);
    close();
  }

  function setActive(index) {
    activeIndex = index;
    [...list.children].forEach((li, i) => {
      li.classList.toggle("active", i === index);
      if (i === index) li.scrollIntoView({ block: "nearest" });
    });
  }

  function open() {
    results = searchTeams(teams, input.value);
    list.replaceChildren();
    if (results.length === 0) {
      const empty = document.createElement("li");
      empty.className = "combo-empty";
      empty.textContent = teams.length ? "No team matches that" : "Teams couldn't be loaded";
      list.append(empty);
    }
    for (const { team, alias } of results) {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.append(createFlag(team), team.name);
      if (alias) {
        const note = document.createElement("small");
        note.textContent = `also: ${alias}`;
        li.append(note);
      }
      // mousedown (not click) so it fires before the input loses focus
      li.addEventListener("mousedown", (event) => {
        event.preventDefault();
        choose(team);
      });
      list.append(li);
    }
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    activeIndex = -1;
  }

  input.addEventListener("focus", () => {
    input.select();
    open();
  });
  input.addEventListener("input", () => {
    showFlagFor(input.value); // flag only shows for an exact team name
    open();
  });
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (list.hidden) open();
      if (results.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((activeIndex + step + results.length) % results.length);
    } else if (event.key === "Enter" && !list.hidden && activeIndex >= 0) {
      event.preventDefault(); // pick the option instead of submitting the form
      choose(results[activeIndex].team);
    } else if (event.key === "Escape") {
      close();
    }
  });

  return {
    getValue: () => input.value.trim(),
    setValue: (name) => {
      input.value = name;
      showFlagFor(name);
    },
  };
}

// Builds one row of rivalry cards. `rivalries` is one of the lists in
// config.js (FEATURED_CLASICOS or FIERCE_RIVALRIES).
function renderFeatured(container, rivalries, teams, onPick) {
  container.replaceChildren();
  for (const rivalry of rivalries) {
    // If the team list didn't load we still show the card, with placeholder flags.
    const teamA = teams.find((t) => t.name === rivalry.a) || { name: rivalry.a, code: null };
    const teamB = teams.find((t) => t.name === rivalry.b) || { name: rivalry.b, code: null };

    const card = document.createElement("button");
    card.type = "button";
    card.className = "featured-card";
    // Each half of the card is tinted with that team's color.
    const teamColors = pickTeamColors(teamA, teamB);
    card.style.setProperty("--team-a", teamColors.a);
    card.style.setProperty("--team-b", teamColors.b);

    const flags = document.createElement("span");
    flags.className = "featured-flags";
    flags.append(createFlag(teamA), makeEl("span", "featured-vs", "VS"), createFlag(teamB));

    const title = document.createElement("span");
    title.className = "featured-title";
    title.textContent = `${teamA.name} vs ${teamB.name}`;

    const tagline = document.createElement("span");
    tagline.className = "featured-tagline";
    tagline.textContent = rivalry.tagline;

    card.append(flags, title);
    if (rivalry.tagline) card.append(tagline); // only the named clásicos have one
    card.addEventListener("click", () => onPick(rivalry.a, rivalry.b));
    container.append(card);
  }
}

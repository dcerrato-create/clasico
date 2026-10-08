// flags.js - builds a flag image for a team, or a neutral placeholder.
// Flag images come from flagcdn.com using the country code the backend
// sends for each team (England is "gb-eng", Scotland "gb-sct", etc.).
// Countries that no longer exist have no code, so for those the backend
// sends the name of an image file kept in docs/flags/ instead.

function flagPlaceholder(teamName) {
  const el = makeEl("span", "flag flag-placeholder", "⚽");
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", `No flag available for ${teamName}`);
  return el;
}

// team = { name, code, flag_file }. Both may be missing when we have no flag.
function createFlag(team) {
  if (!team || (!team.code && !team.flag_file)) {
    return flagPlaceholder(team ? team.name : "this team");
  }
  const img = makeEl("img", "flag");
  img.alt = `Flag of ${team.name}`;
  img.src = team.flag_file || `https://flagcdn.com/${team.code}.svg`;
  // If the image fails to load, swap in the placeholder.
  img.addEventListener("error", () => img.replaceWith(flagPlaceholder(team.name)));
  return img;
}

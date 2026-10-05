// colors.js - decides which color each team wears on screen.
//
// Rules:
//   1. Team A gets its main color (the first one in its list).
//   2. Team B gets its main color too, unless it is the same kind of color
//      as Team A's (both blue, both red...). Then Team B gets its next color
//      that is different.
//   3. Very dark colors are brightened so they show on the dark background.

// "#0073cf" -> { h: 0-360 (hue), s: 0-1 (saturation), l: 0-1 (lightness) }
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l }; // a gray: no hue
  const d = max - min;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

function hslToHex({ h, s, l }) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] :
    h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b]
    .map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0"))
    .join("");
}

// The everyday name of a color. Two colors "clash" when they share a family.
function colorFamily(hex) {
  const { h, s, l } = hexToHsl(hex);
  if (l > 0.9 || (s < 0.15 && l > 0.6)) return "white";
  if (l < 0.1 || s < 0.15) return "black";
  if (h < 15 || h >= 340) return "red";
  if (h < 45) return "orange";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 260) return "blue"; // sky blue, royal blue and navy all count as blue
  return "purple";
}

// Dark colors (like navy) would vanish on our dark page, so lift them.
function makeVisible(hex) {
  const hsl = hexToHsl(hex);
  if (hsl.l >= 0.32) return hex;
  return hslToHex({ ...hsl, l: 0.32 });
}

// Returns { a, b, draw } - the colors to use for this pair of teams.
function pickTeamColors(teamA, teamB) {
  const listA = teamA.colors && teamA.colors.length ? teamA.colors : [COLORS.fallbackTeamA];
  const listB = teamB.colors && teamB.colors.length ? teamB.colors : [COLORS.fallbackTeamB];

  const colorA = listA[0];
  const familyA = colorFamily(colorA);

  // Team B: its first color that isn't the same family as Team A's color.
  let colorB = listB.find((color) => colorFamily(color) !== familyA);
  if (!colorB) {
    // Every Team B color clashes: fall back to something that can't.
    colorB = [COLORS.fallbackTeamB, "#ffffff"].find((color) => colorFamily(color) !== familyA);
  }

  return { a: makeVisible(colorA), b: makeVisible(colorB), draw: COLORS.draw };
}

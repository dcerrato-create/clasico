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

// How bright a color looks to the eye, from 0 (black) to 1 (white).
// Blue looks much darker than green at the same strength, so each of
// red, green and blue counts for a different amount.
function brightness(hex) {
  const channel = (start) => {
    const v = parseInt(hex.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

// Dark colors (like navy) would vanish on our dark page, so lighten them
// step by step until they are bright enough to see. Colored TEXT needs to be
// brighter than a colored bar, so callers can ask for a higher minimum.
function makeVisible(hex, minimum = 0.1) {
  const hsl = hexToHsl(hex);
  let color = hex;
  while (brightness(color) < minimum && hsl.l < 0.7) {
    hsl.l += 0.02;
    color = hslToHex(hsl);
  }
  return color;
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

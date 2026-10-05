// Where the backend lives. Change this one line when the backend is deployed.
const BACKEND_URL = "http://127.0.0.1:5001";

/* ==========================================================================
   CONFIG - things you may want to edit yourself
   ========================================================================== */

// The app's own colors: dark blue, black and white.
// (Each TEAM's color comes from backend/data/team_colors.json instead.)
const COLORS = {
  background: "#04060c",  // page background (almost black)
  navy: "#0a1b3d",        // dark blue used for glows and panels
  surface: "#081226",     // cards
  text: "#ffffff",        // main text
  muted: "#9db0d3",       // secondary text
  accent: "#ffffff",      // buttons and highlights
  draw: "#7f8aa0",        // draws (gray)

  // Used only when a team has no colors in team_colors.json.
  fallbackTeamA: "#4da3ff",
  fallbackTeamB: "#ff9040",
};

// Rivalries shown on the home screen. Names must match the dataset
// (for example "United States", not "USA").
const FEATURED_RIVALRIES = [
  { a: "Honduras", b: "El Salvador", tagline: "El Clásico Centroamericano" },
  { a: "Mexico", b: "United States", tagline: "El Clásico de la CONCACAF" },
  { a: "Argentina", b: "Brazil", tagline: "Superclásico de las Américas" },
];

// The cinematic flag clash. Times are in milliseconds.
const CLASH = {
  enabled: true,     // false = skip the full-screen clash
  chargeTime: 1500,  // flags sliding in, winding up and dashing
  holdTime: 1800,    // how long the big flags stay after the hit
  shrinkTime: 700,   // flags shrinking into the card
  sparks: 170,       // number of sparks at the moment of impact
};

/* ========================== end of CONFIG ================================ */

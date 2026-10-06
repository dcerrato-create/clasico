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

// The two lists of rivalries on the home screen. Team names must match the
// dataset (for example "United States", not "USA").

// "Featured Clásicos": rivalries that have their own name (the tagline).
const FEATURED_CLASICOS = [
  { a: "Honduras", b: "Costa Rica", tagline: "El Clásico Centroamericano" },
  { a: "Mexico", b: "United States", tagline: "El Clásico de la CONCACAF" },
  { a: "Argentina", b: "Brazil", tagline: "Superclásico de las Américas" },
  { a: "Argentina", b: "Uruguay", tagline: "Clásico del Río de la Plata" },
];

// "Famous Fierce Rivalries": no special name, so no tagline.
const FIERCE_RIVALRIES = [
  { a: "Argentina", b: "England" },
  { a: "France", b: "Italy" },
  { a: "Chile", b: "Peru" },
  { a: "Denmark", b: "Sweden" },
  { a: "Germany", b: "Netherlands" },
  { a: "Japan", b: "South Korea" },
  { a: "Serbia", b: "Croatia" },
  { a: "Egypt", b: "Algeria" },
  { a: "England", b: "Scotland" },
];

// The cinematic flag clash. Times are in milliseconds.
const CLASH = {
  enabled: true,     // false = skip the full-screen clash
  chargeTime: 1500,  // flags sliding in, winding up and dashing
  holdTime: 1800,    // how long the big flags stay after the hit
  shrinkTime: 700,   // flags shrinking into the card
  sparks: 170,       // number of sparks at the moment of impact
};

// The Era Chart ("Who owned each decade?"). Times are in milliseconds.
const ERA_CHART = {
  teamAColor: "",        // "" = Team A's own color. Or force one, e.g. "#4da3ff"
  teamBColor: "",        // "" = Team B's own color
  drawColor: "#7f8aa0",  // draws, in the middle of each bar
  // How solid the losing side of a decade is: 1 = same as the winner,
  // 0.5 = half see-through. Careful: a faded WHITE team looks like the gray draws.
  fadedSide: 1,
  growTime: 650,         // how long one decade's bar takes to grow
  stagger: 120,          // delay between one decade and the next
};

// The More Statistics tab.
const STATS = {
  // The subsections, in the order they appear. Remove a line to hide one.
  order: ["overview", "record_book", "venues", "shootouts", "competitive"],

  // The heading of each subsection.
  labels: {
    overview: "Overview",
    record_book: "Record Book",
    venues: "Home and Away",
    shootouts: "Penalty Shootouts",
    competitive: "Competitive vs Friendly",
  },

  // Colors. Team A and Team B always use their own team colors.
  drawColor: "#7f8aa0",     // draws in the percentage bars
  neutralColor: "#7f8aa0",  // the stripe on cards that belong to neither team

  barGrowTime: 800,         // milliseconds a percentage bar takes to grow in
  cardStagger: 70,          // milliseconds between one card appearing and the next

  shootoutNote: "Shootout data shows the winner only, not the shootout score.",
};

/* ========================== end of CONFIG ================================ */
